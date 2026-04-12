import { OpportunityStatus } from "@prisma/client";
import { z } from "zod";

export const savedSearchSchema = z.object({
  name: z.string().min(2).max(120),
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
});

export const settingsSchema = z.object({
  amazonMarketplaceId: z.string().min(3),
  defaultInboundCost: z.number().nonnegative(),
  defaultPrepCost: z.number().nonnegative(),
  defaultLabelCost: z.number().nonnegative(),
  defaultOtherCost: z.number().nonnegative(),
  applySalesTax: z.boolean(),
  salesTaxRate: z.number().min(0).max(1),
  schedulerEnabled: z.boolean(),
  rateLimitSafeMode: z.boolean(),
  demoModeOverride: z.boolean()
});

export const opportunityStatusSchema = z.object({
  status: z.nativeEnum(OpportunityStatus),
  note: z.string().max(500).optional()
});

export const opportunityNoteSchema = z.object({
  notes: z.string().max(4000).optional()
});
