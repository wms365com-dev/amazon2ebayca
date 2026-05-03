import { Request, Response } from "express";

import { env } from "../config/env";
import { settingsSchema } from "../models/validators";
import { getConnectorModes } from "../services/demo/demoMode";
import { getAppSettings, updateSettings } from "../services/settingsService";
import { parseCheckbox, parseCommaList, parseCurrencyInput, parseIntegerInput, sanitizeText } from "../utils/forms";
import { redirectWithNotice } from "../utils/redirect";

export async function renderSettings(req: Request, res: Response) {
  const settings = await getAppSettings();
  const connectorModes = getConnectorModes(settings);

  res.render("settings/index", {
    title: "Settings",
    settings,
    connectorModes,
    envStatus: {
      ebayConfigured: env.hasEbayCredentials,
      amazonConfigured: env.hasAmazonCredentials,
      ebayEnvironment: env.EBAY_ENVIRONMENT
    }
  });
}

export async function saveSettings(req: Request, res: Response) {
  const payload = settingsSchema.parse({
    amazonMarketplaceId: sanitizeText(req.body.amazonMarketplaceId),
    defaultInboundCost: parseCurrencyInput(req.body.defaultInboundCost) ?? 0,
    defaultPrepCost: parseCurrencyInput(req.body.defaultPrepCost) ?? 0,
    defaultLabelCost: parseCurrencyInput(req.body.defaultLabelCost) ?? 0,
    defaultOtherCost: parseCurrencyInput(req.body.defaultOtherCost) ?? 0,
    defaultOutboundShippingCost: parseCurrencyInput(req.body.defaultOutboundShippingCost) ?? 0,
    defaultEbayFinalValueFeePercent: Number(req.body.defaultEbayFinalValueFeePercent ?? 0),
    defaultEbayFixedFee: parseCurrencyInput(req.body.defaultEbayFixedFee) ?? 0,
    applySalesTax: parseCheckbox(req.body.applySalesTax),
    salesTaxRate: Number(req.body.salesTaxRate ?? 0),
    schedulerEnabled: parseCheckbox(req.body.schedulerEnabled),
    schedulerMinIntervalMinutes: parseIntegerInput(req.body.schedulerMinIntervalMinutes, 1440),
    rateLimitSafeMode: parseCheckbox(req.body.rateLimitSafeMode),
    demoModeOverride: parseCheckbox(req.body.demoModeOverride),
    opportunityMinConfidence: parseIntegerInput(req.body.opportunityMinConfidence, 60),
    opportunityMaxRisk: parseIntegerInput(req.body.opportunityMaxRisk, 55),
    requireImageVerification: parseCheckbox(req.body.requireImageVerification),
    ipComplaintBrands: parseCommaList(req.body.ipComplaintBrands)
  });

  await updateSettings(payload);
  redirectWithNotice(res, "/settings", { notice: "Settings saved." });
}
