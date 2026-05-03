import { Marketplace, OpportunityStatus } from "@prisma/client";
import { z } from "zod";

export const savedSearchSchema = z
  .object({
    name: z.string().min(2).max(120),
    sourceMarketplace: z.nativeEnum(Marketplace),
    destinationMarketplace: z.nativeEnum(Marketplace),
    keywords: z.string().min(2).max(250),
    categoryId: z.string().max(50).optional().or(z.literal("")),
    includeBrands: z.array(z.string()).default([]),
    excludeBrands: z.array(z.string()).default([]),
    minPrice: z.number().nonnegative().nullable(),
    maxPrice: z.number().nonnegative().nullable(),
    conditionFilter: z.string().max(50).optional().or(z.literal("")),
    buyItNowOnly: z.boolean().default(true),
    allowAuctions: z.boolean().default(false),
    maxShipping: z.number().nonnegative().nullable(),
    minROI: z.number().nullable(),
    minProfit: z.number().nullable(),
    scanFrequencyMinutes: z.number().int().min(5).max(1440),
    isActive: z.boolean().default(true)
  })
  .refine((input) => input.sourceMarketplace !== input.destinationMarketplace, {
    message: "Source and destination marketplaces must be different.",
    path: ["destinationMarketplace"]
  });

export const settingsSchema = z.object({
  amazonMarketplaceId: z.string().min(3),
  defaultInboundCost: z.number().nonnegative(),
  defaultPrepCost: z.number().nonnegative(),
  defaultLabelCost: z.number().nonnegative(),
  defaultOtherCost: z.number().nonnegative(),
  defaultOutboundShippingCost: z.number().nonnegative(),
  defaultEbayFinalValueFeePercent: z.number().min(0).max(1),
  defaultEbayFixedFee: z.number().nonnegative(),
  applySalesTax: z.boolean(),
  salesTaxRate: z.number().min(0).max(1),
  schedulerEnabled: z.boolean(),
  schedulerMinIntervalMinutes: z.number().int().min(5).max(1440),
  rateLimitSafeMode: z.boolean(),
  demoModeOverride: z.boolean(),
  opportunityMinConfidence: z.number().int().min(0).max(100),
  opportunityMaxRisk: z.number().int().min(0).max(100),
  requireImageVerification: z.boolean(),
  ipComplaintBrands: z.array(z.string().min(1).max(100)).default([])
});

export const opportunityStatusSchema = z.object({
  status: z.nativeEnum(OpportunityStatus),
  note: z.string().max(500).optional()
});

export const opportunityNoteSchema = z.object({
  notes: z.string().max(4000).optional()
});

export const monitoredImportSchema = z.object({
  asinsText: z.string().min(3).max(10000),
  targetBuyPrice: z.number().nonnegative().nullable(),
  maxShipping: z.number().nonnegative().nullable(),
  minROI: z.number().nullable(),
  minProfit: z.number().nullable(),
  scanFrequencyMinutes: z.number().int().min(5).max(1440),
  isActive: z.boolean().default(true),
  notes: z.string().max(2000).optional().or(z.literal(""))
});

export const monitoredProductUpdateSchema = z.object({
  sourceKeywords: z.string().min(2).max(250),
  targetBuyPrice: z.number().nonnegative().nullable(),
  maxShipping: z.number().nonnegative().nullable(),
  minROI: z.number().nullable(),
  minProfit: z.number().nullable(),
  scanFrequencyMinutes: z.number().int().min(5).max(1440),
  conditionFilter: z.string().max(50).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  notes: z.string().max(2000).optional().or(z.literal(""))
});
