ALTER TABLE "SavedSearch" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'MANUAL';

CREATE TABLE "MonitoredProduct" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "savedSearchId" INTEGER NOT NULL,
    "asin" TEXT NOT NULL,
    "amazonMarketplaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "imageUrl" TEXT,
    "packageQuantity" INTEGER,
    "sourceKeywords" TEXT NOT NULL,
    "targetBuyPrice" REAL,
    "notes" TEXT,
    "lastAmazonPrice" REAL,
    "lastAmazonFeeEstimate" REAL,
    "lastAmazonSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonitoredProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MonitoredProduct_savedSearchId_fkey" FOREIGN KEY ("savedSearchId") REFERENCES "SavedSearch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MonitoredProduct_savedSearchId_key" ON "MonitoredProduct"("savedSearchId");
CREATE UNIQUE INDEX "MonitoredProduct_asin_amazonMarketplaceId_key" ON "MonitoredProduct"("asin", "amazonMarketplaceId");
CREATE INDEX "SavedSearch_kind_isActive_idx" ON "SavedSearch"("kind", "isActive");
CREATE INDEX "MonitoredProduct_brand_updatedAt_idx" ON "MonitoredProduct"("brand", "updatedAt");
