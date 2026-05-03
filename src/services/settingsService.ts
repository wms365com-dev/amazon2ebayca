import { prisma } from "../db/prisma";
import { AppSettings } from "../types/domain";

const DEFAULT_SETTING_VALUES: Record<keyof AppSettings, string> = {
  amazonMarketplaceId: "A2EUQ1WTGCTBG2",
  defaultInboundCost: "3.50",
  defaultPrepCost: "1.25",
  defaultLabelCost: "0.35",
  defaultOtherCost: "0.00",
  defaultOutboundShippingCost: "9.50",
  defaultEbayFinalValueFeePercent: "0.13",
  defaultEbayFixedFee: "0.30",
  applySalesTax: "false",
  salesTaxRate: "0.13",
  schedulerEnabled: "true",
  schedulerMinIntervalMinutes: "1440",
  rateLimitSafeMode: "true",
  demoModeOverride: "false",
  opportunityMinConfidence: "60",
  opportunityMaxRisk: "55",
  requireImageVerification: "true",
  ipComplaintBrands: ""
};

function parseBoolean(value: string | undefined, fallback = false) {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseNumber(value: string | undefined, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseStringList(value: string | undefined) {
  return String(value ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function ensureDefaultSettings() {
  await Promise.all(
    Object.entries(DEFAULT_SETTING_VALUES).map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        update: {},
        create: { key, value }
      })
    )
  );
}

export async function getAppSettings(): Promise<AppSettings> {
  await ensureDefaultSettings();
  const rows = await prisma.appSetting.findMany();
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return {
    amazonMarketplaceId: map.amazonMarketplaceId ?? DEFAULT_SETTING_VALUES.amazonMarketplaceId,
    defaultInboundCost: parseNumber(map.defaultInboundCost, 3.5),
    defaultPrepCost: parseNumber(map.defaultPrepCost, 1.25),
    defaultLabelCost: parseNumber(map.defaultLabelCost, 0.35),
    defaultOtherCost: parseNumber(map.defaultOtherCost, 0),
    defaultOutboundShippingCost: parseNumber(map.defaultOutboundShippingCost, 9.5),
    defaultEbayFinalValueFeePercent: parseNumber(map.defaultEbayFinalValueFeePercent, 0.13),
    defaultEbayFixedFee: parseNumber(map.defaultEbayFixedFee, 0.3),
    applySalesTax: parseBoolean(map.applySalesTax),
    salesTaxRate: parseNumber(map.salesTaxRate, 0.13),
    schedulerEnabled: parseBoolean(map.schedulerEnabled, true),
    schedulerMinIntervalMinutes: parseNumber(map.schedulerMinIntervalMinutes, 1440),
    rateLimitSafeMode: parseBoolean(map.rateLimitSafeMode, true),
    demoModeOverride: parseBoolean(map.demoModeOverride),
    opportunityMinConfidence: parseNumber(map.opportunityMinConfidence, 60),
    opportunityMaxRisk: parseNumber(map.opportunityMaxRisk, 55),
    requireImageVerification: parseBoolean(map.requireImageVerification, true),
    ipComplaintBrands: parseStringList(map.ipComplaintBrands)
  };
}

export async function updateSettings(input: Partial<AppSettings>) {
  const entries = Object.entries(input) as [keyof AppSettings, AppSettings[keyof AppSettings]][];

  await Promise.all(
    entries.map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) }
      })
    )
  );
}
