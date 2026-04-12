import { ApiLogSource, Prisma } from "@prisma/client";

import { prisma } from "../db/prisma";

interface CreateApiLogInput {
  source: ApiLogSource;
  operation: string;
  requestKey?: string;
  statusCode?: number;
  isSuccess?: boolean;
  isThrottled?: boolean;
  cacheHit?: boolean;
  message?: string;
  detail?: unknown;
  scanJobId?: number;
  savedSearchId?: number;
}

export async function createApiLog(input: CreateApiLogInput) {
  await prisma.apiLog.create({
    data: {
      source: input.source,
      operation: input.operation,
      requestKey: input.requestKey,
      statusCode: input.statusCode,
      isSuccess: input.isSuccess ?? true,
      isThrottled: input.isThrottled ?? false,
      cacheHit: input.cacheHit ?? false,
      message: input.message,
      detail: input.detail as Prisma.InputJsonValue | undefined,
      scanJobId: input.scanJobId,
      savedSearchId: input.savedSearchId
    }
  });
}
