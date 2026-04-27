import { ArbitrageCalculationInput, ProfitCalculationInput, ProfitCalculationResult } from "../../types/domain";

function round(value: number) {
  return Number(value.toFixed(2));
}

export function calculateArbitrageProfit(input: ArbitrageCalculationInput): ProfitCalculationResult {
  const totalLandedCost = round(
    input.sourcePrice +
      input.sourceShippingCost +
      input.sourceFeeEstimate +
      input.fulfillmentCostEstimate +
      input.prepCostEstimate +
      input.labelCostEstimate +
      input.otherCostEstimate
  );
  const netProfit = round(input.destinationSellPrice - input.destinationFeeEstimate - totalLandedCost);
  const roiPercent = totalLandedCost > 0 ? round((netProfit / totalLandedCost) * 100) : 0;
  const marginPercent = input.destinationSellPrice > 0 ? round((netProfit / input.destinationSellPrice) * 100) : 0;
  const breakEvenSellPrice = round(input.destinationFeeEstimate + totalLandedCost);

  return {
    totalLandedCost,
    netProfit,
    roiPercent,
    marginPercent,
    breakEvenSellPrice
  };
}

export function calculateProfit(input: ProfitCalculationInput): ProfitCalculationResult {
  return calculateArbitrageProfit({
    sourcePrice: input.ebayItemPrice,
    sourceShippingCost: input.ebayShippingCost,
    sourceFeeEstimate: 0,
    destinationSellPrice: input.amazonSellPrice,
    destinationFeeEstimate: input.amazonFeeEstimate,
    fulfillmentCostEstimate: input.inboundCost,
    prepCostEstimate: input.prepCost,
    labelCostEstimate: input.labelCost,
    otherCostEstimate: input.otherCost
  });
}
