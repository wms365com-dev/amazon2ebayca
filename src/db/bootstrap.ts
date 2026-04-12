import { prisma } from "./prisma";
import { ensureDefaultSettings } from "../services/settingsService";

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

  const searchCount = await prisma.savedSearch.count();
  if (searchCount === 0) {
    await prisma.savedSearch.create({
      data: {
        userId: user.id,
        name: "Demo Nintendo Controllers",
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
      }
    });
  }
}
