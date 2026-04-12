import { Request, Response } from "express";

import { prisma } from "../db/prisma";
import { savedSearchSchema } from "../models/validators";
import { scanSavedSearch } from "../services/opportunityScanner";
import { parseCheckbox, parseCommaList, parseCurrencyInput, parseIntegerInput, sanitizeText } from "../utils/forms";
import { redirectWithNotice } from "../utils/redirect";

function buildSavedSearchInput(body: Record<string, unknown>) {
  return savedSearchSchema.parse({
    name: sanitizeText(body.name),
    keywords: sanitizeText(body.keywords),
    categoryId: sanitizeText(body.categoryId),
    includeBrands: parseCommaList(body.includeBrands),
    excludeBrands: parseCommaList(body.excludeBrands),
    minPrice: parseCurrencyInput(body.minPrice),
    maxPrice: parseCurrencyInput(body.maxPrice),
    conditionFilter: sanitizeText(body.conditionFilter),
    buyItNowOnly: parseCheckbox(body.buyItNowOnly),
    allowAuctions: parseCheckbox(body.allowAuctions),
    maxShipping: parseCurrencyInput(body.maxShipping),
    minROI: parseCurrencyInput(body.minROI),
    minProfit: parseCurrencyInput(body.minProfit),
    scanFrequencyMinutes: parseIntegerInput(body.scanFrequencyMinutes, 60),
    isActive: parseCheckbox(body.isActive)
  });
}

export async function listSavedSearches(req: Request, res: Response) {
  const savedSearches = await prisma.savedSearch.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: {
          opportunities: true,
          scanJobs: true
        }
      },
      scanJobs: {
        orderBy: { startedAt: "desc" },
        take: 1
      }
    }
  });

  res.render("searches/index", {
    title: "Saved Searches",
    savedSearches
  });
}

export async function renderNewSavedSearch(req: Request, res: Response) {
  res.render("searches/form", {
    title: "Create Saved Search",
    formMode: "create",
    search: null
  });
}

export async function createSavedSearch(req: Request, res: Response) {
  const data = buildSavedSearchInput(req.body as Record<string, unknown>);
  const user = await prisma.user.findFirstOrThrow();

  await prisma.savedSearch.create({
    data: {
      ...data,
      userId: user.id
    }
  });

  redirectWithNotice(res, "/searches", { notice: "Saved search created." });
}

export async function renderEditSavedSearch(req: Request, res: Response) {
  const search = await prisma.savedSearch.findUniqueOrThrow({
    where: { id: Number(req.params.id) }
  });

  res.render("searches/form", {
    title: "Edit Saved Search",
    formMode: "edit",
    search
  });
}

export async function updateSavedSearch(req: Request, res: Response) {
  const id = Number(req.params.id);
  const data = buildSavedSearchInput(req.body as Record<string, unknown>);

  await prisma.savedSearch.update({
    where: { id },
    data
  });

  redirectWithNotice(res, "/searches", { notice: "Saved search updated." });
}

export async function deleteSavedSearch(req: Request, res: Response) {
  const id = Number(req.params.id);

  await prisma.savedSearch.delete({
    where: { id }
  });

  redirectWithNotice(res, "/searches", { notice: "Saved search deleted." });
}

export async function runSavedSearchScan(req: Request, res: Response) {
  const id = Number(req.params.id);
  await scanSavedSearch(id, "manual");
  redirectWithNotice(res, "/searches", { notice: "Scan completed." });
}
