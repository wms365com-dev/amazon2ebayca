import { MatchMethod } from "@prisma/client";

import { AmazonService } from "../amazon/amazonService";
import { AmazonCatalogCandidate, MatchingEvidence, NormalizedEbayListing } from "../../types/domain";
import {
  compareVariants,
  computeMatchConfidence,
  computeTitleSimilarity,
  extractBrand,
  extractModel,
  extractPackCount
} from "./helpers";

interface CandidateScore {
  candidate: AmazonCatalogCandidate;
  confidence: number;
  method: MatchMethod;
  reasons: string[];
  warnings: string[];
}

function scoreCandidate(
  listing: NormalizedEbayListing,
  candidate: AmazonCatalogCandidate,
  method: MatchMethod,
  identifierMatch: boolean
): CandidateScore {
  const listingBrand = extractBrand(listing.title, listing.brand);
  const candidateBrand = extractBrand(candidate.title, candidate.brand);
  const listingModel = extractModel(listing.title, listing.mpn);
  const candidateModel = extractModel(candidate.title, candidate.model);
  const listingPack = extractPackCount(listing.title);
  const candidatePack = candidate.packageQuantity ?? extractPackCount(candidate.title);
  const titleSimilarity = computeTitleSimilarity(listing.title, candidate.title);
  const variantComparison = compareVariants(listing.title, candidate.title);
  const brandMatch = Boolean(listingBrand && candidateBrand && listingBrand === candidateBrand);
  const modelMatch = Boolean(listingModel && candidateModel && listingModel === candidateModel);
  const packCountMatch =
    listingPack && candidatePack ? listingPack === candidatePack : listingPack || candidatePack ? false : null;
  const conditionCompatible = !String(listing.condition ?? "").toLowerCase().includes("parts");
  const confidence = computeMatchConfidence({
    identifierMatch,
    brandMatch,
    modelMatch,
    titleSimilarity,
    packCountMatch,
    variantMatch: variantComparison.match,
    conditionCompatible
  });
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (identifierMatch) {
    reasons.push("Identifier match found");
  }
  if (brandMatch) {
    reasons.push("Brand aligned");
  }
  if (modelMatch) {
    reasons.push("Model or MPN aligned");
  }
  if (titleSimilarity > 0.55) {
    reasons.push(`Title similarity ${(titleSimilarity * 100).toFixed(0)}%`);
  } else if (titleSimilarity < 0.3) {
    warnings.push("Low title overlap");
  }
  if (packCountMatch === false) {
    warnings.push("Pack count differs");
  }
  if (variantComparison.match === false) {
    warnings.push(variantComparison.note ?? "Variant mismatch");
  }
  if (!conditionCompatible) {
    warnings.push("Condition may not be suitable for Amazon resale");
  }

  return { candidate, confidence, method, reasons, warnings };
}

export class MatchingEngine {
  constructor(private readonly amazonService: AmazonService) {}

  async matchListing(listing: NormalizedEbayListing, marketplaceId: string): Promise<MatchingEvidence> {
    const candidates: CandidateScore[] = [];

    if (listing.upc || listing.gtin) {
      const identifier = listing.upc ?? listing.gtin!;
      const identifierType = listing.upc ? "UPC" : "EAN";
      const identifierCandidates = await this.amazonService.searchCatalogByIdentifier(
        identifier,
        identifierType,
        marketplaceId
      );

      for (const candidate of identifierCandidates) {
        candidates.push(
          scoreCandidate(listing, candidate, listing.upc ? MatchMethod.UPC : MatchMethod.GTIN, true)
        );
      }
    }

    const listingBrand = extractBrand(listing.title, listing.brand);
    const listingModel = extractModel(listing.title, listing.mpn);
    const keywordQuery = [listingBrand, listingModel, listing.title].filter(Boolean).join(" ").trim();

    if (candidates.length === 0 || Math.max(...candidates.map((item) => item.confidence)) < 85) {
      const keywordCandidates = await this.amazonService.searchCatalogByKeywords(keywordQuery, marketplaceId);
      for (const candidate of keywordCandidates) {
        const method = listingBrand && listingModel ? MatchMethod.BRAND_MODEL : MatchMethod.TITLE_SIMILARITY;
        candidates.push(scoreCandidate(listing, candidate, method, false));
      }
    }

    const best = candidates.sort((left, right) => right.confidence - left.confidence)[0];

    if (!best || best.confidence < 35) {
      return {
        bestCandidate: null,
        confidence: best?.confidence ?? 0,
        method: MatchMethod.TITLE_SIMILARITY,
        reasons: [],
        warnings: ["No strong Amazon.ca match found"]
      };
    }

    const price = await this.amazonService.getPricingForAsin(best.candidate.asin, marketplaceId);
    const priceToUse = price.featuredOfferPrice ?? price.amazonPrice ?? best.candidate.featuredOfferPrice ?? 0;
    const fees = await this.amazonService.getFeeEstimateForAsin(best.candidate.asin, priceToUse, marketplaceId);

    return {
      bestCandidate: {
        ...best.candidate,
        amazonPrice: price.amazonPrice ?? best.candidate.amazonPrice ?? null,
        featuredOfferPrice: price.featuredOfferPrice ?? best.candidate.featuredOfferPrice ?? null,
        feeEstimate: fees.feeEstimate ?? best.candidate.feeEstimate ?? null,
        fulfillmentFee: fees.fulfillmentFee ?? best.candidate.fulfillmentFee ?? null,
        referralFee: fees.referralFee ?? best.candidate.referralFee ?? null,
        rawPricingJson: price.rawPricingJson ?? best.candidate.rawPricingJson,
        rawFeesJson: fees.rawFeesJson ?? best.candidate.rawFeesJson
      },
      confidence: best.confidence,
      method: best.method,
      reasons: best.reasons,
      warnings: best.warnings
    };
  }
}
