import { OpportunityStatus, Prisma } from "@prisma/client";

import { AppSettings, NormalizedMarketplaceListing, RiskFlag } from "../types/domain";

interface EvaluateOpportunityQualityInput {
  settings: AppSettings;
  sourceListing: NormalizedMarketplaceListing;
  destinationListing: NormalizedMarketplaceListing | null;
  confidenceScore: number;
  riskScore: number;
  riskFlags: RiskFlag[];
  netProfit: number;
}

export interface OpportunityQualityResult {
  passes: boolean;
  reasons: string[];
}

export function evaluateOpportunityQuality(input: EvaluateOpportunityQualityInput): OpportunityQualityResult {
  const reasons: string[] = [];

  if (!input.destinationListing) {
    reasons.push("No confident destination match");
  }
  if (input.netProfit <= 0) {
    reasons.push("Non-positive net profit");
  }
  if (input.confidenceScore < input.settings.opportunityMinConfidence) {
    reasons.push(`Confidence below ${input.settings.opportunityMinConfidence}`);
  }
  if (input.riskScore > input.settings.opportunityMaxRisk) {
    reasons.push(`Risk above ${input.settings.opportunityMaxRisk}`);
  }
  if (
    input.settings.requireImageVerification &&
    (!input.sourceListing.imageUrl || !input.destinationListing?.imageUrl)
  ) {
    reasons.push("Missing source or destination image");
  }
  if (input.riskFlags.some((flag) => flag.code === "IP_COMPLAINT_BRAND")) {
    reasons.push("Brand is on the IP complaint alert list");
  }

  return {
    passes: reasons.length === 0,
    reasons
  };
}

export function buildQualityOpportunityWhere(settings: AppSettings): Prisma.ArbitrageOpportunityWhereInput {
  const where: Prisma.ArbitrageOpportunityWhereInput = {
    destinationListingId: { not: null },
    netProfit: { gt: 0 },
    confidenceScore: { gte: settings.opportunityMinConfidence },
    riskScore: { lte: settings.opportunityMaxRisk },
    status: { not: OpportunityStatus.REVIEW }
  };

  if (settings.requireImageVerification) {
    where.sourceListing = {
      is: {
        imageUrl: { not: null }
      }
    };
    where.destinationListing = {
      is: {
        imageUrl: { not: null }
      }
    };
  }

  return where;
}
