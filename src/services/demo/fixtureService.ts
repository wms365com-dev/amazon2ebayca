import fs from "fs/promises";
import path from "path";

import { AmazonCatalogCandidate, NormalizedEbayListing } from "../../types/domain";

let ebayFixtureCache: NormalizedEbayListing[] | null = null;
let amazonCatalogCache: AmazonCatalogCandidate[] | null = null;

async function readJson<T>(fileName: string): Promise<T> {
  const filePath = path.join(process.cwd(), "data", "fixtures", fileName);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function loadDemoEbayListings(): Promise<NormalizedEbayListing[]> {
  if (!ebayFixtureCache) {
    ebayFixtureCache = await readJson<NormalizedEbayListing[]>("ebay-listings.json");
  }

  return ebayFixtureCache;
}

export async function loadDemoAmazonCatalog(): Promise<AmazonCatalogCandidate[]> {
  if (!amazonCatalogCache) {
    amazonCatalogCache = await readJson<AmazonCatalogCandidate[]>("amazon-catalog.json");
  }

  return amazonCatalogCache;
}

export async function loadDemoAmazonPricing() {
  return readJson<Record<string, { amazonPrice: number; featuredOfferPrice: number; rawPricingJson: unknown }>>(
    "amazon-pricing.json"
  );
}

export async function loadDemoAmazonFees() {
  return readJson<Record<string, { feeEstimate: number; fulfillmentFee: number; referralFee: number; rawFeesJson: unknown }>>(
    "amazon-fees.json"
  );
}
