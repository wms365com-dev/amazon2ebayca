export interface MatchConfidenceInput {
  identifierMatch: boolean;
  brandMatch: boolean;
  modelMatch: boolean;
  titleSimilarity: number;
  packCountMatch: boolean | null;
  variantMatch: boolean | null;
  conditionCompatible: boolean;
}

const stopWords = new Set([
  "the",
  "and",
  "with",
  "for",
  "new",
  "brand",
  "genuine",
  "authentic",
  "sealed"
]);

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token && !stopWords.has(token))
    .join(" ");
}

export function tokenizeTitle(title: string): string[] {
  return Array.from(new Set(normalizeTitle(title).split(" ").filter(Boolean)));
}

export function extractPackCount(title: string): number | null {
  const normalized = normalizeTitle(title);
  const patterns = [
    /pack of (\d{1,2})/,
    /set of (\d{1,2})/,
    /bundle of (\d{1,2})/,
    /(\d{1,2}) pack/,
    /(\d{1,2})pk/,
    /x(\d{1,2})/,
    /lot of (\d{1,2})/
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

export function extractBrand(title: string, explicitBrand?: string | null): string | null {
  if (explicitBrand) {
    return explicitBrand.trim().toLowerCase();
  }

  const [firstToken] = tokenizeTitle(title);
  return firstToken ?? null;
}

export function extractModel(title: string, explicitModel?: string | null): string | null {
  if (explicitModel) {
    return explicitModel.trim().toLowerCase();
  }

  const match = title.match(/\b([a-z]{1,5}[- ]?\d{2,8}[a-z0-9-]*)\b/i);
  return match ? match[1].toLowerCase().replace(/\s+/g, "") : null;
}

const variantTokens = [
  "black",
  "white",
  "red",
  "blue",
  "green",
  "pink",
  "gray",
  "grey",
  "silver",
  "gold",
  "small",
  "medium",
  "large",
  "xl",
  "xxl"
];

export function compareVariants(left: string, right: string): { match: boolean | null; note?: string } {
  const leftTokens = new Set(tokenizeTitle(left).filter((token) => variantTokens.includes(token)));
  const rightTokens = new Set(tokenizeTitle(right).filter((token) => variantTokens.includes(token)));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return { match: null };
  }

  const overlap = [...leftTokens].filter((token) => rightTokens.has(token));
  return overlap.length > 0
    ? { match: true, note: `Shared variant tokens: ${overlap.join(", ")}` }
    : { match: false, note: "Variant terms differ" };
}

export function computeTitleSimilarity(left: string, right: string): number {
  const leftTokens = new Set(tokenizeTitle(left));
  const rightTokens = new Set(tokenizeTitle(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return intersection / union;
}

export function computeMatchConfidence(input: MatchConfidenceInput): number {
  let score = 15;

  if (input.identifierMatch) {
    score += 45;
  }

  if (input.brandMatch) {
    score += 12;
  }

  if (input.modelMatch) {
    score += 12;
  }

  score += Math.round(input.titleSimilarity * 24);

  if (input.packCountMatch === true) {
    score += 8;
  }

  if (input.packCountMatch === false) {
    score -= 18;
  }

  if (input.variantMatch === true) {
    score += 6;
  }

  if (input.variantMatch === false) {
    score -= 12;
  }

  if (!input.conditionCompatible) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}
