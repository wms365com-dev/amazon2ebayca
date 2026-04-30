import { randomUUID } from "crypto";

import {
  ApiLogSource,
  Marketplace,
  MatchMethod,
  OpportunityStatus,
  Prisma,
  ScanJobStatus
} from "@prisma/client";

import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { EbayService } from "./ebay/ebayService";
import { AmazonService } from "./amazon/amazonService";
import { MatchingEngine } from "./matching/engine";
import {
  compareVariants,
  computeMatchConfidence,
  computeTitleSimilarity,
  extractBrand,
  extractModel,
  extractPackCount
} from "./matching/helpers";
import { calculateArbitrageProfit } from "./calculator/profitCalculator";
import { assessArbitrageRisk } from "./risk/riskEngine";
import { createApiLog } from "./apiLogService";
import { getAppSettings } from "./settingsService";
import {
  ListingMatchEvidence,
  NormalizedEbayListing,
  NormalizedMarketplaceListing,
  ScanSummary
} from "../types/domain";

const ebayService = new EbayService();
const amazonService = new AmazonService();
const matchingEngine = new MatchingEngine(amazonService);

interface ScanLease {
  token: string;
  expiresAt: Date;
}

export class ScanAlreadyRunningError extends Error {
  constructor(savedSearchId: number) {
    super(`A scan is already running for scan profile ${savedSearchId}`);
    this.name = "ScanAlreadyRunningError";
  }
}

function parseStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function buildTaxCost(price: number, shipping: number, applySalesTax: boolean, salesTaxRate: number) {
  if (!applySalesTax) {
    return 0;
  }

  return Number(((price + shipping) * salesTaxRate).toFixed(2));
}

function getNextLeaseExpiry(from = new Date()) {
  return new Date(from.getTime() + env.scanLockTimeoutMinutes * 60_000);
}

async function acquireScanLease(savedSearchId: number): Promise<ScanLease> {
  const now = new Date();
  const token = randomUUID();
  const expiresAt = getNextLeaseExpiry(now);
  const acquired = await prisma.savedSearch.updateMany({
    where: {
      id: savedSearchId,
      OR: [{ scanLeaseExpiresAt: null }, { scanLeaseExpiresAt: { lte: now } }]
    },
    data: {
      scanLeaseToken: token,
      scanLeaseExpiresAt: expiresAt
    }
  });

  if (acquired.count === 0) {
    throw new ScanAlreadyRunningError(savedSearchId);
  }

  await prisma.scanJob.updateMany({
    where: {
      savedSearchId,
      status: ScanJobStatus.RUNNING,
      finishedAt: null
    },
    data: {
      status: ScanJobStatus.FAILED,
      finishedAt: now,
      errorMessage: "Marked failed after scan lease takeover"
    }
  });

  return { token, expiresAt };
}

async function refreshScanLease(savedSearchId: number, lease: ScanLease) {
  const expiresAt = getNextLeaseExpiry();
  const refreshed = await prisma.savedSearch.updateMany({
    where: {
      id: savedSearchId,
      scanLeaseToken: lease.token
    },
    data: {
      scanLeaseExpiresAt: expiresAt
    }
  });

  if (refreshed.count === 0) {
    throw new Error(`Scan lease expired for scan profile ${savedSearchId}`);
  }

  lease.expiresAt = expiresAt;
}

async function releaseScanLease(savedSearchId: number, lease: ScanLease) {
  await prisma.savedSearch.updateMany({
    where: {
      id: savedSearchId,
      scanLeaseToken: lease.token
    },
    data: {
      scanLeaseToken: null,
      scanLeaseExpiresAt: null
    }
  });
}

async function withScanLease<T>(savedSearchId: number, callback: (lease: ScanLease) => Promise<T>) {
  const lease = await acquireScanLease(savedSearchId);

  try {
    return await callback(lease);
  } finally {
    await releaseScanLease(savedSearchId, lease);
  }
}

function mapEbayListing(listing: NormalizedEbayListing): NormalizedMarketplaceListing {
  return {
    marketplace: Marketplace.EBAY_CA,
    externalListingId: listing.ebayItemId,
    listingKind: "OFFER",
    title: listing.title,
    subtitle: listing.subtitle ?? null,
    condition: listing.condition ?? null,
    buyingOptions: listing.buyingOptions,
    currentPrice: listing.currentPrice,
    shippingCost: listing.shippingCost ?? 0,
    listingUrl: listing.itemWebUrl,
    imageUrl: listing.imageUrl ?? null,
    sellerName: listing.sellerUsername ?? null,
    sellerFeedbackPercentage: listing.sellerFeedbackPercentage ?? null,
    sellerFeedbackScore: listing.sellerFeedbackScore ?? null,
    gtin: listing.gtin ?? null,
    brand: listing.brand ?? null,
    mpn: listing.mpn ?? null,
    upc: listing.upc ?? null,
    categoryPath: listing.categoryPath ?? null,
    locationCountry: listing.locationCountry ?? null,
    quantityAvailable: null,
    packageQuantity: extractPackCount(listing.title),
    variant: null,
    listingEndAt: listing.listingEndAt ?? null,
    rawJson: listing.rawJson
  };
}

