import { Marketplace } from "@prisma/client";

export interface SearchTemplateDraft {
  name: string;
  sourceMarketplace: Marketplace;
  destinationMarketplace: Marketplace;
  keywords: string;
  categoryId: string | null;
  includeBrands: string[];
  excludeBrands: string[];
  minPrice: number | null;
  maxPrice: number | null;
  conditionFilter: string | null;
  buyItNowOnly: boolean;
  allowAuctions: boolean;
  maxShipping: number | null;
  minROI: number | null;
  minProfit: number | null;
  scanFrequencyMinutes: number;
  isActive: boolean;
}

export interface SuggestedSearchTemplate {
  slug: string;
  strategy: string;
  summary: string;
  rationale: string;
  watchouts: string[];
  draft: SearchTemplateDraft;
}

const suggestedSearchTemplates: SuggestedSearchTemplate[] = [
  {
    slug: "ebay-amazon-nintendo-controllers",
    strategy: "Best seller accessory",
    summary: "Look for branded Nintendo controllers and Joy-Con bundles priced below Amazon's steady accessory demand.",
    rationale: "Nintendo accessories stay liquid, are easy to verify by brand and model, and usually have tight demand on Amazon.",
    watchouts: ["Watch for counterfeit listings", "Avoid damaged sticks and shell swaps"],
    draft: {
      name: "Best seller flip - Nintendo controllers",
      sourceMarketplace: Marketplace.EBAY_CA,
      destinationMarketplace: Marketplace.AMAZON_CA,
      keywords: "Nintendo Switch Pro Controller Joy-Con",
      categoryId: "139971",
      includeBrands: ["Nintendo"],
      excludeBrands: ["Generic", "For Nintendo", "Unbranded"],
      minPrice: 20,
      maxPrice: 95,
      conditionFilter: "NEW",
      buyItNowOnly: true,
      allowAuctions: false,
      maxShipping: 15,
      minROI: 18,
      minProfit: 9,
      scanFrequencyMinutes: 1440,
      isActive: true
    }
  },
  {
    slug: "ebay-amazon-brother-toner",
    strategy: "Replenishable consumable",
    summary: "Target sealed Brother toner with strong reorder behavior and clean identifier matching.",
    rationale: "Toner moves consistently, often has UPC support, and profits can appear when sellers liquidate sealed stock locally.",
    watchouts: ["Avoid open-box cartridges", "Watch expiry or damaged packaging"],
    draft: {
      name: "Replenishable - Brother toner",
      sourceMarketplace: Marketplace.EBAY_CA,
      destinationMarketplace: Marketplace.AMAZON_CA,
      keywords: "Brother toner TN760 TN730 DR730 sealed",
      categoryId: "175673",
      includeBrands: ["Brother"],
      excludeBrands: ["Compatible", "Remanufactured", "Generic"],
      minPrice: 15,
      maxPrice: 80,
      conditionFilter: "NEW",
      buyItNowOnly: true,
      allowAuctions: false,
      maxShipping: 12,
      minROI: 15,
      minProfit: 8,
      scanFrequencyMinutes: 1440,
      isActive: true
    }
  },
  {
    slug: "ebay-amazon-lego-sealed",
    strategy: "Higher-margin collectible",
    summary: "Scan sealed LEGO sets and Speed Champions style items where underpriced collector demand can support FBA margins.",
    rationale: "Sealed LEGO has strong keyword and brand consistency, making it easier to match and rank profitable opportunities.",
    watchouts: ["Avoid incomplete/open sets", "Watch pack count and retired-set variations"],
    draft: {
      name: "Higher margin - sealed LEGO sets",
      sourceMarketplace: Marketplace.EBAY_CA,
      destinationMarketplace: Marketplace.AMAZON_CA,
      keywords: "LEGO sealed set Speed Champions",
      categoryId: "19006",
      includeBrands: ["LEGO"],
      excludeBrands: ["Compatible", "Mega Bloks", "Used"],
      minPrice: 20,
      maxPrice: 150,
      conditionFilter: "NEW",
      buyItNowOnly: true,
      allowAuctions: false,
      maxShipping: 18,
      minROI: 20,
      minProfit: 12,
      scanFrequencyMinutes: 1440,
      isActive: true
    }
  },
  {
    slug: "amazon-ebay-logitech-office",
    strategy: "Fast-moving office gear",
    summary: "Look for popular Logitech mice, keyboards, and webcams that can be sourced on Amazon and sold quickly on eBay.",
    rationale: "Logitech peripherals have broad demand and clean model-based matching, which makes them good for repeatable arbitrage scans.",
    watchouts: ["Watch warehouse-deal condition", "Check cable and dongle completeness"],
    draft: {
      name: "Fast-moving - Logitech office gear",
      sourceMarketplace: Marketplace.AMAZON_CA,
      destinationMarketplace: Marketplace.EBAY_CA,
      keywords: "Logitech MX Master MX Keys webcam",
      categoryId: null,
      includeBrands: ["Logitech"],
      excludeBrands: ["Renewed", "Refurbished"],
      minPrice: 35,
      maxPrice: 180,
      conditionFilter: "NEW",
      buyItNowOnly: true,
      allowAuctions: false,
      maxShipping: null,
      minROI: 12,
      minProfit: 10,
      scanFrequencyMinutes: 1440,
      isActive: true
    }
  },
  {
    slug: "amazon-ebay-kitchenaid-attachments",
    strategy: "Kitchen best seller",
    summary: "Target KitchenAid attachments and accessories that sell well on eBay when Amazon pricing dips.",
    rationale: "KitchenAid attachments are branded, giftable, and easy to understand for buyers, which helps resale velocity.",
    watchouts: ["Verify exact attachment variant", "Avoid knockoff-compatible accessories"],
    draft: {
      name: "Best seller kitchen - KitchenAid attachments",
      sourceMarketplace: Marketplace.AMAZON_CA,
      destinationMarketplace: Marketplace.EBAY_CA,
      keywords: "KitchenAid attachment whisk paddle dough hook",
      categoryId: null,
      includeBrands: ["KitchenAid"],
      excludeBrands: ["Compatible", "Generic", "Renewed"],
      minPrice: 20,
      maxPrice: 130,
      conditionFilter: "NEW",
      buyItNowOnly: true,
      allowAuctions: false,
      maxShipping: null,
      minROI: 14,
      minProfit: 9,
      scanFrequencyMinutes: 1440,
      isActive: true
    }
  },
  {
    slug: "amazon-ebay-yeti-drinkware",
    strategy: "Giftable lifestyle item",
    summary: "Scan YETI drinkware and coolers where brand demand can support profitable eBay resales from Amazon specials.",
    rationale: "YETI is recognizable, giftable, and commonly searched, which makes it a practical template for promotional-price checks.",
    watchouts: ["Avoid colorway mismatches", "Watch for shipping weight on larger items"],
    draft: {
      name: "Giftable lifestyle - YETI drinkware",
      sourceMarketplace: Marketplace.AMAZON_CA,
      destinationMarketplace: Marketplace.EBAY_CA,
      keywords: "YETI Rambler tumbler bottle mug",
      categoryId: null,
      includeBrands: ["YETI"],
      excludeBrands: ["Compatible", "Generic", "Renewed"],
      minPrice: 18,
      maxPrice: 140,
      conditionFilter: "NEW",
      buyItNowOnly: true,
      allowAuctions: false,
      maxShipping: null,
      minROI: 12,
      minProfit: 8,
      scanFrequencyMinutes: 1440,
      isActive: true
    }
  }
];

const seededTemplateSlugs = [
  "ebay-amazon-nintendo-controllers",
  "ebay-amazon-brother-toner",
  "amazon-ebay-logitech-office",
  "amazon-ebay-kitchenaid-attachments"
];

function cloneDraft(draft: SearchTemplateDraft): SearchTemplateDraft {
  return {
    ...draft,
    includeBrands: [...draft.includeBrands],
    excludeBrands: [...draft.excludeBrands]
  };
}

export function listSuggestedSearchTemplates() {
  return suggestedSearchTemplates.map((template) => ({
    ...template,
    watchouts: [...template.watchouts],
    draft: cloneDraft(template.draft)
  }));
}

export function findSuggestedSearchTemplate(slug: string | null | undefined) {
  if (!slug) {
    return null;
  }

  const template = suggestedSearchTemplates.find((item) => item.slug === slug);
  return template
    ? {
        ...template,
        watchouts: [...template.watchouts],
        draft: cloneDraft(template.draft)
      }
    : null;
}

export function getSeedSearchDrafts() {
  return seededTemplateSlugs
    .map((slug) => findSuggestedSearchTemplate(slug))
    .filter((template): template is SuggestedSearchTemplate => Boolean(template))
    .map((template) => template.draft);
}
