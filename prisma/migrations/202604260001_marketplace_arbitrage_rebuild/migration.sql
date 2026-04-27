ALTER TABLE "SavedSearch" ADD COLUMN "sourceMarketplace" TEXT NOT NULL DEFAULT 'EBAY_CA';
ALTER TABLE "SavedSearch" ADD COLUMN "destinationMarketplace" TEXT NOT NULL DEFAULT 'AMAZON_CA';

CREATE INDEX "SavedSearch_sourceMarketplace_destinationMarketplace_idx" ON "SavedSearch"("sourceMarketplace", "destinationMarketplace");

CREATE TABLE "MarketplaceListing" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "marketplace" TEXT NOT NULL,
    "externalListingId" TEXT NOT NULL,
    "listingKind" TEXT NOT NULL DEFAULT 'OFFER',
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "condition" TEXT,
    "buyingOptions" JSONB,
    "currentPrice" REAL NOT NULL,
    "shippingCost" REAL,
    "listingUrl" TEXT NOT NULL,
    "imageUrl" TEXT,
    "sellerName" TEXT,
    "sellerFeedbackPercentage" REAL,
    "sellerFeedbackScore" INTEGER,
    "gtin" TEXT,
    "brand" TEXT,
    "mpn" TEXT,
    "upc" TEXT,
    "categoryPath" TEXT,
    "locationCountry" TEXT,
    "quantityAvailable" INTEGER,
    "packageQuantity" INTEGER,
    "variant" TEXT,
    "listingEndAt" DATETIME,
    "rawJson" JSONB NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ListingSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "marketplaceListingId" INTEGER NOT NULL,
    "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "price" REAL NOT NULL,
    "shippingCost" REAL,
    "quantityAvailable" INTEGER,
    "rawJson" JSONB,
    CONSTRAINT "ListingSnapshot_marketplaceListingId_fkey" FOREIGN KEY ("marketplaceListingId") REFERENCES "MarketplaceListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ListingMatch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sourceListingId" INTEGER NOT NULL,
    "destinationListingId" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "matchMethod" TEXT NOT NULL,
    "reasons" JSONB,
    "warnings" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ListingMatch_sourceListingId_fkey" FOREIGN KEY ("sourceListingId") REFERENCES "MarketplaceListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListingMatch_destinationListingId_fkey" FOREIGN KEY ("destinationListingId") REFERENCES "MarketplaceListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ArbitrageOpportunity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "opportunityKey" TEXT NOT NULL,
    "savedSearchId" INTEGER NOT NULL,
    "sourceListingId" INTEGER NOT NULL,
    "destinationListingId" INTEGER,
    "listingMatchId" INTEGER,
    "sourceItemCost" REAL NOT NULL,
    "sourceShippingCost" REAL NOT NULL,
    "sourceFeeEstimate" REAL NOT NULL,
    "destinationSellPrice" REAL NOT NULL,
    "destinationShippingCredit" REAL NOT NULL,
    "destinationFeeEstimate" REAL NOT NULL,
    "fulfillmentCostEstimate" REAL NOT NULL,
    "prepCostEstimate" REAL NOT NULL,
    "labelCostEstimate" REAL NOT NULL,
    "otherCostEstimate" REAL NOT NULL,
    "totalCost" REAL NOT NULL,
    "netProfit" REAL NOT NULL,
    "roiPercent" REAL NOT NULL,
    "marginPercent" REAL NOT NULL,
    "breakEvenSellPrice" REAL NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskFlags" JSONB,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "lastScannedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ArbitrageOpportunity_savedSearchId_fkey" FOREIGN KEY ("savedSearchId") REFERENCES "SavedSearch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ArbitrageOpportunity_sourceListingId_fkey" FOREIGN KEY ("sourceListingId") REFERENCES "MarketplaceListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ArbitrageOpportunity_destinationListingId_fkey" FOREIGN KEY ("destinationListingId") REFERENCES "MarketplaceListing" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ArbitrageOpportunity_listingMatchId_fkey" FOREIGN KEY ("listingMatchId") REFERENCES "ListingMatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ArbitrageOpportunityStatusHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "opportunityId" INTEGER NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArbitrageOpportunityStatusHistory_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "ArbitrageOpportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ArbitrageOpportunitySnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "opportunityId" INTEGER NOT NULL,
    "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceItemCost" REAL NOT NULL,
    "destinationSellPrice" REAL NOT NULL,
    "destinationFeeEstimate" REAL NOT NULL,
    "netProfit" REAL NOT NULL,
    "roiPercent" REAL NOT NULL,
    "marginPercent" REAL NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "calculationJson" JSONB,
    CONSTRAINT "ArbitrageOpportunitySnapshot_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "ArbitrageOpportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ApiCacheEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "cachedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "MarketplaceListing_marketplace_externalListingId_key" ON "MarketplaceListing"("marketplace", "externalListingId");
CREATE INDEX "MarketplaceListing_marketplace_brand_currentPrice_idx" ON "MarketplaceListing"("marketplace", "brand", "currentPrice");
CREATE INDEX "ListingSnapshot_marketplaceListingId_observedAt_idx" ON "ListingSnapshot"("marketplaceListingId", "observedAt");
CREATE UNIQUE INDEX "ListingMatch_sourceListingId_destinationListingId_key" ON "ListingMatch"("sourceListingId", "destinationListingId");
CREATE INDEX "ListingMatch_confidence_idx" ON "ListingMatch"("confidence");
CREATE UNIQUE INDEX "ArbitrageOpportunity_opportunityKey_key" ON "ArbitrageOpportunity"("opportunityKey");
CREATE INDEX "ArbitrageOpportunity_savedSearchId_status_idx" ON "ArbitrageOpportunity"("savedSearchId", "status");
CREATE INDEX "ArbitrageOpportunity_roiPercent_idx" ON "ArbitrageOpportunity"("roiPercent");
CREATE INDEX "ArbitrageOpportunity_netProfit_idx" ON "ArbitrageOpportunity"("netProfit");
CREATE INDEX "ArbitrageOpportunity_confidenceScore_idx" ON "ArbitrageOpportunity"("confidenceScore");
CREATE INDEX "ArbitrageOpportunityStatusHistory_opportunityId_createdAt_idx" ON "ArbitrageOpportunityStatusHistory"("opportunityId", "createdAt");
CREATE INDEX "ArbitrageOpportunitySnapshot_opportunityId_observedAt_idx" ON "ArbitrageOpportunitySnapshot"("opportunityId", "observedAt");
CREATE UNIQUE INDEX "ApiCacheEntry_key_key" ON "ApiCacheEntry"("key");
