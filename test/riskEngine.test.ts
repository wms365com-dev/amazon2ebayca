import { Marketplace } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { assessArbitrageRisk, assessRisk } from "../src/services/risk/riskEngine";

describe("assessRisk", () => {
  it("flags used listings with low seller quality and no barcode as risky", () => {
    const result = assessRisk({
      listing: {
        ebayItemId: "test",
        title: "Nintendo Switch Pro Controller Open Box",
        condition: "USED",
        buyingOptions: ["FIXED_PRICE"],
        currentPrice: 40,
        shippingCost: 10,
        itemWebUrl: "https://example.com",
        sellerFeedbackPercentage: 93,
        sellerFeedbackScore: 32,
        brand: "Nintendo",
        rawJson: {}
      },
      matchConfidence: 45,
      matchWarnings: ["Low title overlap", "Pack count differs"],
      candidate: {
        asin: "B01NAWKYZ0",
        title: "Nintendo Switch Pro Controller Black",
        brand: "Nintendo",
        featuredOfferPrice: 96.49
      },
      netProfit: 4,
      marginPercent: 5,
      minProfitThreshold: 8
    });

    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.flags.map((flag) => flag.code)).toEqual(
      expect.arrayContaining(["NO_BARCODE", "USED_CONDITION", "LOW_SELLER_FEEDBACK", "LOW_PROFIT"])
    );
  });

  it("flags complaint-list brands and missing images for review", () => {
    const result = assessArbitrageRisk({
      sourceListing: {
        marketplace: Marketplace.EBAY_CA,
        externalListingId: "ebay-1",
        listingKind: "OFFER",
        title: "LEGO Speed Champions sealed set",
        subtitle: null,
        condition: "NEW",
        buyingOptions: ["FIXED_PRICE"],
        currentPrice: 29.99,
        shippingCost: 12,
        listingUrl: "https://example.com/source",
        imageUrl: null,
        sellerName: "seller",
        sellerFeedbackPercentage: 99,
        sellerFeedbackScore: 500,
        gtin: "123456789012",
        brand: "LEGO",
        mpn: null,
        upc: "123456789012",
        categoryPath: null,
        locationCountry: "CA",
        quantityAvailable: 1,
        packageQuantity: 1,
        variant: null,
        listingEndAt: null,
        rawJson: {}
      },
      destinationListing: {
        marketplace: Marketplace.AMAZON_CA,
        externalListingId: "B000TEST",
        listingKind: "CATALOG",
        title: "LEGO Speed Champions Building Set",
        subtitle: null,
        condition: "NEW",
        buyingOptions: ["CATALOG"],
        currentPrice: 69.99,
        shippingCost: 0,
        listingUrl: "https://example.com/destination",
        imageUrl: null,
        sellerName: null,
        sellerFeedbackPercentage: null,
        sellerFeedbackScore: null,
        gtin: "123456789012",
        brand: "LEGO",
        mpn: null,
        upc: "123456789012",
        categoryPath: null,
        locationCountry: "CA",
        quantityAvailable: null,
        packageQuantity: 1,
        variant: null,
        listingEndAt: null,
        rawJson: {}
      },
      destinationMarketplace: Marketplace.AMAZON_CA,
      matchConfidence: 88,
      matchWarnings: [],
      netProfit: 18,
      marginPercent: 25,
      minProfitThreshold: 8,
      ipComplaintBrands: ["LEGO"]
    });

    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.flags.map((flag) => flag.code)).toEqual(
      expect.arrayContaining(["IP_COMPLAINT_BRAND", "IMAGE_UNVERIFIED"])
    );
  });
});
