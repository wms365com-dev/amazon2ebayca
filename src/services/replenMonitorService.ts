import { Marketplace, SavedSearchKind } from "@prisma/client";

import { prisma } from "../db/prisma";
import { AmazonService } from "./amazon/amazonService";
import { getAppSettings } from "./settingsService";

const amazonService = new AmazonService();

export interface MonitoredImportInput {
  asinsText: string;
  targetBuyPrice: number | null;
  maxShipping: number | null;
  minROI: number | null;
  minProfit: number | null;
  scanFrequencyMinutes: number;
  isActive: boolean;
  notes?: string | null;
}

export interface MonitoredProductUpdateInput {
  sourceKeywords: string;
  targetBuyPrice: number | null;
  maxShipping: number | null;
  minROI: number | null;
  minProfit: number | null;
  scanFrequencyMinutes: number;
  conditionFilter?: string | null;
  isActive: boolean;
  notes?: string | null;
}

export interface MonitoredImportSummary {
  requested: number;
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
}

function shorten(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3).trim()}...` : value;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function parseAsinInput(input: string) {
  const values = input
    .toUpperCase()
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  const valid = new Set<string>();
  const invalid = new Set<string>();

  for (const value of values) {
    if (/^[A-Z0-9]{10}$/.test(value)) {
      valid.add(value);
    } else {
      invalid.add(value);
    }
  }

  return {
    valid: [...valid],
    invalid: [...invalid]
  };
}

export function buildReplenSearchKeywords(candidate: {
  title: string;
  brand?: string | null;
  model?: string | null;
}) {
  const parts = [candidate.brand, candidate.model, candidate.title]
    .filter(Boolean)
    .map((value) => normalizeWhitespace(String(value)));
  const uniqueParts: string[] = [];

  for (const part of parts) {
    if (!uniqueParts.some((existing) => existing.toLowerCase() === part.toLowerCase())) {
      uniqueParts.push(part);
    }
  }

  return shorten(normalizeWhitespace(uniqueParts.join(" ")), 220);
}

function buildSavedSearchName(title: string) {
  return `Replen - ${shorten(normalizeWhitespace(title), 72)}`;
}

function buildExcludeBrands(brand: string | null | undefined) {
  const values = ["Generic", "Compatible", "Unbranded"];
  if (brand) {
    values.push(`For ${brand}`);
  }

  return values;
}

async function lookupAmazonTarget(asin: string, amazonMarketplaceId: string) {
  const candidate = await amazonService.getCatalogItemByAsin(asin, amazonMarketplaceId);
  if (!candidate) {
    return null;
  }

  const pricing = await amazonService.getPricingForAsin(asin, amazonMarketplaceId);
  const destinationPrice =
    pricing.featuredOfferPrice ?? pricing.amazonPrice ?? candidate.featuredOfferPrice ?? candidate.amazonPrice;
  const fees = destinationPrice
    ? await amazonService.getFeeEstimateForAsin(asin, destinationPrice, amazonMarketplaceId)
    : { feeEstimate: null };

  return {
    candidate,
    destinationPrice: destinationPrice ?? null,
    feeEstimate: fees.feeEstimate ?? null
  };
}

export async function importMonitoredProducts(input: MonitoredImportInput): Promise<MonitoredImportSummary> {
  const settings = await getAppSettings();
  const user = await prisma.user.findFirstOrThrow();
  const parsed = parseAsinInput(input.asinsText);
  const summary: MonitoredImportSummary = {
    requested: parsed.valid.length,
    created: 0,
    updated: 0,
    skipped: 0,
    warnings: parsed.invalid.map((value) => `${value}: invalid ASIN format`)
  };

  for (const asin of parsed.valid) {
    try {
      const target = await lookupAmazonTarget(asin, settings.amazonMarketplaceId);
      if (!target) {
        summary.skipped += 1;
        summary.warnings.push(`${asin}: Amazon catalog item not found`);
        continue;
      }

      const sourceKeywords = buildReplenSearchKeywords(target.candidate);
      const existing = await prisma.monitoredProduct.findUnique({
        where: {
          asin_amazonMarketplaceId: {
            asin,
            amazonMarketplaceId: settings.amazonMarketplaceId
          }
        },
        include: {
          savedSearch: true
        }
      });

      const savedSearchData = {
        userId: user.id,
        name: buildSavedSearchName(target.candidate.title),
        kind: SavedSearchKind.REPLEN_MONITOR,
        sourceMarketplace: Marketplace.EBAY_CA,
        destinationMarketplace: Marketplace.AMAZON_CA,
        keywords: sourceKeywords,
        categoryId: null,
        includeBrands: target.candidate.brand ? [target.candidate.brand] : [],
        excludeBrands: buildExcludeBrands(target.candidate.brand ?? null),
        minPrice: null,
        maxPrice: input.targetBuyPrice,
        conditionFilter: "NEW",
        buyItNowOnly: true,
        allowAuctions: false,
        maxShipping: input.maxShipping,
        minROI: input.minROI,
        minProfit: input.minProfit,
        scanFrequencyMinutes: input.scanFrequencyMinutes,
        isActive: input.isActive
      };

      if (existing) {
        await prisma.savedSearch.update({
          where: { id: existing.savedSearchId },
          data: savedSearchData
        });

        await prisma.monitoredProduct.update({
          where: { id: existing.id },
          data: {
            userId: user.id,
            title: target.candidate.title,
            brand: target.candidate.brand ?? null,
            model: target.candidate.model ?? null,
            imageUrl: target.candidate.imageUrl ?? null,
            packageQuantity: target.candidate.packageQuantity ?? null,
            sourceKeywords,
            targetBuyPrice: input.targetBuyPrice,
            notes: input.notes?.trim() || null,
            lastAmazonPrice: target.destinationPrice,
            lastAmazonFeeEstimate: target.feeEstimate,
            lastAmazonSyncAt: new Date()
          }
        });

        summary.updated += 1;
        continue;
      }

      const savedSearch = await prisma.savedSearch.create({
        data: savedSearchData
      });

      await prisma.monitoredProduct.create({
        data: {
          userId: user.id,
          savedSearchId: savedSearch.id,
          asin,
          amazonMarketplaceId: settings.amazonMarketplaceId,
          title: target.candidate.title,
          brand: target.candidate.brand ?? null,
          model: target.candidate.model ?? null,
          imageUrl: target.candidate.imageUrl ?? null,
          packageQuantity: target.candidate.packageQuantity ?? null,
          sourceKeywords,
          targetBuyPrice: input.targetBuyPrice,
          notes: input.notes?.trim() || null,
          lastAmazonPrice: target.destinationPrice,
          lastAmazonFeeEstimate: target.feeEstimate,
          lastAmazonSyncAt: new Date()
        }
      });

      summary.created += 1;
    } catch (error) {
      summary.skipped += 1;
      summary.warnings.push(`${asin}: ${error instanceof Error ? error.message : "unknown import error"}`);
    }
  }

  return summary;
}

export async function updateMonitoredProduct(id: number, input: MonitoredProductUpdateInput) {
  const monitoredProduct = await prisma.monitoredProduct.findUniqueOrThrow({
    where: { id },
    include: { savedSearch: true }
  });

  await prisma.savedSearch.update({
    where: { id: monitoredProduct.savedSearchId },
    data: {
      keywords: normalizeWhitespace(input.sourceKeywords),
      maxPrice: input.targetBuyPrice,
      maxShipping: input.maxShipping,
      minROI: input.minROI,
      minProfit: input.minProfit,
      scanFrequencyMinutes: input.scanFrequencyMinutes,
      conditionFilter: input.conditionFilter?.trim() || "NEW",
      isActive: input.isActive
    }
  });

  await prisma.monitoredProduct.update({
    where: { id },
    data: {
      sourceKeywords: normalizeWhitespace(input.sourceKeywords),
      targetBuyPrice: input.targetBuyPrice,
      notes: input.notes?.trim() || null
    }
  });
}