function mapAmazonCandidateToListing(
  asin: string,
  title: string,
  price: number,
  imageUrl?: string | null,
  brand?: string | null,
  model?: string | null,
  identifiers?: string[],
  packageQuantity?: number | null,
  variant?: string | null,
  rawJson?: unknown
): NormalizedMarketplaceListing {
  return {
    marketplace: Marketplace.AMAZON_CA,
    externalListingId: asin,
    listingKind: "CATALOG",
    title,
    subtitle: null,
    condition: "NEW",
    buyingOptions: ["CATALOG"],
    currentPrice: price,
    shippingCost: 0,
    listingUrl: `https://www.amazon.ca/dp/${asin}`,
    imageUrl: imageUrl ?? null,
    sellerName: null,
    sellerFeedbackPercentage: null,
    sellerFeedbackScore: null,
    gtin: identifiers?.[0] ?? null,
    brand: brand ?? null,
    mpn: model ?? null,
    upc: identifiers?.[0] ?? null,
    categoryPath: null,
    locationCountry: "CA",
    quantityAvailable: null,
    packageQuantity: packageQuantity ?? extractPackCount(title),
    variant: variant ?? null,
    listingEndAt: null,
    rawJson: rawJson ?? {}
  };
}

function mapStoredListing(record: {
  marketplace: Marketplace;
  externalListingId: string;
  listingKind: string;
  title: string;
  subtitle: string | null;
  condition: string | null;
  buyingOptions: Prisma.JsonValue | null;
  currentPrice: number;
  shippingCost: number | null;
  listingUrl: string;
  imageUrl: string | null;
  sellerName: string | null;
  sellerFeedbackPercentage: number | null;
  sellerFeedbackScore: number | null;
  gtin: string | null;
  brand: string | null;
  mpn: string | null;
  upc: string | null;
  categoryPath: string | null;
  locationCountry: string | null;
  quantityAvailable: number | null;
  packageQuantity: number | null;
  variant: string | null;
  listingEndAt: Date | null;
  rawJson: Prisma.JsonValue;
}): NormalizedMarketplaceListing {
  return {
    marketplace: record.marketplace,
    externalListingId: record.externalListingId,
    listingKind: record.listingKind === "CATALOG" ? "CATALOG" : "OFFER",
    title: record.title,
    subtitle: record.subtitle,
    condition: record.condition,
    buyingOptions: parseStringArray(record.buyingOptions),
    currentPrice: record.currentPrice,
    shippingCost: record.shippingCost ?? 0,
    listingUrl: record.listingUrl,
    imageUrl: record.imageUrl,
    sellerName: record.sellerName,
    sellerFeedbackPercentage: record.sellerFeedbackPercentage,
    sellerFeedbackScore: record.sellerFeedbackScore,
    gtin: record.gtin,
    brand: record.brand,
    mpn: record.mpn,
    upc: record.upc,
    categoryPath: record.categoryPath,
    locationCountry: record.locationCountry,
    quantityAvailable: record.quantityAvailable,
    packageQuantity: record.packageQuantity,
    variant: record.variant,
    listingEndAt: record.listingEndAt?.toISOString() ?? null,
    rawJson: record.rawJson
  };
}

async function upsertMarketplaceListing(listing: NormalizedMarketplaceListing) {
  const now = new Date();
  const record = await prisma.marketplaceListing.upsert({
    where: {
      marketplace_externalListingId: {
        marketplace: listing.marketplace,
        externalListingId: listing.externalListingId
      }
    },
    update: {
      listingKind: listing.listingKind,
      title: listing.title,
      subtitle: listing.subtitle,
      condition: listing.condition,
      buyingOptions: listing.buyingOptions as Prisma.InputJsonValue,
      currentPrice: listing.currentPrice,
      shippingCost: listing.shippingCost,
      listingUrl: listing.listingUrl,
      imageUrl: listing.imageUrl,
      sellerName: listing.sellerName,
      sellerFeedbackPercentage: listing.sellerFeedbackPercentage,
      sellerFeedbackScore: listing.sellerFeedbackScore,
      gtin: listing.gtin,
      brand: listing.brand,
      mpn: listing.mpn,
      upc: listing.upc,
      categoryPath: listing.categoryPath,
      locationCountry: listing.locationCountry,
      quantityAvailable: listing.quantityAvailable,
      packageQuantity: listing.packageQuantity,
      variant: listing.variant,
      listingEndAt: listing.listingEndAt ? new Date(listing.listingEndAt) : null,
      rawJson: listing.rawJson as Prisma.InputJsonValue,
      lastSeenAt: now
    },
    create: {
      marketplace: listing.marketplace,
      externalListingId: listing.externalListingId,
      listingKind: listing.listingKind,
      title: listing.title,
      subtitle: listing.subtitle,
      condition: listing.condition,
      buyingOptions: listing.buyingOptions as Prisma.InputJsonValue,
      currentPrice: listing.currentPrice,
      shippingCost: listing.shippingCost,
      listingUrl: listing.listingUrl,
      imageUrl: listing.imageUrl,
      sellerName: listing.sellerName,
      sellerFeedbackPercentage: listing.sellerFeedbackPercentage,
      sellerFeedbackScore: listing.sellerFeedbackScore,
      gtin: listing.gtin,
      brand: listing.brand,
      mpn: listing.mpn,
      upc: listing.upc,
      categoryPath: listing.categoryPath,
      locationCountry: listing.locationCountry,
      quantityAvailable: listing.quantityAvailable,
      packageQuantity: listing.packageQuantity,
      variant: listing.variant,
      listingEndAt: listing.listingEndAt ? new Date(listing.listingEndAt) : null,
      rawJson: listing.rawJson as Prisma.InputJsonValue,
      firstSeenAt: now,
      lastSeenAt: now
    }
  });

  await prisma.listingSnapshot.create({
    data: {
      marketplaceListingId: record.id,
      price: listing.currentPrice,
      shippingCost: listing.shippingCost,
      quantityAvailable: listing.quantityAvailable,
      rawJson: listing.rawJson as Prisma.InputJsonValue
    }
  });

  return record;
}

