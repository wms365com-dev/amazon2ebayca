import { Marketplace } from "@prisma/client";
import { SavedSearchKind } from "@prisma/client";
import { Request, Response } from "express";

import { prisma } from "../db/prisma";
import { savedSearchSchema } from "../models/validators";
import { ScanAlreadyRunningError, scanSavedSearch } from "../services/opportunityScanner";
import { findSuggestedSearchTemplate, listSuggestedSearchTemplates } from "../services/searchTemplates";
import { parseCheckbox, parseCommaList, parseCurrencyInput, parseIntegerInput, sanitizeText } from "../utils/forms";
import { redirectWithNotice } from "../utils/redirect";

function buildSavedSearchInput(body: Record<string, unknown>) {
  return savedSearchSchema.parse({
    name: sanitizeText(body.name),
    sourceMarketplace: body.sourceMarketplace === Marketplace.AMAZON_CA ? Marketplace.AMAZON_CA : Marketplace.EBAY_CA,
    destinationMarketplace:
      body.destinationMarketplace === Marketplace.EBAY_CA ? Marketplace.EBAY_CA : Marketplace.AMAZON_CA,
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
    scanFrequencyMinutes: parseIntegerInput(body.scanFrequencyMinutes, 1440),
    isActive: parseCheckbox(body.isActive)
  });
}

export async function listSavedSearches(req: Request, res: Response) {
  const savedSearches = await prisma.savedSearch.findMany({
    where: {
      kind: SavedSearchKind.MANUAL
    },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: {
          scanJobs: true,
          arbitrageOpportunities: true
        }
      },
      scanJobs: {
        orderBy: { startedAt: "desc" },
        take: 1
      }
    }
  });

  res.render("searches/index", {
    title: "Scan Profiles",
    savedSearches,
    suggestedTemplates: listSuggestedSearchTemplates()
  });
}

export async function renderNewSavedSearch(req: Request, res: Response) {
  const template = findSuggestedSearchTemplate(sanitizeText(req.query.template));

  res.render("searches/form", {
    title: "Create Scan Profile",
    formMode: "create",
    search: template?.draft ?? null,
    marketplaces: Object.values(Marketplace),
    suggestedTemplates: listSuggestedSearchTemplates(),
    selectedTemplate: template
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

  redirectWithNotice(res, "/searches", { notice: "Scan profile created." });
}

export async function renderEditSavedSearch(req: Request, res: Response) {
  const search = await prisma.savedSearch.findFirstOrThrow({
    where: {
      id: Number(req.params.id),
      kind: SavedSearchKind.MANUAL
    }
  });

  res.render("searches/form", {
    title: "Edit Scan Profile",
    formMode: "edit",
    search,
    marketplaces: Object.values(Marketplace),
    suggestedTemplates: [],
    selectedTemplate: null
  });
}

export async function updateSavedSearch(req: Request, res: Response) {
  const id = Number(req.params.id);
  const data = buildSavedSearchInput(req.body as Record<string, unknown>);

  await prisma.savedSearch.updateMany({
    where: { id, kind: SavedSearchKind.MANUAL },
    data
  });

  redirectWithNotice(res, "/searches", { notice: "Scan profile updated." });
}

export async function deleteSavedSearch(req: Request, res: Response) {
  const id = Number(req.params.id);

  await prisma.savedSearch.deleteMany({
    where: { id, kind: SavedSearchKind.MANUAL }
  });

  redirectWithNotice(res, "/searches", { notice: "Scan profile deleted." });
}

export async function runSavedSearchScan(req: Request, res: Response) {
  const id = Number(req.params.id);

  try {
    await scanSavedSearch(id, "manual");
    redirectWithNotice(res, "/searches", { notice: "Scan completed." });
  } catch (error) {
    if (error instanceof ScanAlreadyRunningError) {
      redirectWithNotice(res, "/searches", { error: "That scan profile is already running in the background." });
      return;
    }

    throw error;
  }
}
