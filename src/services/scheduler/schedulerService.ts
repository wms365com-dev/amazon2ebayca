import cron, { ScheduledTask } from "node-cron";
import { ApiLogSource } from "@prisma/client";

import { prisma } from "../../db/prisma";
import { createApiLog } from "../apiLogService";
import { getAppSettings } from "../settingsService";
import { scanSavedSearch } from "../opportunityScanner";

class SchedulerService {
  private task: ScheduledTask | null = null;

  start() {
    if (this.task) {
      return;
    }

    this.task = cron.schedule("* * * * *", () => {
      void this.tick();
    });
  }

  stop() {
    this.task?.stop();
    this.task = null;
  }

  private async tick() {
    const settings = await getAppSettings();
    if (!settings.schedulerEnabled) {
      return;
    }

    const searches = await prisma.savedSearch.findMany({
      where: { isActive: true },
      include: {
        scanJobs: {
          orderBy: { startedAt: "desc" },
          take: 1
        }
      }
    });

    const dueSearches = searches.filter((search) => {
      const lastRun = search.scanJobs[0]?.startedAt;
      if (!lastRun) {
        return true;
      }

      const nextEligibleTime = new Date(lastRun.getTime() + search.scanFrequencyMinutes * 60_000);
      return nextEligibleTime <= new Date();
    });

    const concurrency = settings.rateLimitSafeMode ? 1 : 2;
    for (const batch of chunk(dueSearches, concurrency)) {
      await Promise.all(
        batch.map(async (search) => {
          try {
            await scanSavedSearch(search.id, "scheduler");
          } catch (error) {
            await createApiLog({
              source: ApiLogSource.SCHEDULER,
              operation: "scheduledScan",
              requestKey: String(search.id),
              isSuccess: false,
              message: error instanceof Error ? error.message : "Unknown scheduler error",
              detail: { savedSearchId: search.id }
            });
          }
        })
      );
    }
  }
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export const schedulerService = new SchedulerService();
