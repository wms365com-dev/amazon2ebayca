import { Marketplace } from "@prisma/client";

import {
  AmazonCatalogCandidate,
  NormalizedEbayListing,
  NormalizedMarketplaceListing,
  RiskAssessment,
  RiskFlag
} from "../../types/domain";

interface LegacyRiskInput {
  listing: NormalizedEbayListing;
  matchConfidence: number;
  matchWarnings: string[];
  candidate: AmazonCatalogCandidate | null;
  netProfit: number;
  marginPercent: number;
  minProfitThreshold?: number | null;
}

interface ArbitrageRiskInput {
  sourceListing: NormalizedMarketplaceListing;
  destinationListing: NormalizedMarketplaceListing | null;
  destinationMarketplace: Marketplace;
  matchConfidence: number;
  matchWarnings: string[];
  netProfit: number;
  marginPercent: number;
  minProfitThreshold?: number | null;
  ipComplaintBrands?: string[];
}

const restrictedBrands = new Set(["nike", "adidas", "lego", "nintendo", "apple"]);

function brandMatchesAlertList(brand: string, sourceTitle: string, destinationTitle: string, alertBrands: string[]) {
  const haystack = `${brand} ${sourceTitle} ${destinationTitle}`.toLowerCase();
  return alertBrands.some((item) => haystack.includes(item));
}

function pushFlag(flags: RiskFlag[], code: RiskFlag["code"], severity: RiskFlag["severity"], message: string) {
  flags.push({ code, severity, message });
}

export function assessArbitrageRisk(input: ArbitrageRiskInput): RiskAssessment {
  const flags: RiskFlag[] = [];
  let score = 5;
  const condition = String(input.sourceListing.condition ?? "").toLowerCase();
  const brand = String(input.sourceListing.brand ?? input.destinationListing?.brand ?? "").toLowerCase();
  const sourceTitle = input.sourceListing.title.toLowerCase();
  const destinationTitle = String(input.destinationListing?.title ?? "").toLowerCase();
  const ipComplaintBrands = (input.ipComplaintBrands ?? []).map((item) => item.toLowerCase()).filter(Boolean);

  if (!input.sourceListing.upc && !input.sourceListing.gtin) {
    pushFlag(flags, "NO_BARCODE", "medium", "Listing has no UPC or GTIN for deterministic matching.");
    score += 12;
  }

  if (condition.includes("used") || condition.includes("open")) {
    pushFlag(flags, "USED_CONDITION", "high", "Used or open-box inventory increases fulfillment and return risk.");
    score += 18;
  }

  if (
    input.sourceListing.marketplace === Marketplace.EBAY_CA &&
    (input.sourceListing.sellerFeedbackPercentage ?? 100) < 96
  ) {
    pushFlag(flags, "LOW_SELLER_FEEDBACK", "medium", "Seller feedback percentage is below the safer threshold.");
    score += 10;
  }

  if (input.sourceListing.marketplace === Marketplace.EBAY_CA && (input.sourceListing.sellerFeedbackScore ?? 0) < 100) {
    pushFlag(flags, "LOW_SELLER_VOLUME", "medium", "Seller has limited historical feedback volume.");
    score += 8;
  }

  if (input.matchWarnings.some((warning) => warning.toLowerCase().includes("pack count"))) {
    pushFlag(flags, "PACK_COUNT_UNCLEAR", "high", "Pack count is unclear or appears mismatched.");
    score += 15;
  }

  if (input.matchWarnings.some((warning) => warning.toLowerCase().includes("low title overlap"))) {
    pushFlag(flags, "TITLE_MISMATCH", "high", "Title mismatch suggests the destination listing may be different.");
    score += 14;
  }

  if (input.matchWarnings.some((warning) => warning.toLowerCase().includes("variant terms differ"))) {
    pushFlag(flags, "VARIANT_MISMATCH", "high", "Variant terms differ between source and destination.");
    score += 16;
  }

  if (input.matchConfidence < 55) {
    pushFlag(flags, "BRAND_MISMATCH", "medium", "Match confidence is low for a reliable arbitrage decision.");
    score += 10;
  }

  if (input.marginPercent < 12) {
    pushFlag(flags, "LOW_MARGIN", "medium", "Margin is thin and could disappear with fees or price movement.");
    score += 10;
  }

  if (
    input.minProfitThreshold !== undefined &&
    input.minProfitThreshold !== null &&
    input.netProfit < input.minProfitThreshold
  ) {
    pushFlag(flags, "LOW_PROFIT", "medium", "Net profit is below the scan profile threshold.");
    score += 9;
  }

  if (input.destinationMarketplace === Marketplace.EBAY_CA) {
    pushFlag(flags, "ACTIVE_COMPS_ONLY", "medium", "eBay sell-side estimate is based on active listing comps, not sold comps.");
    score += 8;
  }

  if (ipComplaintBrands.length > 0 && brandMatchesAlertList(brand, sourceTitle, destinationTitle, ipComplaintBrands)) {
    pushFlag(
      flags,
      "IP_COMPLAINT_BRAND",
      "high",
      "Brand appears on your IP complaint alert list and should be reviewed before buying."
    );
    score += 28;
  }

  if (restrictedBrands.has(brand) && input.destinationMarketplace === Marketplace.AMAZON_CA) {
    pushFlag(flags, "POSSIBLE_RESTRICTION", "medium", "Brand may require ungating or extra compliance checks.");
    score += 8;
  }

  if (!input.sourceListing.imageUrl || !input.destinationListing?.imageUrl) {
    const missingSides = [
      !input.sourceListing.imageUrl ? "source" : null,
      !input.destinationListing?.imageUrl ? "destination" : null
    ].filter(Boolean);
    pushFlag(
      flags,
      "IMAGE_UNVERIFIED",
      "high",
      `Missing ${missingSides.join(" and ")} image data makes this deal harder to trust automatically.`
    );
    score += 14;
  }

  if (
    input.destinationListing?.currentPrice &&
    input.sourceListing.currentPrice < input.destinationListing.currentPrice * 0.4
  ) {
    pushFlag(flags, "SUSPICIOUS_PRICE", "medium", "Source price is unusually low relative to destination pricing and needs review.");
    score += 8;
  }

  const summary =
    flags.length > 0
      ? flags
          .slice(0, 3)
          .map((flag) => flag.message)
          .join(" ")
      : "Low relative risk based on current matching and pricing assumptions.";

  return {
    score: Math.min(100, Math.round(score)),
    flags,
    summary
  };
}

