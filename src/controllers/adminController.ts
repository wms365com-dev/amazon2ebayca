import { Request, Response } from "express";

import { prisma } from "../db/prisma";
import { ScanAlreadyRunningError, scanSavedSearch } from "../services/opportunityScanner";
import { resolvePagination, buildPaginationMeta } from "../utils/pagination";
import { redirectWithNotice } from "../utils/redirect";

export async function renderAdmin(req: Request, res: Response) {
  const pagination = resolvePagination(req.query, 20);
  const [totalLogs, logs, jobs, failedMatches] = await Promise.all([
    prisma.apiLog.count(),
    prisma.apiLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: { savedSearch: true, scanJob: true }
    }),
    prisma.scanJob.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
      include: { savedSearch: true }
    }),
    prisma.opportunity.findMany({
      where: { amazonMatchId: null },
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: { savedSearch: true, ebayListing: true }
    })
  ]);

  res.render("admin/index", {
    title: "Admin / Logs",
    logs,
    jobs,
    failedMatches,
    pagination: buildPaginationMeta(totalLogs, pagination.page, pagination.pageSize)
  });
}

export async function retryScanJob(req: Request, res: Response) {
  const id = Number(req.params.id);
  const job = await prisma.scanJob.findUniqueOrThrow({
    where: { id }
  });

  try {
    await scanSavedSearch(job.savedSearchId, "admin-retry");
    redirectWithNotice(res, "/admin", { notice: "Retry completed." });
  } catch (error) {
    if (error instanceof ScanAlreadyRunningError) {
      redirectWithNotice(res, "/admin", { error: "That saved search is already scanning in the background." });
      return;
    }

    throw error;
  }
}
