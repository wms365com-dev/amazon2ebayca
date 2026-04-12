import { describe, expect, it } from "vitest";

import { computeMatchConfidence } from "../src/services/matching/helpers";

describe("computeMatchConfidence", () => {
  it("scores strong identifier and title matches highly", () => {
    const score = computeMatchConfidence({
      identifierMatch: true,
      brandMatch: true,
      modelMatch: true,
      titleSimilarity: 0.82,
      packCountMatch: true,
      variantMatch: true,
      conditionCompatible: true
    });

    expect(score).toBeGreaterThanOrEqual(90);
  });
});
