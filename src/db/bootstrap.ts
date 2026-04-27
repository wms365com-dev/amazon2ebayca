import { Marketplace } from "@prisma/client";

import { prisma } from "./prisma";
import { ensureDefaultSettings } from "../services/settingsService";

async function seedDefaultProfiles(userId: number) {
  const profileCount = await prisma.savedSearch.count();
  if (profileCount > 0) {
    return;
  }

  await prisma.savedSearch.createMany({
    data: [
      {
        userId,
        name: "eBay to Amazon - Nintendo Controllers",
        sourceMarketplace: Marketplace.EBAY_CA,
        destinationMarketplace: Marketplace.AMAZON_CA,
        keywords: "Nintendo Switch Pro Controller",
        categoryId: "139971",
        includeBrands: ["Nintendo"],
        excludeBrands: ["Generic"],
        minPrice: 20,
        maxPrice: 90,
        conditionFilter: "NEW",
        buyItNowOnly: true,
        allowAuctions: false,
        maxShipping: 15,
        minROI: 15,
        minProfit: 8,
        scanFrequencyMinutes: 180,
        isActive: true
      },
      {
        userId,
        name: "Amazon to eBay - Logitech Accessories",
        sourceMarketplace: Marketplace.AMAZON_CA,
        destinationMarketplace: Marketplace.EBAY_CA,
        keywords: "Logitech MX Master 3S",
        includeBrands: ["Logitech"],
        minPrice: 40,
        maxPrice: 160,
        minROI: 12,
        minProfit: 10,
        scanFrequencyMinutes: 240,
        isActive: true
      }
    ]
  });
}

export async function bootstrapApplicationData() {
  await ensureDefaultSettings();

  const existingUser = await prisma.user.findFirst();
  const user =
    existingUser ??
    (await prisma.user.create({
      data: {
        name: "Primary User",
        email: "owner@example.com"
      }
    }));

  await seedDefaultProfiles(user.id);
}
