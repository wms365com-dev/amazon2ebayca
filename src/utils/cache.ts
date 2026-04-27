import { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma";

export async function readCache<T>(key: string, ttlMs: number): Promise<T | null> {
  const entry = await prisma.apiCacheEntry.findUnique({
    where: { key }
  });

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.cachedAt.getTime() > ttlMs) {
    return null;
  }

  return entry.payload as T;
}

export async function writeCache<T>(key: string, payload: T) {
  await prisma.apiCacheEntry.upsert({
    where: { key },
    update: {
      payload: payload as Prisma.InputJsonValue,
      cachedAt: new Date()
    },
    create: {
      key,
      payload: payload as Prisma.InputJsonValue
    }
  });
}
