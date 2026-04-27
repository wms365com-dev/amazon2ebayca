import { OpportunityStatus, Prisma } from "@prisma/client";
import { Request, Response } from "express";

import { prisma } from "../db/prisma";
import { opportunityNoteSchema, opportunityStatusSchema } from "../models/validators";
import { ScanAlreadyRunningError, rescanOpportunity } from "../services/opportunityScanner";
import { saveOpportunityNotes, updateOpportunityStatus } from "../services/opportunityService";
import { resolvePagination, buildPaginationMeta } from "../utils/pagination";
import { redirectWithNotice } from "../utils/redirect";

function parseBooleanQuery(value: unknown) {
  return value === "true" || value === "1";
}

export async function listOpportunities(req: Request, res: Response) {
  const pagination = resolvePagination(req.query, 25);
  const where: Prisma.ArbitrageOpportunityWhereInput = {};
  const minROI = Number(req.query.minROI);
  const minProfit = Number(req.query.minProfit);
  const minConfidence = Number(req.query.minConfidence);
  const maxRisk = Number(req.query.maxRisk);
  const sourceSearchId = Number(req.query.sourceSearchId);
  const sortBy = String(req.query.sortBy ?? "roi");

  if (parseBooleanQuery(req.query.profitableOnly)) {
    where.netProfit = { gt: 0 };
  }
  if (Number.isFinite(minROI)) {
    where.roiPercent = { gte: minROI };
  }
  if (Number.isFinite(minProfit)) {
    where.netProfit = {
      ...(typeof where.netProfit === "object" && where.netProfit !== null ? where.netProfit : {}),
      gte: minProfit
    };
  }
  if (Number.isFinite(maxRisk)) {
    where.riskScore = { lte: maxRisk };
  }
  if (Number.isFinite(sourceSearchId)) {
    where.savedSearchId = sourceSearchId;
  }
  if (req.query.status && Object.values(OpportunityStatus).includes(req.query.status as OpportunityStatus)) {
    where.status = req.query.status as OpportunityStatus;
  }
  if (Number.isFinite(minConfidence)) {
    where.confidenceScore = { gte: minConfidence };
  }

  const orderBy: Prisma.ArbitrageOpportunityOrderByWithRelationInput[] =
    sortBy === "profit"
      ? [{ netProfit: "desc" }]
      : sortBy === "confidence"
        ? [{ confidenceScore: "desc" }, { roiPercent: "desc" }]
        : sortBy === "recent"
          ? [{ updatedAt: "desc" }]
          : [{ roiPercent: "desc" }, { netProfit: "desc" }];

  const [savedSearches, total, opportunities] = await Promise.all([
    prisma.savedSearch.findMany({
      orderBy: { name: "asc" }
    }),
    prisma.arbitrageOpportunity.count({ where }),
    prisma.arbitrageOpportunity.findMany({
      where,
      orderBy,
      skip: pagination.skip,
      take: pagination.take,
      include: {
        sourceListing: true,
        destinationListing: true,
        savedSearch: true
      }
    })
  ]);

  res.render("opportunities/index", {
    title: "Opportunities",
    opportunities,
    savedSearches,
    pagination: buildPaginationMeta(total, pagination.page, pagination.pageSize),
    filters: req.query
  });
}

export async function renderOpportunityDetail(req: Request, res: Response) {
  const id = Number(req.params.id);
  const opportunity = await prisma.arbitrageOpportunity.findUniqueOrThrow({
    where: { id },
    include: {
      savedSearch: true,
      sourceListing: true,
      destinationListing: true,
      listingMatch: true,
      statusHistory: {
        orderBy: { createdAt: "desc" }
      },
      snapshots: {
        orderBy: { observedAt: "desc" },
        take: 10
      }
    }
  });

  const rescans = await prisma.scanJob.findMany({
    where: { savedSearchId: opportunity.savedSearchId },
    orderBy: { startedAt: "desc" },
    take: 10
  });

  res.render("opportunities/detail", {
    title: "Opportunity Detail",
    opportunity,
    rescans,
    statuses: Object.values(OpportunityStatus)
  });
}

export async function changeOpportunityStatus(req: Request, res: Response) {
  const id = Number(req.params.id);
  const payload = opportunityStatusSchema.parse({
    status: req.body.status,
    note: req.body.note
  });

  await updateOpportunityStatus(id, payload.status, payload.note);
  redirectWithNotice(res, `/opportunities/${id}`, { notice: "Status updated." });
}

export async function rescanOpportunityController(req: Request, res: Response) {
  const id = Number(req.params.id);

  try {
    await rescanOpportunity(id);
    redirectWithNotice(res, `/opportunities/${id}`, { notice: "Opportunity rescanned." });
  } catch (error) {
    if (error instanceof ScanAlreadyRunningError) {
      redirectWithNotice(res, `/opportunities/${id}`, {
        error: "This scan profile is already running in the background."
      });
      return;
    }

    throw error;
  }
}

export async function saveOpportunityNotesController(req: Request, res: Response) {
  const id = Number(req.params.id);
  const payload = opportunityNoteSchema.parse({
    notes: String(req.body.notes ?? "")
  });

  await saveOpportunityNotes(id, payload.notes ?? "");
  redirectWithNotice(res, `/opportunities/${id}`, { notice: "Notes saved." });
}
