import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppSettings } from "../src/types/domain";

const baseSettings: AppSettings = {
  amazonMarketplaceId: "A2EUQ1WTGCTBG2",
  defaultInboundCost: 1.5,
  defaultPrepCost: 0.5,
  defaultLabelCost: 0.25,
  defaultOtherCost: 0,
  defaultOutboundShippingCost: 0,
  defaultEbayFinalValueFeePercent: 0.13,
  defaultEbayFixedFee: 0.3,
  applySalesTax: false,
  salesTaxRate: 0,
  schedulerEnabled: true,
  schedulerMinIntervalMinutes: 1440,
  rateLimitSafeMode: true,
  demoModeOverride: false,
  opportunityMinConfidence: 60,
  opportunityMaxRisk: 55,
  requireImageVerification: true,
  ipComplaintBrands: []
};

async function loadDemoMode(envOverrides: Partial<Record<string, unknown>>) {
  vi.resetModules();
  vi.doMock("../src/config/env", () => ({
    env: {
      demoModeRequested: false,
      hasEbayCredentials: false,
      hasAmazonCredentials: false,
      ...envOverrides
    }
  }));

  return import("../src/services/demo/demoMode");
}

afterEach(() => {
  vi.resetModules();
  vi.unmock("../src/config/env");
});

describe("demoMode connector routing", () => {
  it("keeps eBay live when its credentials exist and Amazon falls back", async () => {
    const demoMode = await loadDemoMode({
      demoModeRequested: true,
      hasEbayCredentials: true,
      hasAmazonCredentials: false
    });

    const modes = demoMode.getConnectorModes(baseSettings);

    expect(modes.ebay.mode).toBe("live");
    expect(modes.amazon.mode).toBe("demo");
    expect(modes.mixedMode).toBe(true);
    expect(modes.headline).toBe("Mixed live and demo mode");
  });

  it("forces every connector into demo when the settings override is enabled", async () => {
    const demoMode = await loadDemoMode({
      demoModeRequested: false,
      hasEbayCredentials: true,
      hasAmazonCredentials: true
    });

    const modes = demoMode.getConnectorModes({
      ...baseSettings,
      demoModeOverride: true
    });

    expect(modes.ebay.mode).toBe("demo");
    expect(modes.amazon.mode).toBe("demo");
    expect(demoMode.isDemoModeActive({ ...baseSettings, demoModeOverride: true })).toBe(true);
  });

  it("marks connectors as missing when fallback is off and credentials are absent", async () => {
    const demoMode = await loadDemoMode({
      demoModeRequested: false,
      hasEbayCredentials: false,
      hasAmazonCredentials: false
    });

    const modes = demoMode.getConnectorModes(baseSettings);

    expect(modes.ebay.mode).toBe("missing");
    expect(modes.amazon.mode).toBe("missing");
    expect(modes.hasMissingCredentials).toBe(true);
    expect(modes.anyDemo).toBe(false);
  });
});
