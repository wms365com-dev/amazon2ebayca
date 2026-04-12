import { ProfitCalculationInput, ProfitCalculationResult } from "../../types/domain";

function round(value: number) {
  return Number(value.toFixed(2));
}

export function calculateProfit(input: ProfitCalculationInput): ProfitCalculationResult {
  const totalLandedCost = round(
    input.ebayItemPrice +
      input.ebayShippingCost +
      input.inboundCost +
      input.prepCost +
      input.labelCost +
      input.otherCost
  );
  const netProfit = round(input.amazonSellPrice - input.amazonFeeEstimate - totalLandedCost);
  const roiPercent = totalLandedCost > 0 ? round((netProfit / totalLandedCost) * 100) : 0;
  const marginPercent = input.amazonSellPrice > 0 ? round((netProfit / input.amazonSellPrice) * 100) : 0;
  const breakEvenSellPrice = round(input.amazonFeeEstimate + totalLandedCost);

  return {
    totalLandedCost,
    netProfit,
    roiPercent,
    marginPercent,
    breakEvenSellPrice
  };
}
