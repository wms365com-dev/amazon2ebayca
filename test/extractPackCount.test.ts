import { describe, expect, it } from "vitest";

import { extractPackCount } from "../src/services/matching/helpers";

describe("extractPackCount", () => {
  it("detects pack quantities from common title formats", () => {
    expect(extractPackCount("Nerf Elite 2.0 Commander 2 Pack")).toBe(2);
    expect(extractPackCount("Refill bundle of 4 filters")).toBe(4);
    expect(extractPackCount("Single controller")).toBeNull();
  });
});
