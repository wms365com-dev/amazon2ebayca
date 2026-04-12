import { randomUUID } from "crypto";

import { ApiLogSource, OpportunityStatus, Prisma, ScanJobStatus } from "@prisma/client";

import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { EbayService } from "./ebay/ebayService";
import { AmazonService } from "./amazon/amazonService";
import { MatchingEngine } from "./matching/engine";
import { calculateProfit } from "./calculator/profitCalculator";
import { assessRisk } from "./risk/riskEngine";
import { createApiLog } from "./apiLogService";
import { getAppSettings } from "./settingsService";
import { NormalizedEbayListing, ScanSummary } from "../types/domain";

const ebayService = new EbayService();
const amazonService = new AmazonService();
const matchingEngine = new MatchingEngine(amazonService);

interface ScanLease {
  token: string;
  expiresAt: Date;
}

export class ScanAlreadyRunningError extends Error {
  constructor(savedSearchId: number) {
    super(`A scan is already running for saved search ${savedSearchId}`);
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
    throw new Error(`Scan lease expired for saved search ${savedSearchId}`);
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

async function upsertEbayListing(listing: NormalizedEbayListing) {
  return prisma.ebayListing.upsert({
    where: { ebayItemId: listing.ebayItemId },
    update: {
      title: listing.title,
      subtitle: listing.subtitle,
      condition: listing.condition,
      buyingOptions: listing.buyingOptions as Prisma.InputJsonValue,
      currentPrice: listing.currentPrice,
      shippingCost: listing.shippingCost,
      itemWebUrl: listing.itemWebUrl,
      imageUrl: listing.imageUrl,
      sellerUsername: listing.sellerUsername,
      sellerFeedbackPercentage: listing.sellerFeedbackPercentage,
      sellerFeedbackScore: listing.sellerFeedbackScore,
      gtin: listing.gtin,
      brand: listing.brand,
      mpn: listing.mpn,
      upc: listing.upc,
      categoryPath: listing.categoryPath,
      locationCountry: listing.locationCountry,
      listingEndAt: listing.listingEndAt ? new Date(listing.listingEndAt) : null,
      rawJson: listing.rawJson as Prisma.InputJsonValue
    },
    create: {
      ebayItemId: listing.ebayItemId,
      title: listing.title,
      subtitle: listing.subtitle,
      condition: listing.condition,
      buyingOptions: listing.buyingOptions as Prisma.InputJsonValue,
      currentPrice: listing.currentPrice,
      shippingCost: listing.shippingCost,
      itemWebUrl: listing.itemWebUrl,
      imageUrl: listing.imageUrl,
      sellerUsername: listing.sellerUsername,
      sellerFeedbackPercentage: listing.sellerFeedbackPercentage,
      sellerFeedbackScore: listing.sellerFeedbackScore,
      gtin: listing.gtin,
      brand: listing.brand,
      mpn: listing.mpn,
      upc: listing.upc,
      categoryPath: listing.categoryPath,
      locationCountry: listing.locationCountry,
      listingEndAt: listing.listingEndAt ? new Date(listing.listingEndAt) : null,
      rawJson: listing.rawJson as Prisma.InputJsonValue
    }
  });
}

async function persistOpportunityForListing(
  savedSearchId: number,
  scanJobId: number,
  listing: NormalizedEbayListing,
  minProfitThreshold?: number | null
) {
  const settings = await getAppSettings();
  const ebayRecord = await upsertEbayListing(listing);
  const match = await matchingEngine.matchListing(listing, settings.amazonMarketplaceId);
  const matchedCandidate = match.bestCandidate;
  const salesTaxCost = buildTaxCost(
    listing.currentPrice,
    listing.shippingCost ?? 0,
    settings.applySalesTax,
    settings.salesTaxRate
  );
  const otherCostEstimate = settings.defaultOtherCost + salesTaxCost;
  const amazonSellPrice = matchedCandidate?.featuredOfferPrice ?? matchedCandidate?.amazonPrice ?? 0;
  const amazonFeeEstimate = matchedCandidate?.feeEstimate ?? 0;
  const calculation = calculateProfit({
    ebayItemPrice: listing.currentPrice,
    ebayShippingCost: listing.shippingCost ?? 0,
    inboundCost: settings.defaultInboundCost,
    prepCost: settings.defaultPrepCost,
    labelCost: settings.defaultLabelCost,
    otherCost: otherCostEstimate,
    amazonSellPrice,
    amazonFeeEstimate
  });
  const risk = assessRisk({
    listing,
    matchConfidence: match.confidence,
    matchWarnings: match.warnings,
    candidate: matchedCandidate,
    netProfit: calculation.netProfit,
    marginPercent: calculation.marginPercent,
    minProfitThreshold
  });

  let amazonMatchId: number | null = null;
  if (matchedCandidate) {
    const amazonMatch = await prisma.amazonMatch.upsert({
      where: { ebayListingId: ebayRecord.id },
      update: {
        asin: matchedCandidate.asin,
        amazonTitle: matchedCandidate.title,
        brand: matchedCandidate.brand,
        model: matchedCandidate.model,
        packageQuantity: matchedCandidate.packageQuantity,
        sizeColorVariant: matchedCandidate.sizeColorVariant,
        imageUrl: matchedCandidate.imageUrl,
        amazonPrice: matchedCandidate.amazonPrice,
        featuredOfferPrice: matchedCandidate.featuredOfferPrice,
        feeEstimate: matchedCandidate.feeEstimate,
        fulfillmentFee: matchedCandidate.fulfillmentFee,
        referralFee: matchedCandidate.referralFee,
        matchConfidence: match.confidence,
        matchMethod: match.method,
        matchReasons: match.reasons as Prisma.InputJsonValue,
        matchWarnings: match.warnings as Prisma.InputJsonValue,
        rawCatalogJson: (matchedCandidate.rawCatalogJson ?? null) as Prisma.InputJsonValue,
        rawPricingJson: (matchedCandidate.rawPricingJson ?? null) as Prisma.InputJsonValue,
        rawFeesJson: (matchedCandidate.rawFeesJson ?? null) as Prisma.InputJsonValue
      },
      create: {
        ebayListingId: ebayRecord.id,
        asin: matchedCandidate.asin,
        amazonTitle: matchedCandidate.title,
        brand: matchedCandidate.brand,
        model: matchedCandidate.model,
        packageQuantity: matchedCandidate.packageQuantity,
        sizeColorVariant: matchedCandidate.sizeColorVariant,
        imageUrl: matchedCandidate.imageUrl,
        amazonPrice: matchedCandidate.amazonPrice,
        featuredOfferPrice: matchedCandidate.featuredOfferPrice,
        feeEstimate: matchedCandidate.feeEstimate,
        fulfillmentFee: matchedCandidate.fulfillmentFee,
        referralFee: matchedCandidate.referralFee,
        matchConfidence: match.confidence,
        matchMethod: match.method,
        matchReasons: match.reasons as Prisma.InputJsonValue,
        matchWarnings: match.warnings as Prisma.InputJsonValue,
        rawCatalogJson: (matchedCandidate.rawCatalogJson ?? null) as Prisma.InputJsonValue,
        rawPricingJson: (matchedCandidate.rawPricingJson ?? null) as Prisma.InputJsonValue,
        rawFeesJson: (matchedCandidate.rawFeesJson ?? null) as Prisma.InputJsonValue
      }
    });
    amazonMatchId = amazonMatch.id;
  }

  const current = await prisma.opportunity.findUnique({
    where: {
      savedSearchId_ebayListingId: {
        savedSearchId,
        ebayListingId: ebayRecord.id
      }
    }
  });
  const data = {
    savedSearchId,
    ebayListingId: ebayRecord.id,
    amazonMatchId,
    ebayItemCost: listing.currentPrice,
    ebayShippingCost: listing.shippingCost ?? 0,
    inboundCostEstimate: settings.defaultInboundCost,
    prepCostEstimate: settings.defaultPrepCost,
    labelCostEstimate: settings.defaultLabelCost,
    otherCostEstimate,
    totalLandedCost: calculation.totalLandedCost,
    amazonSellPrice,
    amazonFeeEstimate,
    netProfit: calculation.netProfit,
    roiPercent: calculation.roiPercent,
    marginPercent: calculation.marginPercent,
    breakEvenSellPrice: calculation.breakEvenSellPrice,
    riskScore: risk.score,
    riskFlags: risk.flags as unknown as Prisma.InputJsonValue,
    lastScannedAt: new Date()
  };

  const opportunity = current
    ? await prisma.opportunity.update({
        where: { id: current.id },
        data
      })
    : await prisma.opportunity.create({
        data: {
          ...data,
          status: OpportunityStatus.NEW
        }
      });

  if (!current) {
    await prisma.opportunityStatusHistory.create({
      data: {
        opportunityId: opportunity.id,
        fromStatus: null,
        toStatus: OpportunityStatus.NEW,
        note: "Created during scan"
      }
    });
  }

  await createApiLog({
    source: ApiLogSource.APP,
    operation: "persistOpportunity",
    requestKey: listing.ebayItemId,
    message: matchedCandidate ? "Opportunity matched and updated" : "Opportunity stored without Amazon match",
    detail: {
      opportunityId: opportunity.id,
      amazonMatchId,
      confidence: match.confidence,
      riskScore: risk.score
    },
    scanJobId,
    savedSearchId
  });

  return {
    isNew: !current,
    matched: Boolean(matchedCandidate),
    warningCount: match.warnings.length + risk.flags.length,
    opportunityId: opportunity.id
  };
}

export async function scanSavedSearch(savedSearchId: number, triggeredBy = "manual") {
  return withScanLease(savedSearchId, async (lease) => {
    const savedSearch = await prisma.savedSearch.findUniqueOrThrow({
      where: { id: savedSearchId }
    });

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
          scanJobId: job.id,
          savedSearchId
        }
      );

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
          const outcome = await persistOpportunityForListing(savedSearchId, job.id, listing, savedSearch.minProfit);
          summary.listingsProcessed += 1;
          summary.matchesFound += outcome.matched ? 1 : 0;
          summary.opportunitiesCreated += outcome.isNew ? 1 : 0;
        } catch (error) {
          summary.warnings.push(
            error instanceof Error ? `${listing.ebayItemId}: ${error.message}` : `${listing.ebayItemId}: unknown error`
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
  const opportunity = await prisma.opportunity.findUniqueOrThrow({
    where: { id: opportunityId },
    include: {
      ebayListing: true,
      savedSearch: {
        select: {
          minProfit: true
        }
      }
    }
  });

  const listing: NormalizedEbayListing = {
    ebayItemId: opportunity.ebayListing.ebayItemId,
    title: opportunity.ebayListing.title,
    subtitle: opportunity.ebayListing.subtitle,
    condition: opportunity.ebayListing.condition,
    buyingOptions: parseStringArray(opportunity.ebayListing.buyingOptions).length
      ? parseStringArray(opportunity.ebayListing.buyingOptions)
      : ["FIXED_PRICE"],
    currentPrice: opportunity.ebayListing.currentPrice,
    shippingCost: opportunity.ebayListing.shippingCost,
    itemWebUrl: opportunity.ebayListing.itemWebUrl,
    imageUrl: opportunity.ebayListing.imageUrl,
    sellerUsername: opportunity.ebayListing.sellerUsername,
    sellerFeedbackPercentage: opportunity.ebayListing.sellerFeedbackPercentage,
    sellerFeedbackScore: opportunity.ebayListing.sellerFeedbackScore,
    gtin: opportunity.ebayListing.gtin,
    brand: opportunity.ebayListing.brand,
    mpn: opportunity.ebayListing.mpn,
    upc: opportunity.ebayListing.upc,
    categoryPath: opportunity.ebayListing.categoryPath,
    locationCountry: opportunity.ebayListing.locationCountry,
    listingEndAt: opportunity.ebayListing.listingEndAt?.toISOString() ?? null,
    rawJson: opportunity.ebayListing.rawJson
  };

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
      await persistOpportunityForListing(opportunity.savedSearchId, job.id, listing, opportunity.savedSearch.minProfit);
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