function buildAmazonSourceQuery(keywords: string, includeBrands: string[]) {
  return [keywords, ...includeBrands.map((brand) => `"${brand}"`)].join(" ").trim();
}

function filterMarketplaceSourceListings(
  listings: NormalizedMarketplaceListing[],
  savedSearch: {
    minPrice: number | null;
    maxPrice: number | null;
    maxShipping: number | null;
    conditionFilter: string | null;
    includeBrands: Prisma.JsonValue | null;
    excludeBrands: Prisma.JsonValue | null;
  }
) {
  const includeBrands = new Set(parseStringArray(savedSearch.includeBrands).map((brand) => brand.toLowerCase()));
  const excludeBrands = new Set(parseStringArray(savedSearch.excludeBrands).map((brand) => brand.toLowerCase()));

  return listings.filter((listing) => {
    const brand = String(listing.brand ?? "").toLowerCase();
    const title = listing.title.toLowerCase();

    if (includeBrands.size > 0 && !includeBrands.has(brand) && ![...includeBrands].some((item) => title.includes(item))) {
      return false;
    }
    if (excludeBrands.has(brand) || [...excludeBrands].some((item) => title.includes(item))) {
      return false;
    }
    if (savedSearch.minPrice !== null && listing.currentPrice < savedSearch.minPrice) {
      return false;
    }
    if (savedSearch.maxPrice !== null && listing.currentPrice > savedSearch.maxPrice) {
      return false;
    }
    if (savedSearch.maxShipping !== null && (listing.shippingCost ?? 0) > savedSearch.maxShipping) {
      return false;
    }
    if (
      savedSearch.conditionFilter &&
      !String(listing.condition ?? "").toUpperCase().includes(savedSearch.conditionFilter.toUpperCase())
    ) {
      return false;
    }

    return true;
  });
}

async function fetchSourceListings(
  savedSearch: {
    keywords: string;
    categoryId: string | null;
    includeBrands: Prisma.JsonValue | null;
    excludeBrands: Prisma.JsonValue | null;
    minPrice: number | null;
    maxPrice: number | null;
    conditionFilter: string | null;
    buyItNowOnly: boolean;
    allowAuctions: boolean;
    maxShipping: number | null;
    sourceMarketplace: Marketplace;
  },
  settings: Awaited<ReturnType<typeof getAppSettings>>,
  context: { scanJobId: number; savedSearchId: number }
) {
  if (savedSearch.sourceMarketplace === Marketplace.EBAY_CA) {
    const listings = await ebayService.searchListings(
      {
        keywords: savedSearch.keywords,
        categoryId: savedSearch.categoryId,
        includeBrands: parseStringArray(savedSearch.includeBrands),
        excludeBrands: parseStringArray(savedSearch.excludeBrands),
        minPrice: savedSearch.minPrice,
        maxPrice: savedSearch.maxPrice,
        conditionFilter: savedSearch.conditionFilter,
        buyItNowOnly: savedSearch.buyItNowOnly,
        allowAuctions: savedSearch.allowAuctions,
        maxShipping: savedSearch.maxShipping
      },
      {
        ...context,
        bypassCache: true
      }
    );

    return listings.map(mapEbayListing);
  }

  const listings = await amazonService.searchSourceListings(
    buildAmazonSourceQuery(savedSearch.keywords, parseStringArray(savedSearch.includeBrands)),
    settings.amazonMarketplaceId,
    settings.rateLimitSafeMode ? 10 : 20,
    context
  );

  return filterMarketplaceSourceListings(listings, savedSearch);
}

