ALTER TABLE "SavedSearch" ADD COLUMN "scanLeaseToken" TEXT;
ALTER TABLE "SavedSearch" ADD COLUMN "scanLeaseExpiresAt" DATETIME;

CREATE INDEX "SavedSearch_scanLeaseExpiresAt_idx" ON "SavedSearch"("scanLeaseExpiresAt");
