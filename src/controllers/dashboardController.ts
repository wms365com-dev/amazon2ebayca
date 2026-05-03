import { Request, Response } from "express";

import { prisma } from "../db/prisma";
import { buildQualityOpportunityWhere } from "../services/opportunityQualityService";
import { getAppSettings } from "../services/settingsService";

export async function renderDashboard(req: Request, res: Response) {
  const settings = await getAppSettings();
  const qualityWhere = buildQualityOpportunityWhere(settings);

  const [
    totalActiveSearches,
    totalTrackedReplens,
    totalOpportunities,
    profitableOpportunities,
    watchedItems,
    buyCandidates,
    latestScans,
    topOpportunities,
    recentErrors
  ] = await Promise.all([
    prisma.savedSearch.count({ where: { isActive: true } }),
    prisma.monitoredProduct.count(),
    prisma.arbitrageOpportunity.count(),
    prisma.arbitrageOpportunity.count({ where: qualityWhere }),
    prisma.arbitrageOpportunity.count({ where: { status: "WATCH" } }),
    prisma.arbitrageOpportunity.count({ where: { status: "BUY" } }),
    prisma.scanJob.findMany({
      orderBy: { startedAt: "desc" },
      take: 8,
      include: { savedSearch: true }
    }),
    prisma.arbitrageOpportunity.findMany({
      where: qualityWhere,
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
      totalTrackedReplens,
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
