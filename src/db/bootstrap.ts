import { prisma } from "./prisma";
import { ensureDefaultSettings } from "../services/settingsService";
import { getSeedSearchDrafts } from "../services/searchTemplates";

async function seedDefaultProfiles(userId: number) {
  const profileCount = await prisma.savedSearch.count();
  if (profileCount > 0) {
    return;
  }

  const defaultProfiles = getSeedSearchDrafts();

  await prisma.savedSearch.createMany({
    data: defaultProfiles.map((profile) => ({
      userId,
      ...profile
    }))
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