export function assessRisk(input: LegacyRiskInput): RiskAssessment {
  const destinationListing: NormalizedMarketplaceListing | null = input.candidate
    ? {
        marketplace: Marketplace.AMAZON_CA,
        externalListingId: input.candidate.asin,
        listingKind: "CATALOG",
        title: input.candidate.title,
        subtitle: null,
        condition: "NEW",
        buyingOptions: ["CATALOG"],
        currentPrice: input.candidate.featuredOfferPrice ?? input.candidate.amazonPrice ?? 0,
        shippingCost: 0,
        listingUrl: `https://www.amazon.ca/dp/${input.candidate.asin}`,
        imageUrl: input.candidate.imageUrl ?? null,
        sellerName: null,
        sellerFeedbackPercentage: null,
        sellerFeedbackScore: null,
        gtin: input.candidate.identifiers?.[0] ?? null,
        brand: input.candidate.brand ?? null,
        mpn: input.candidate.model ?? null,
        upc: input.candidate.identifiers?.[0] ?? null,
        categoryPath: null,
        locationCountry: "CA",
        quantityAvailable: null,
        packageQuantity: input.candidate.packageQuantity ?? null,
        variant: input.candidate.sizeColorVariant ?? null,
        listingEndAt: null,
        rawJson: input.candidate.rawCatalogJson ?? {}
      }
    : null;

  return assessArbitrageRisk({
    sourceListing: {
      marketplace: Marketplace.EBAY_CA,
      externalListingId: input.listing.ebayItemId,
      listingKind: "OFFER",
      title: input.listing.title,
      subtitle: input.listing.subtitle ?? null,
      condition: input.listing.condition ?? null,
      buyingOptions: input.listing.buyingOptions,
      currentPrice: input.listing.currentPrice,
      shippingCost: input.listing.shippingCost ?? 0,
      listingUrl: input.listing.itemWebUrl,
      imageUrl: input.listing.imageUrl ?? null,
      sellerName: input.listing.sellerUsername ?? null,
      sellerFeedbackPercentage: input.listing.sellerFeedbackPercentage ?? null,
      sellerFeedbackScore: input.listing.sellerFeedbackScore ?? null,
      gtin: input.listing.gtin ?? null,
      brand: input.listing.brand ?? null,
      mpn: input.listing.mpn ?? null,
      upc: input.listing.upc ?? null,
      categoryPath: input.listing.categoryPath ?? null,
      locationCountry: input.listing.locationCountry ?? null,
      quantityAvailable: null,
      packageQuantity: null,
      variant: null,
      listingEndAt: input.listing.listingEndAt ?? null,
      rawJson: input.listing.rawJson
    },
    destinationListing,
    destinationMarketplace: Marketplace.AMAZON_CA,
    matchConfidence: input.matchConfidence,
    matchWarnings: input.matchWarnings,
    netProfit: input.netProfit,
    marginPercent: input.marginPercent,
    minProfitThreshold: input.minProfitThreshold,
    ipComplaintBrands: []
  });
}
