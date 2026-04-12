import { ApiLogSource } from "@prisma/client";

import { prisma } from "../../db/prisma";
import { createApiLog } from "../apiLogService";
import { ScanAlreadyRunningError, scanSavedSearch } from "../opportunityScanner";
import { getAppSettings } from "../settingsService";

export interface DueScanRunSummary {
  schedulerEnabled: boolean;
  searchesChecked: number;
  searchesDue: number;
  scansStarted: number;
  scansSkipped: number;
  scansFailed: number;
}

type SearchWithLatestJob = Awaited<ReturnType<typeof loadEligibleSearches>>[number];

export function isSavedSearchDue(lastRunAt: Date | null | undefined, scanFrequencyMinutes: number, now = new Date()) {
  if (!lastRunAt) {
    return true;
  }

  const nextEligibleTime = new Date(lastRunAt.getTime() + scanFrequencyMinutes * 60_000);
  return nextEligibleTime <= now;
}

async function loadEligibleSearches(now: Date) {
  return prisma.savedSearch.findMany({
    where: {
      isActive: true,
      OR: [{ scanLeaseExpiresAt: null }, { scanLeaseExpiresAt: { lte: now } }]
    },
    include: {
      scanJobs: {
        orderBy: { startedAt: "desc" },
        take: 1
      }
    }
  });
}

function filterDueSearches(searches: SearchWithLatestJob[], now: Date) {
  return searches.filter((search) =>
    isSavedSearchDue(search.scanJobs[0]?.startedAt, search.scanFrequencyMinutes, now)
  );
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function runDueSearchScans(triggeredBy = "scheduler"): Promise<DueScanRunSummary> {
  const settings = await getAppSettings();
  const now = new Date();
  const eligibleSearches = await loadEligibleSearches(now);
  const dueSearches = filterDueSearches(eligibleSearches, now);
  const summary: DueScanRunSummary = {
    schedulerEnabled: settings.schedulerEnabled,
    searchesChecked: eligibleSearches.length,
    searchesDue: dueSearches.length,
    scansStarted: 0,
    scansSkipped: 0,
    scansFailed: 0
  };

  if (!settings.schedulerEnabled) {
    return summary;
  }

  const concurrency = settings.rateLimitSafeMode ? 1 : 2;
  for (const batch of chunk(dueSearches, concurrency)) {
    await Promise.all(
      batch.map(async (search) => {
        try {
          await scanSavedSearch(search.id, triggeredBy);
          summary.scansStarted += 1;
        } catch (error) {
          if (error instanceof ScanAlreadyRunningError) {
            summary.scansSkipped += 1;
            return;
          }

          summary.scansFailed += 1;
          await createApiLog({
            source: ApiLogSource.SCHEDULER,
            operation: "scheduledScan",
            requestKey: String(search.id),
            isSuccess: false,
            message: error instanceof Error ? error.message : "Unknown scheduler error",
            detail: { savedSearchId: search.id, triggeredBy }
          });
        }
      })
    );
  }

  await createApiLog({
    source: ApiLogSource.SCHEDULER,
    operation: "dueScanSweep",
    requestKey: triggeredBy,
    message: "Completed due saved search sweep",
    detail: summary
  });

  return summary;
}
