import { Marketplace } from "@prisma/client";

interface ListingEvidenceInput {
  marketplace: Marketplace;
  title: string;
  brand?: string | null;
  imageUrl?: string | null;
  upc?: string | null;
  gtin?: string | null;
  mpn?: string | null;
  externalListingId?: string | null;
  rawJson?: unknown;
}

interface ListingIdentifier {
  label: "ASIN" | "UPC" | "GTIN" | "MPN" | "Listing ID";
  value: string;
}

function hasDemoFixtureSource(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== "object" || depth > 4) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (record.source === "demo-fixture") {
    return true;
  }

  return Object.values(record).some((item) => hasDemoFixtureSource(item, depth + 1));
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function shorten(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;
}

function buildPlaceholderSvg({
  title,
  brand,
  marketplace,
  tone,
  chip
}: {
  title: string;
  brand?: string | null;
  marketplace: Marketplace;
  tone: "demo" | "missing";
  chip: string;
}) {
  const safeTitle = escapeXml(shorten(title || "Unknown listing", 44));
  const safeBrand = escapeXml(shorten(brand || marketplace.replace("_", " "), 28));
  const bgStart = tone === "demo" ? "#16324a" : "#2f2430";
  const bgEnd = tone === "demo" ? "#0b1722" : "#171116";
  const chipBg = tone === "demo" ? "#f0b35f" : "#ff8a85";
  const chipText = "#09111a";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">`,
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${bgStart}"/><stop offset="1" stop-color="${bgEnd}"/></linearGradient></defs>`,
    `<rect width="480" height="480" rx="36" fill="url(#bg)"/>`,
    `<rect x="28" y="28" width="154" height="40" rx="20" fill="${chipBg}"/>`,
    `<text x="105" y="54" fill="${chipText}" font-family="Arial, sans-serif" font-size="18" font-weight="700" text-anchor="middle">${escapeXml(chip)}</text>`,
    `<text x="32" y="354" fill="#dce9f5" font-family="Arial, sans-serif" font-size="18" letter-spacing="2">${escapeXml(marketplace.replace("_", " "))}</text>`,
    `<text x="32" y="392" fill="#ffffff" font-family="Arial, sans-serif" font-size="34" font-weight="700">${safeBrand}</text>`,
    `<foreignObject x="32" y="408" width="416" height="54"><div xmlns="http://www.w3.org/1999/xhtml" style="color:#9bb1c4;font-family:Arial,sans-serif;font-size:20px;line-height:1.3;">${safeTitle}</div></foreignObject>`,
    `</svg>`
  ].join("");
}

export function isDemoFixtureRecord(rawJson: unknown) {
  return hasDemoFixtureSource(rawJson);
}

export function getListingDataSourceLabel(rawJson: unknown) {
  return isDemoFixtureRecord(rawJson) ? "Demo fixture data" : "Stored marketplace data";
}

export function getListingVisualStatus(listing: ListingEvidenceInput) {
  if (isDemoFixtureRecord(listing.rawJson)) {
    return "Demo placeholder image";
  }

  return listing.imageUrl ? "Marketplace image present" : "Marketplace image missing";
}

export function getListingIdentifier(listing: ListingEvidenceInput): ListingIdentifier {
  if (listing.marketplace === Marketplace.AMAZON_CA && listing.externalListingId) {
    return {
      label: "ASIN",
      value: listing.externalListingId
    };
  }

  if (listing.upc) {
    return {
      label: "UPC",
      value: listing.upc
    };
  }

  if (listing.gtin) {
    return {
      label: "GTIN",
      value: listing.gtin
    };
  }

  if (listing.mpn) {
    return {
      label: "MPN",
      value: listing.mpn
    };
  }

  return {
    label: "Listing ID",
    value: String(listing.externalListingId ?? "Unknown")
  };
}

export function resolveListingDisplayImage(listing: ListingEvidenceInput) {
  if (isDemoFixtureRecord(listing.rawJson)) {
    const svg = buildPlaceholderSvg({
      title: listing.title,
      brand: listing.brand,
      marketplace: listing.marketplace,
      tone: "demo",
      chip: "DEMO"
    });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  if (listing.imageUrl) {
    return listing.imageUrl;
  }

  const svg = buildPlaceholderSvg({
    title: listing.title,
    brand: listing.brand,
    marketplace: listing.marketplace,
    tone: "missing",
    chip: "NO IMAGE"
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
