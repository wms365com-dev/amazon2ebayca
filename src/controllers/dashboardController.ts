import { Request, Response } from "express";

import { prisma } from "../db/prisma";
import { getAppSettings } from "../services/settingsService";

export async function renderDashboard(req: Request, res: Response) {
  const [
    settings,
    totalActiveSearches,
    totalOpportunities,
    profitableOpportunities,
    watchedItems,
    buyCandidates,
    latestScans,
    topOpportunities,
    recentErrors
  ] = await Promise.all([
    getAppSettings(),
    prisma.savedSearch.count({ where: { isActive: true } }),
    prisma.arbitrageOpportunity.count(),
    prisma.arbitrageOpportunity.count({ where: { netProfit: { gt: 0 } } }),
    prisma.arbitrageOpportunity.count({ where: { status: "WATCH" } }),
    prisma.arbitrageOpportunity.count({ where: { status: "BUY" } }),
    prisma.scanJob.findMany({
      orderBy: { startedAt: "desc" },
      take: 8,
      include: { savedSearch: true }
    }),
    prisma.arbitrageOpportunity.findMany({
      orderBy: [{ roiPercent: "desc" }, { netProfit: "desc" }],
      take: 10,
      include: {
        savedSearch: true,
        sourceListing: true,
        destinationListing: true
      }
    }),
    prisma.apiLog.findMany({
      where: {
        OR: [{ isSuccess: false }, { isThrottled: true }]
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { savedSearch: true }
    })
  ]);

  res.render("dashboard/index", {
    title: "Dashboard",
    settings,
    metrics: {
      totalActiveSearches,
      totalOpportunities,
      profitableOpportunities,
      watchedItems,
      buyCandidates
    },
    latestScans,
    topOpportunities,
    recentErrors
  });
}
