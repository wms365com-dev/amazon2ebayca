import { AmazonCatalogCandidate, NormalizedEbayListing, RiskAssessment, RiskFlag } from "../../types/domain";

interface RiskInput {
  listing: NormalizedEbayListing;
  matchConfidence: number;
  matchWarnings: string[];
  candidate: AmazonCatalogCandidate | null;
  netProfit: number;
  marginPercent: number;
  minProfitThreshold?: number | null;
}

const restrictedBrands = new Set(["nike", "adidas", "lego", "nintendo", "apple"]);

function pushFlag(flags: RiskFlag[], code: RiskFlag["code"], severity: RiskFlag["severity"], message: string) {
  flags.push({ code, severity, message });
}

export function assessRisk(input: RiskInput): RiskAssessment {
  const flags: RiskFlag[] = [];
  let score = 5;
  const condition = String(input.listing.condition ?? "").toLowerCase();
  const brand = String(input.listing.brand ?? input.candidate?.brand ?? "").toLowerCase();

  if (!input.listing.upc && !input.listing.gtin) {
    pushFlag(flags, "NO_BARCODE", "medium", "Listing has no UPC or GTIN for deterministic matching.");
    score += 12;
  }

  if (condition.includes("used") || condition.includes("open")) {
    pushFlag(flags, "USED_CONDITION", "high", "Used or open-box inventory is riskier for Amazon FBA resale.");
    score += 18;
  }

  if ((input.listing.sellerFeedbackPercentage ?? 100) < 96) {
    pushFlag(flags, "LOW_SELLER_FEEDBACK", "medium", "Seller feedback percentage is below the safer threshold.");
    score += 10;
  }

  if ((input.listing.sellerFeedbackScore ?? 0) < 100) {
    pushFlag(flags, "LOW_SELLER_VOLUME", "medium", "Seller has limited historical feedback volume.");
    score += 8;
  }

  if (input.matchWarnings.some((warning) => warning.toLowerCase().includes("pack count"))) {
    pushFlag(flags, "PACK_COUNT_UNCLEAR", "high", "Pack count is unclear or appears mismatched.");
    score += 15;
  }

  if (input.matchWarnings.some((warning) => warning.toLowerCase().includes("low title overlap"))) {
    pushFlag(flags, "TITLE_MISMATCH", "high", "Title mismatch suggests the Amazon item may be different.");
    score += 14;
  }

  if (input.matchWarnings.some((warning) => warning.toLowerCase().includes("variant terms differ"))) {
    pushFlag(flags, "VARIANT_MISMATCH", "high", "Variant terms differ between eBay and Amazon.");
    score += 16;
  }

  if (input.matchConfidence < 55) {
    pushFlag(flags, "BRAND_MISMATCH", "medium", "Match confidence is low for a reliable sourcing decision.");
    score += 10;
  }

  if (input.marginPercent < 12) {
    pushFlag(flags, "LOW_MARGIN", "medium", "Margin is thin and could disappear with price movement.");
    score += 10;
  }

  if (
    input.minProfitThreshold !== undefined &&
    input.minProfitThreshold !== null &&
    input.netProfit < input.minProfitThreshold
  ) {
    pushFlag(flags, "LOW_PROFIT", "medium", "Net profit is below the saved search threshold.");
    score += 9;
  }

  if (input.candidate?.amazonPrice && input.candidate.featuredOfferPrice) {
    const spread = Math.abs(input.candidate.amazonPrice - input.candidate.featuredOfferPrice);
    if (spread / Math.max(input.candidate.amazonPrice, 1) > 0.18) {
      pushFlag(flags, "VOLATILE_PRICING", "medium", "Amazon pricing spread looks volatile.");
      score += 8;
    }
  }

  if (restrictedBrands.has(brand)) {
    pushFlag(flags, "POSSIBLE_RESTRICTION", "medium", "Brand may require ungating or extra compliance checks.");
    score += 8;
  }

  if (!input.listing.imageUrl || !input.candidate?.imageUrl) {
    pushFlag(flags, "IMAGE_UNVERIFIED", "low", "Image similarity has not been verified in MVP mode.");
    score += 5;
  }

  if (input.candidate?.featuredOfferPrice && input.listing.currentPrice < input.candidate.featuredOfferPrice * 0.4) {
    pushFlag(flags, "SUSPICIOUS_PRICE", "medium", "eBay price is unusually low relative to Amazon and needs review.");
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