function scoreListingPair(
  source: NormalizedMarketplaceListing,
  candidate: NormalizedMarketplaceListing,
  method: MatchMethod,
  identifierMatch: boolean
) {
  const sourceBrand = extractBrand(source.title, source.brand);
  const candidateBrand = extractBrand(candidate.title, candidate.brand);
  const sourceModel = extractModel(source.title, source.mpn);
  const candidateModel = extractModel(candidate.title, candidate.mpn);
  const sourcePack = source.packageQuantity ?? extractPackCount(source.title);
  const candidatePack = candidate.packageQuantity ?? extractPackCount(candidate.title);
  const titleSimilarity = computeTitleSimilarity(source.title, candidate.title);
  const variantComparison = compareVariants(source.title, candidate.title);
  const brandMatch = Boolean(sourceBrand && candidateBrand && sourceBrand === candidateBrand);
  const modelMatch = Boolean(sourceModel && candidateModel && sourceModel === candidateModel);
  const packCountMatch =
    sourcePack && candidatePack ? sourcePack === candidatePack : sourcePack || candidatePack ? false : null;
  const conditionCompatible = !String(source.condition ?? "").toLowerCase().includes("parts");
  const confidence = computeMatchConfidence({
    identifierMatch,
    brandMatch,
    modelMatch,
    titleSimilarity,
    packCountMatch,
    variantMatch: variantComparison.match,
    conditionCompatible
  });
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (identifierMatch) {
    reasons.push("Identifier match found");
  }
  if (brandMatch) {
    reasons.push("Brand aligned");
  }
  if (modelMatch) {
    reasons.push("Model aligned");
  }
  if (titleSimilarity > 0.55) {
    reasons.push(`Title similarity ${(titleSimilarity * 100).toFixed(0)}%`);
  } else if (titleSimilarity < 0.3) {
    warnings.push("Low title overlap");
  }
  if (packCountMatch === false) {
    warnings.push("Pack count differs");
  }
  if (variantComparison.match === false) {
    warnings.push(variantComparison.note ?? "Variant terms differ");
  }
  if (!conditionCompatible) {
    warnings.push("Condition may not be suitable for resale");
  }

  return {
    candidate,
    confidence,
    method,
    reasons,
    warnings
  };
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function findMonitoredAmazonDestinationMatch(
  sourceListing: NormalizedMarketplaceListing,
  monitoredProduct: {
    id: number;
    asin: string;
    amazonMarketplaceId: string;
    title: string;
    brand: string | null;
    model: string | null;
    imageUrl: string | null;
    packageQuantity: number | null;
  },
  settings: Awaited<ReturnType<typeof getAppSettings>>
): Promise<ListingMatchEvidence> {
  const candidate =
    (await amazonService.getCatalogItemByAsin(monitoredProduct.asin, monitoredProduct.amazonMarketplaceId)) ?? {
      asin: monitoredProduct.asin,
      title: monitoredProduct.title,
      brand: monitoredProduct.brand,
      model: monitoredProduct.model,
      packageQuantity: monitoredProduct.packageQuantity,
      imageUrl: monitoredProduct.imageUrl,
      sizeColorVariant: null,
      identifiers: [],
      rawCatalogJson: null
    };

  const pricing = await amazonService.getPricingForAsin(monitoredProduct.asin, monitoredProduct.amazonMarketplaceId);
  const destinationPrice =
    pricing.featuredOfferPrice ?? pricing.amazonPrice ?? candidate.featuredOfferPrice ?? candidate.amazonPrice ?? 0;
  const feeEstimateResult = destinationPrice
    ? await amazonService.getFeeEstimateForAsin(monitoredProduct.asin, destinationPrice, monitoredProduct.amazonMarketplaceId)
    : { feeEstimate: null, fulfillmentFee: null, referralFee: null, rawFeesJson: null };
  const destinationListing = mapAmazonCandidateToListing(
    monitoredProduct.asin,
    candidate.title,
    destinationPrice,
    candidate.imageUrl ?? monitoredProduct.imageUrl ?? null,
    candidate.brand ?? monitoredProduct.brand ?? null,
    candidate.model ?? monitoredProduct.model ?? null,
    candidate.identifiers,
    candidate.packageQuantity ?? monitoredProduct.packageQuantity ?? null,
    candidate.sizeColorVariant ?? null,
    {
      catalog: candidate.rawCatalogJson,
      pricing: pricing.rawPricingJson,
      fees: feeEstimateResult.rawFeesJson
    }
  );

  const sourceBrand = extractBrand(sourceListing.title, sourceListing.brand);
  const targetBrand = extractBrand(destinationListing.title, destinationListing.brand);
  const sourceModel = extractModel(sourceListing.title, sourceListing.mpn);
  const targetModel = extractModel(destinationListing.title, destinationListing.mpn);
  const sourcePack = sourceListing.packageQuantity ?? extractPackCount(sourceListing.title);
  const targetPack = destinationListing.packageQuantity ?? extractPackCount(destinationListing.title);
  const titleSimilarity = computeTitleSimilarity(sourceListing.title, destinationListing.title);
  const variantComparison = compareVariants(sourceListing.title, destinationListing.title);
  const identifierMatch = Boolean(
    candidate.identifiers?.some((identifier: string) => identifier === sourceListing.upc || identifier === sourceListing.gtin)
  );
  const brandMatch = Boolean(sourceBrand && targetBrand && sourceBrand === targetBrand);
  const modelMatch = Boolean(sourceModel && targetModel && sourceModel === targetModel);
  const packCountMatch = sourcePack && targetPack ? sourcePack === targetPack : sourcePack || targetPack ? false : null;
  const conditionCompatible = !String(sourceListing.condition ?? "").toLowerCase().includes("parts");
  const confidence = computeMatchConfidence({
    identifierMatch,
    brandMatch,
    modelMatch,
    titleSimilarity,
    packCountMatch,
    variantMatch: variantComparison.match,
    conditionCompatible
  });
  const reasons = ["Matched against a monitored ASIN from your replens list"];
  const warnings: string[] = [];

  if (identifierMatch) {
    reasons.push("Source identifier aligns with monitored Amazon item");
  }
  if (brandMatch) {
    reasons.push("Brand aligned");
  }
  if (modelMatch) {
    reasons.push("Model aligned");
  }
  if (titleSimilarity > 0.55) {
    reasons.push(`Title similarity ${(titleSimilarity * 100).toFixed(0)}%`);
  } else if (titleSimilarity < 0.3) {
    warnings.push("Low title overlap");
  }
  if (packCountMatch === false) {
    warnings.push("Pack count differs");
  }
  if (variantComparison.match === false) {
    warnings.push(variantComparison.note ?? "Variant terms differ");
  }
  if (!conditionCompatible) {
    warnings.push("Condition may not be suitable for Amazon resale");
  }

  await prisma.monitoredProduct.update({
    where: { id: monitoredProduct.id },
    data: {
      title: candidate.title,
      brand: candidate.brand ?? monitoredProduct.brand,
      model: candidate.model ?? monitoredProduct.model,
      imageUrl: candidate.imageUrl ?? monitoredProduct.imageUrl,
      packageQuantity: candidate.packageQuantity ?? monitoredProduct.packageQuantity,
      lastAmazonPrice: destinationPrice || null,
      lastAmazonFeeEstimate: feeEstimateResult.feeEstimate ?? null,
      lastAmazonSyncAt: new Date()
    }
  });

  if (confidence < 35) {
    return {
      destination: null,
      confidence,
      method: MatchMethod.MANUAL,
      reasons: [],
      warnings: [...warnings, "Monitored ASIN exists, but the eBay listing does not confidently match it"],
      destinationPrice: 0,
      destinationFeeEstimate: 0,
      destinationShippingCredit: 0,
      fulfillmentCostEstimate: settings.defaultInboundCost
    };
  }

  return {
    destination: destinationListing,
    confidence,
    method: identifierMatch ? MatchMethod.UPC : MatchMethod.MANUAL,
    reasons,
    warnings,
    destinationPrice,
    destinationFeeEstimate: feeEstimateResult.feeEstimate ?? 0,
    destinationShippingCredit: 0,
    fulfillmentCostEstimate: settings.defaultInboundCost
  };
}

async function findAmazonDestinationMatch(
  sourceListing: NormalizedMarketplaceListing,
  settings: Awaited<ReturnType<typeof getAppSettings>>,
  monitoredProduct?: {
    id: number;
    asin: string;
    amazonMarketplaceId: string;
    title: string;
    brand: string | null;
    model: string | null;
    imageUrl: string | null;
    packageQuantity: number | null;
  } | null
): Promise<ListingMatchEvidence> {
  if (monitoredProduct) {
    return findMonitoredAmazonDestinationMatch(sourceListing, monitoredProduct, settings);
  }

  const legacySource: NormalizedEbayListing = {
    ebayItemId: sourceListing.externalListingId,
    title: sourceListing.title,
    subtitle: sourceListing.subtitle ?? null,
    condition: sourceListing.condition ?? null,
    buyingOptions: sourceListing.buyingOptions,
    currentPrice: sourceListing.currentPrice,
    shippingCost: sourceListing.shippingCost,
    itemWebUrl: sourceListing.listingUrl,
    imageUrl: sourceListing.imageUrl ?? null,
    sellerUsername: sourceListing.sellerName ?? null,
    sellerFeedbackPercentage: sourceListing.sellerFeedbackPercentage ?? null,
    sellerFeedbackScore: sourceListing.sellerFeedbackScore ?? null,
    gtin: sourceListing.gtin ?? null,
    brand: sourceListing.brand ?? null,
    mpn: sourceListing.mpn ?? null,
    upc: sourceListing.upc ?? null,
    categoryPath: sourceListing.categoryPath ?? null,
    locationCountry: sourceListing.locationCountry ?? null,
    listingEndAt: sourceListing.listingEndAt ?? null,
    rawJson: sourceListing.rawJson
  };

  const match = await matchingEngine.matchListing(legacySource, settings.amazonMarketplaceId);
  const candidate = match.bestCandidate;
  if (!candidate) {
    return {
      destination: null,
      confidence: match.confidence,
      method: match.method,
      reasons: match.reasons,
      warnings: match.warnings,
      destinationPrice: 0,
      destinationFeeEstimate: 0,
      destinationShippingCredit: 0,
      fulfillmentCostEstimate: settings.defaultInboundCost
    };
  }

  const destinationPrice = candidate.featuredOfferPrice ?? candidate.amazonPrice ?? 0;
  return {
    destination: mapAmazonCandidateToListing(
      candidate.asin,
      candidate.title,
      destinationPrice,
      candidate.imageUrl ?? null,
      candidate.brand ?? null,
      candidate.model ?? null,
      candidate.identifiers,
      candidate.packageQuantity ?? null,
      candidate.sizeColorVariant ?? null,
      {
        catalog: candidate.rawCatalogJson,
        pricing: candidate.rawPricingJson,
        fees: candidate.rawFeesJson
      }
    ),
    confidence: match.confidence,
    method: match.method,
    reasons: match.reasons,
    warnings: match.warnings,
    destinationPrice,
    destinationFeeEstimate: candidate.feeEstimate ?? 0,
    destinationShippingCredit: 0,
    fulfillmentCostEstimate: settings.defaultInboundCost
  };
}

async function findEbayDestinationMatch(
  sourceListing: NormalizedMarketplaceListing,
  settings: Awaited<ReturnType<typeof getAppSettings>>,
  context: { scanJobId: number; savedSearchId: number }
): Promise<ListingMatchEvidence> {
  const identifier = sourceListing.upc ?? sourceListing.gtin;
  const keywords = [sourceListing.brand, sourceListing.mpn, sourceListing.title].filter(Boolean).join(" ").trim();
  const ebayCandidates = await ebayService.searchListings(
    {
      keywords: identifier || keywords || sourceListing.title,
      buyItNowOnly: true,
      allowAuctions: false,
      limit: settings.rateLimitSafeMode ? 10 : 20
    },
    {
      ...context,
      bypassCache: true
    }
  );

  const scored = ebayCandidates
    .map(mapEbayListing)
    .map((candidate) =>
      scoreListingPair(
        sourceListing,
        candidate,
        identifier ? MatchMethod.UPC : MatchMethod.TITLE_SIMILARITY,
        Boolean(identifier && (candidate.upc === identifier || candidate.gtin === identifier))
      )
    )
    .sort((left, right) => right.confidence - left.confidence);

  const best = scored[0];
  if (!best || best.confidence < 35) {
    return {
      destination: null,
      confidence: best?.confidence ?? 0,
      method: best?.method ?? MatchMethod.TITLE_SIMILARITY,
      reasons: [],
      warnings: ["No strong eBay destination comp found"],
      destinationPrice: 0,
      destinationFeeEstimate: 0,
      destinationShippingCredit: 0,
      fulfillmentCostEstimate: settings.defaultOutboundShippingCost
    };
  }

  const compWindow = scored.filter((entry) => entry.confidence >= Math.max(35, best.confidence - 10)).slice(0, 3);
  const medianPrice = median(compWindow.map((entry) => entry.candidate.currentPrice));
  const medianShipping = median(compWindow.map((entry) => entry.candidate.shippingCost ?? 0));
  const grossRevenue = Number((medianPrice + medianShipping).toFixed(2));
  const feeEstimate = Number(
    (grossRevenue * settings.defaultEbayFinalValueFeePercent + settings.defaultEbayFixedFee).toFixed(2)
  );

  return {
    destination: best.candidate,
    confidence: best.confidence,
    method: best.method,
    reasons: best.reasons,
    warnings: [...best.warnings, "Active listing comps used for eBay sell estimate"],
    destinationPrice: grossRevenue,
    destinationFeeEstimate: feeEstimate,
    destinationShippingCredit: Number(medianShipping.toFixed(2)),
    fulfillmentCostEstimate: settings.defaultOutboundShippingCost
  };
}

async function persistOpportunityForListing(
  savedSearch: {
    id: number;
    minProfit: number | null;
    destinationMarketplace: Marketplace;
    sourceMarketplace: Marketplace;
    monitoredProduct?: {
      id: number;
      asin: string;
      amazonMarketplaceId: string;
      title: string;
      brand: string | null;
      model: string | null;
      imageUrl: string | null;
      packageQuantity: number | null;
    } | null;
  },
  scanJobId: number,
  sourceListing: NormalizedMarketplaceListing
) {
  const settings = await getAppSettings();
  const sourceRecord = await upsertMarketplaceListing(sourceListing);
  const salesTaxCost = buildTaxCost(
    sourceListing.currentPrice,
    sourceListing.shippingCost ?? 0,
    settings.applySalesTax,
    settings.salesTaxRate
  );

  const matchEvidence =
    savedSearch.destinationMarketplace === Marketplace.AMAZON_CA
      ? await findAmazonDestinationMatch(sourceListing, settings, savedSearch.monitoredProduct)
      : await findEbayDestinationMatch(sourceListing, settings, {
          scanJobId,
          savedSearchId: savedSearch.id
        });

  const destinationRecord = matchEvidence.destination ? await upsertMarketplaceListing(matchEvidence.destination) : null;
  const listingMatch =
    destinationRecord && matchEvidence.destination
      ? await prisma.listingMatch.upsert({
          where: {
            sourceListingId_destinationListingId: {
              sourceListingId: sourceRecord.id,
              destinationListingId: destinationRecord.id
            }
          },
          update: {
            confidence: matchEvidence.confidence,
            matchMethod: matchEvidence.method,
            reasons: matchEvidence.reasons as Prisma.InputJsonValue,
            warnings: matchEvidence.warnings as Prisma.InputJsonValue
          },
          create: {
            sourceListingId: sourceRecord.id,
            destinationListingId: destinationRecord.id,
            confidence: matchEvidence.confidence,
            matchMethod: matchEvidence.method,
            reasons: matchEvidence.reasons as Prisma.InputJsonValue,
            warnings: matchEvidence.warnings as Prisma.InputJsonValue
          }
        })
      : null;

  const prepCostEstimate = savedSearch.destinationMarketplace === Marketplace.AMAZON_CA ? settings.defaultPrepCost : 0;
  const labelCostEstimate = savedSearch.destinationMarketplace === Marketplace.AMAZON_CA ? settings.defaultLabelCost : 0;
  const otherCostEstimate = settings.defaultOtherCost + salesTaxCost;
  const calculation = calculateArbitrageProfit({
    sourcePrice: sourceListing.currentPrice,
    sourceShippingCost: sourceListing.shippingCost ?? 0,
    sourceFeeEstimate: 0,
    destinationSellPrice: matchEvidence.destinationPrice,
    destinationFeeEstimate: matchEvidence.destinationFeeEstimate,
    fulfillmentCostEstimate: matchEvidence.fulfillmentCostEstimate,
    prepCostEstimate,
    labelCostEstimate,
    otherCostEstimate
  });
  const risk = assessArbitrageRisk({
    sourceListing,
    destinationListing: matchEvidence.destination,
    destinationMarketplace: savedSearch.destinationMarketplace,
    matchConfidence: matchEvidence.confidence,
    matchWarnings: matchEvidence.warnings,
    netProfit: calculation.netProfit,
    marginPercent: calculation.marginPercent,
    minProfitThreshold: savedSearch.minProfit
  });

  const opportunityKey = `${savedSearch.id}:${sourceRecord.id}:${destinationRecord?.id ?? "unmatched"}`;
  const current = await prisma.arbitrageOpportunity.findUnique({
    where: { opportunityKey }
  });

  const data = {
    savedSearchId: savedSearch.id,
    sourceListingId: sourceRecord.id,
    destinationListingId: destinationRecord?.id ?? null,
    listingMatchId: listingMatch?.id ?? null,
    sourceItemCost: sourceListing.currentPrice,
    sourceShippingCost: sourceListing.shippingCost ?? 0,
    sourceFeeEstimate: 0,
    destinationSellPrice: matchEvidence.destinationPrice,
    destinationShippingCredit: matchEvidence.destinationShippingCredit,
    destinationFeeEstimate: matchEvidence.destinationFeeEstimate,
    fulfillmentCostEstimate: matchEvidence.fulfillmentCostEstimate,
    prepCostEstimate,
    labelCostEstimate,
    otherCostEstimate,
    totalCost: calculation.totalLandedCost,
    netProfit: calculation.netProfit,
    roiPercent: calculation.roiPercent,
    marginPercent: calculation.marginPercent,
    breakEvenSellPrice: calculation.breakEvenSellPrice,
    confidenceScore: matchEvidence.confidence,
    riskScore: risk.score,
    riskFlags: risk.flags as unknown as Prisma.InputJsonValue,
    lastScannedAt: new Date()
  };

  const opportunity = current
    ? await prisma.arbitrageOpportunity.update({
        where: { id: current.id },
        data
      })
    : await prisma.arbitrageOpportunity.create({
        data: {
          opportunityKey,
          ...data,
          status: matchEvidence.destination ? OpportunityStatus.NEW : OpportunityStatus.REVIEW
        }
      });

  await prisma.arbitrageOpportunitySnapshot.create({
    data: {
      opportunityId: opportunity.id,
      sourceItemCost: data.sourceItemCost,
      destinationSellPrice: data.destinationSellPrice,
      destinationFeeEstimate: data.destinationFeeEstimate,
      netProfit: data.netProfit,
      roiPercent: data.roiPercent,
      marginPercent: data.marginPercent,
      riskScore: data.riskScore,
      calculationJson: {
        destinationShippingCredit: data.destinationShippingCredit,
        reasons: matchEvidence.reasons,
        warnings: matchEvidence.warnings
      } as Prisma.InputJsonValue
    }
  });

  if (!current) {
    await prisma.arbitrageOpportunityStatusHistory.create({
      data: {
        opportunityId: opportunity.id,
        fromStatus: null,
        toStatus: opportunity.status,
        note: "Created during scan"
      }
    });
  }

  await createApiLog({
    source: ApiLogSource.APP,
    operation: "persistOpportunity",
    requestKey: sourceListing.externalListingId,
    message: matchEvidence.destination ? "Opportunity matched and updated" : "Opportunity stored without destination match",
    detail: {
      opportunityId: opportunity.id,
      destinationListingId: destinationRecord?.id ?? null,
      confidence: matchEvidence.confidence,
      riskScore: risk.score
    },
    scanJobId,
    savedSearchId: savedSearch.id
  });

  return {
    isNew: !current,
    matched: Boolean(matchEvidence.destination),
    warningCount: matchEvidence.warnings.length + risk.flags.length,
    opportunityId: opportunity.id
  };
}

export async function scanSavedSearch(savedSearchId: number, triggeredBy = "manual") {
  return withScanLease(savedSearchId, async (lease) => {
    const savedSearch = await prisma.savedSearch.findUniqueOrThrow({
      where: { id: savedSearchId },
      include: {
        monitoredProduct: true
      }
    });
    const settings = await getAppSettings();

    let jobId: number | null = null;

    try {
      const job = await prisma.scanJob.create({
        data: {
          savedSearchId,
          status: ScanJobStatus.RUNNING,
          triggeredBy
        }
      });
      jobId = job.id;

      await refreshScanLease(savedSearchId, lease);
      const listings = await fetchSourceListings(savedSearch, settings, {
        scanJobId: job.id,
        savedSearchId
      });

      const summary: ScanSummary = {
        listingsFetched: listings.length,
        listingsProcessed: 0,
        matchesFound: 0,
        opportunitiesCreated: 0,
        warnings: []
      };

      for (const listing of listings) {
        await refreshScanLease(savedSearchId, lease);

        try {
          const outcome = await persistOpportunityForListing(savedSearch, job.id, listing);
          summary.listingsProcessed += 1;
          summary.matchesFound += outcome.matched ? 1 : 0;
          summary.opportunitiesCreated += outcome.isNew ? 1 : 0;
        } catch (error) {
          summary.warnings.push(
            error instanceof Error ? `${listing.externalListingId}: ${error.message}` : `${listing.externalListingId}: unknown error`
          );
        }
      }

      const status = summary.warnings.length > 0 ? ScanJobStatus.PARTIAL : ScanJobStatus.SUCCESS;
      await prisma.scanJob.update({
        where: { id: job.id },
        data: {
          status,
          itemCount: summary.listingsProcessed,
          newOpportunityCount: summary.opportunitiesCreated,
          warningCount: summary.warnings.length,
          finishedAt: new Date(),
          summaryJson: summary as unknown as Prisma.InputJsonValue
        }
      });

      return {
        jobId: job.id,
        status,
        summary
      };
    } catch (error) {
      if (jobId) {
        await prisma.scanJob.update({
          where: { id: jobId },
          data: {
            status: ScanJobStatus.FAILED,
            finishedAt: new Date(),
            errorMessage: error instanceof Error ? error.message : "Unknown scan failure"
          }
        });
      }

      throw error;
    }
  });
}

export async function rescanOpportunity(opportunityId: number) {
  const opportunity = await prisma.arbitrageOpportunity.findUniqueOrThrow({
    where: { id: opportunityId },
    include: {
      sourceListing: true,
      savedSearch: {
        select: {
          id: true,
          minProfit: true,
          sourceMarketplace: true,
          destinationMarketplace: true,
          monitoredProduct: {
            select: {
              id: true,
              asin: true,
              amazonMarketplaceId: true,
              title: true,
              brand: true,
              model: true,
              imageUrl: true,
              packageQuantity: true
            }
          }
        }
      }
    }
  });

  const sourceListing = mapStoredListing(opportunity.sourceListing);

  await withScanLease(opportunity.savedSearchId, async (lease) => {
    const job = await prisma.scanJob.create({
      data: {
        savedSearchId: opportunity.savedSearchId,
        status: ScanJobStatus.RUNNING,
        triggeredBy: "manual-opportunity"
      }
    });

    try {
      await refreshScanLease(opportunity.savedSearchId, lease);
      await persistOpportunityForListing(opportunity.savedSearch, job.id, sourceListing);
      await prisma.scanJob.update({
        where: { id: job.id },
        data: {
          status: ScanJobStatus.SUCCESS,
          itemCount: 1,
          finishedAt: new Date(),
          summaryJson: { rescannedOpportunityId: opportunityId } as Prisma.InputJsonValue
        }
      });
    } catch (error) {
      await prisma.scanJob.update({
        where: { id: job.id },
        data: {
          status: ScanJobStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : "Opportunity rescan failed",
          finishedAt: new Date()
        }
      });
      throw error;
    }
  });
}
