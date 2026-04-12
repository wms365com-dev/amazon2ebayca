import { describe, expect, it } from "vitest";

import { calculateProfit } from "../src/services/calculator/profitCalculator";

describe("calculateProfit", () => {
  it("calculates landed cost, profit, ROI, margin, and break-even", () => {
    const result = calculateProfit({
      ebayItemPrice: 50,
      ebayShippingCost: 10,
      inboundCost: 3.5,
      prepCost: 1.25,
      labelCost: 0.35,
      otherCost: 2,
      amazonSellPrice: 95,
      amazonFeeEstimate: 22
    });

    expect(result).toEqual({
      totalLandedCost: 67.1,
      netProfit: 5.9,
      roiPercent: 8.79,
      marginPercent: 6.21,
      breakEvenSellPrice: 89.1
    });
  });
});
