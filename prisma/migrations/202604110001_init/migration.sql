-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "name" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "categoryId" TEXT,
    "includeBrands" JSONB,
    "excludeBrands" JSONB,
    "minPrice" REAL,
    "maxPrice" REAL,
    "conditionFilter" TEXT,
    "buyItNowOnly" BOOLEAN NOT NULL DEFAULT true,
    "allowAuctions" BOOLEAN NOT NULL DEFAULT false,
    "maxShipping" REAL,
    "minROI" REAL,
    "minProfit" REAL,
    "scanFrequencyMinutes" INTEGER NOT NULL DEFAULT 60,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EbayListing" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ebayItemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "condition" TEXT,
    "buyingOptions" JSONB,
    "currentPrice" REAL NOT NULL,
    "shippingCost" REAL,
    "itemWebUrl" TEXT NOT NULL,
    "imageUrl" TEXT,
    "sellerUsername" TEXT,
    "sellerFeedbackPercentage" REAL,
    "sellerFeedbackScore" INTEGER,
    "gtin" TEXT,
    "brand" TEXT,
    "mpn" TEXT,
    "upc" TEXT,
    "categoryPath" TEXT,
    "locationCountry" TEXT,
    "listingEndAt" DATETIME,
    "rawJson" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AmazonMatch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ebayListingId" INTEGER NOT NULL,
    "asin" TEXT,
    "amazonTitle" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "packageQuantity" INTEGER,
    "sizeColorVariant" TEXT,
    "imageUrl" TEXT,
    "amazonPrice" REAL,
    "featuredOfferPrice" REAL,
    "feeEstimate" REAL,
    "fulfillmentFee" REAL,
    "referralFee" REAL,
    "matchConfidence" INTEGER NOT NULL,
    "matchMethod" TEXT NOT NULL,
    "matchReasons" JSONB,
    "matchWarnings" JSONB,
    "rawCatalogJson" JSONB,
    "rawPricingJson" JSONB,
    "rawFeesJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AmazonMatch_ebayListingId_fkey" FOREIGN KEY ("ebayListingId") REFERENCES "EbayListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "savedSearchId" INTEGER NOT NULL,
    "ebayListingId" INTEGER NOT NULL,
    "amazonMatchId" INTEGER,
    "ebayItemCost" REAL NOT NULL,
    "ebayShippingCost" REAL NOT NULL,
    "inboundCostEstimate" REAL NOT NULL,
    "prepCostEstimate" REAL NOT NULL,
    "labelCostEstimate" REAL NOT NULL,
    "otherCostEstimate" REAL NOT NULL,
    "totalLandedCost" REAL NOT NULL,
    "amazonSellPrice" REAL NOT NULL,
    "amazonFeeEstimate" REAL NOT NULL,
    "netProfit" REAL NOT NULL,
    "roiPercent" REAL NOT NULL,
    "marginPercent" REAL NOT NULL,
    "breakEvenSellPrice" REAL NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskFlags" JSONB,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "lastScannedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Opportunity_savedSearchId_fkey" FOREIGN KEY ("savedSearchId") REFERENCES "SavedSearch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Opportunity_ebayListingId_fkey" FOREIGN KEY ("ebayListingId") REFERENCES "EbayListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Opportunity_amazonMatchId_fkey" FOREIGN KEY ("amazonMatchId") REFERENCES "AmazonMatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpportunityStatusHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "opportunityId" INTEGER NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpportunityStatusHistory_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScanJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "savedSearchId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "triggeredBy" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "newOpportunityCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "summaryJson" JSONB,
    CONSTRAINT "ScanJob_savedSearchId_fkey" FOREIGN KEY ("savedSearchId") REFERENCES "SavedSearch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ApiLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestKey" TEXT,
    "statusCode" INTEGER,
    "isSuccess" BOOLEAN NOT NULL DEFAULT true,
    "isThrottled" BOOLEAN NOT NULL DEFAULT false,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "detail" JSONB,
    "scanJobId" INTEGER,
    "savedSearchId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiLog_scanJobId_fkey" FOREIGN KEY ("scanJobId") REFERENCES "ScanJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ApiLog_savedSearchId_fkey" FOREIGN KEY ("savedSearchId") REFERENCES "SavedSearch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "SavedSearch_isActive_idx" ON "SavedSearch"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "EbayListing_ebayItemId_key" ON "EbayListing"("ebayItemId");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonMatch_ebayListingId_key" ON "AmazonMatch"("ebayListingId");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_savedSearchId_ebayListingId_key" ON "Opportunity"("savedSearchId", "ebayListingId");

-- CreateIndex
CREATE INDEX "Opportunity_status_idx" ON "Opportunity"("status");

-- CreateIndex
CREATE INDEX "Opportunity_roiPercent_idx" ON "Opportunity"("roiPercent");

-- CreateIndex
CREATE INDEX "Opportunity_netProfit_idx" ON "Opportunity"("netProfit");

-- CreateIndex
CREATE INDEX "OpportunityStatusHistory_opportunityId_createdAt_idx" ON "OpportunityStatusHistory"("opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "ScanJob_savedSearchId_startedAt_idx" ON "ScanJob"("savedSearchId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- CreateIndex
CREATE INDEX "ApiLog_source_createdAt_idx" ON "ApiLog"("source", "createdAt");

-- CreateIndex
CREATE INDEX "ApiLog_isThrottled_idx" ON "ApiLog"("isThrottled");
