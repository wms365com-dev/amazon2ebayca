import { describe, expect, it } from "vitest";

import { normalizeTitle } from "../src/services/matching/helpers";

describe("normalizeTitle", () => {
  it("strips punctuation, lowercases, and removes filler words", () => {
    expect(normalizeTitle("Brand New! Nintendo Switch Pro Controller, Black")).toBe(
      "nintendo switch pro controller black"
    );
  });
});
