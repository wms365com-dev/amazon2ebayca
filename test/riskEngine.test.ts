import { describe, expect, it } from "vitest";

import { assessRisk } from "../src/services/risk/riskEngine";

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
});
