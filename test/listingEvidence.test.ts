import { Marketplace } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  getListingDataSourceLabel,
  getListingIdentifier,
  getListingVisualStatus,
  isDemoFixtureRecord,
  resolveListingDisplayImage
} from "../src/utils/listingEvidence";

describe("listingEvidence", () => {
  it("detects demo fixture provenance in nested raw payloads", () => {
    expect(
      isDemoFixtureRecord({
        catalog: {
          source: "demo-fixture"
        }
      })
    ).toBe(true);

    expect(getListingDataSourceLabel({ live: true })).toBe("Stored marketplace data");
  });

  it("returns placeholder imagery for demo and missing-image listings", () => {
    const demoImage = resolveListingDisplayImage({
      marketplace: Marketplace.AMAZON_CA,
      title: "Instant Pot Demo Listing",
      brand: "Instant Pot",
      imageUrl: "https://example.com/should-not-be-used.jpg",
      rawJson: { source: "demo-fixture" }
    });

    const missingImage = resolveListingDisplayImage({
      marketplace: Marketplace.EBAY_CA,
      title: "Live listing missing image",
      brand: "Generic",
      imageUrl: null,
      rawJson: { source: "ebay-live" }
    });

    expect(demoImage.startsWith("data:image/svg+xml")).toBe(true);
    expect(missingImage.startsWith("data:image/svg+xml")).toBe(true);
    expect(
      getListingVisualStatus({
        marketplace: Marketplace.AMAZON_CA,
        title: "Instant Pot Demo Listing",
        brand: "Instant Pot",
        imageUrl: "https://example.com/should-not-be-used.jpg",
        rawJson: { source: "demo-fixture" }
      })
    ).toBe("Demo placeholder image");
  });

  it("builds a useful primary identifier for marketplace listings", () => {
    expect(
      getListingIdentifier({
        marketplace: Marketplace.AMAZON_CA,
        title: "Amazon Item",
        externalListingId: "B00TEST123",
        rawJson: {}
      })
    ).toEqual({
      label: "ASIN",
      value: "B00TEST123"
    });

    expect(
      getListingIdentifier({
        marketplace: Marketplace.EBAY_CA,
        title: "eBay Item",
        upc: "012345678905",
        externalListingId: "v1|123|0",
        rawJson: {}
      })
    ).toEqual({
      label: "UPC",
      value: "012345678905"
    });
  });
});
