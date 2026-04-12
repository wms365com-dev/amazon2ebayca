import { MatchMethod, OpportunityStatus } from "@prisma/client";

export interface NormalizedEbayListing {
  ebayItemId: string;
  title: string;
  subtitle?: string | null;
  condition?: string | null;
  buyingOptions: string[];
  currentPrice: number;
  shippingCost?: number | null;
  itemWebUrl: string;
  imageUrl?: string | null;
  sellerUsername?: string | null;
  sellerFeedbackPercentage?: number | null;
  sellerFeedbackScore?: number | null;
  gtin?: string | null;
  brand?: string | null;
  mpn?: string | null;
  upc?: string | null;
  categoryPath?: string | null;
  locationCountry?: string | null;
  listingEndAt?: string | null;
  rawJson: unknown;
}

export interface AmazonCatalogCandidate {
  asin: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  packageQuantity?: number | null;
  sizeColorVariant?: string | null;
  imageUrl?: string | null;
  amazonPrice?: number | null;
  featuredOfferPrice?: number | null;
  feeEstimate?: number | null;
  fulfillmentFee?: number | null;
  referralFee?: number | null;
  identifiers?: string[];
  rawCatalogJson?: unknown;
  rawPricingJson?: unknown;
  rawFeesJson?: unknown;
}

export interface MatchingEvidence {
  bestCandidate: AmazonCatalogCandidate | null;
  confidence: number;
  method: MatchMethod;
  reasons: string[];
  warnings: string[];
}

export interface ProfitCalculationInput {
  ebayItemPrice: number;
  ebayShippingCost: number;
  inboundCost: number;
  prepCost: number;
  labelCost: number;
  otherCost: number;
  amazonSellPrice: number;
  amazonFeeEstimate: number;
}

export interface ProfitCalculationResult {
  totalLandedCost: number;
  netProfit: number;
  roiPercent: number;
  marginPercent: number;
  breakEvenSellPrice: number;
}

export interface RiskFlag {
  code:
    | "NO_BARCODE"
    | "USED_CONDITION"
    | "LOW_SELLER_FEEDBACK"
    | "LOW_SELLER_VOLUME"
    | "PACK_COUNT_UNCLEAR"
    | "TITLE_MISMATCH"
    | "BRAND_MISMATCH"
    | "VARIANT_MISMATCH"
    | "LOW_MARGIN"
    | "LOW_PROFIT"
    | "POSSIBLE_RESTRICTION"
    | "VOLATILE_PRICING"
    | "IMAGE_UNVERIFIED"
    | "SUSPICIOUS_PRICE";
  severity: "low" | "medium" | "high";
  message: string;
}

export interface RiskAssessment {
  score: number;
  flags: RiskFlag[];
  summary: string;
}

export interface OpportunityFilters {
  profitableOnly?: boolean;
  minROI?: number;
  minProfit?: number;
  minConfidence?: number;
  maxRisk?: number;
  sourceSearchId?: number;
  status?: OpportunityStatus;
  sortBy?: "roi" | "profit" | "confidence" | "recent";
}

export interface ScanSummary {
  listingsFetched: number;
  listingsProcessed: number;
  matchesFound: number;
  opportunitiesCreated: number;
  warnings: string[];
}

export interface AppSettings {
  amazonMarketplaceId: string;
  defaultInboundCost: number;
  defaultPrepCost: number;
  defaultLabelCost: number;
  defaultOtherCost: number;
  applySalesTax: boolean;
  salesTaxRate: number;
  schedulerEnabled: boolean;
  rateLimitSafeMode: boolean;
  demoModeOverride: boolean;
}
