import { Request, Response } from "express";
import { SavedSearchKind } from "@prisma/client";

import { prisma } from "../db/prisma";
import { monitoredImportSchema, monitoredProductUpdateSchema } from "../models/validators";
import { ScanAlreadyRunningError, scanSavedSearch } from "../services/opportunityScanner";
import { importMonitoredProducts, updateMonitoredProduct } from "../services/replenMonitorService";
import { parseCheckbox, parseCurrencyInput, parseIntegerInput, sanitizeText } from "../utils/forms";
import { redirectWithNotice } from "../utils/redirect";

function buildImportInput(body: Record<string, unknown>) {
  return monitoredImportSchema.parse({
    asinsText: sanitizeText(body.asinsText),
    targetBuyPrice: parseCurrencyInput(body.targetBuyPrice),
    maxShipping: parseCurrencyInput(body.maxShipping),
    minROI: parseCurrencyInput(body.minROI),
    minProfit: parseCurrencyInput(body.minProfit),
    scanFrequencyMinutes: parseIntegerInput(body.scanFrequencyMinutes, 1440),
    isActive: parseCheckbox(body.isActive),
    notes: sanitizeText(body.notes)
  });
}

function buildUpdateInput(body: Record<string, unknown>) {
  return monitoredProductUpdateSchema.parse({
    sourceKeywords: sanitizeText(body.sourceKeywords),
    targetBuyPrice: parseCurrencyInput(body.targetBuyPrice),
    maxShipping: parseCurrencyInput(body.maxShipping),
    minROI: parseCurrencyInput(body.minROI),
    minProfit: parseCurrencyInput(body.minProfit),
    scanFrequencyMinutes: parseIntegerInput(body.scanFrequencyMinutes, 1440),
    conditionFilter: sanitizeText(body.conditionFilter),
    isActive: parseCheckbox(body.isActive),
    notes: sanitizeText(body.notes)
  });
}

export async function listMonitoredProducts(req: Request, res: Response) {
  const [monitoredProducts, totalProducts, activeProducts, profitableOpportunities] = await Promise.all([
    prisma.monitoredProduct.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        savedSearch: {
          include: {
            scanJobs: {
              orderBy: { startedAt: "desc" },
              take: 1
            },
            _count: {
              select: {
                arbitrageOpportunities: true
              }
            },
            arbitrageOpportunities: {
              where: {
                netProfit: { gt: 0 }
              },
              orderBy: [{ roiPercent: "desc" }, { netProfit: "desc" }],
              take: 1,
              include: {
                sourceListing: true
              }
            }
          }
        }
      }
    }),
    prisma.monitoredProduct.count(),
    prisma.monitoredProduct.count({
      where: {
        savedSearch: {
          isActive: true
        }
      }
    }),
    prisma.arbitrageOpportunity.count({
      where: {
        savedSearch: {
          kind: SavedSearchKind.REPLEN_MONITOR
        },
        netProfit: { gt: 0 }
      }
    })
  ]);

  res.render("replens/index", {
    title: "Replen Monitor",
    monitoredProducts,
    metrics: {
      totalProducts,
      activeProducts,
      profitableOpportunities
    },
    importDefaults: {
      targetBuyPrice: "",
      maxShipping: "",
      minROI: 15,
      minProfit: 8,
      scanFrequencyMinutes: 1440,
      isActive: true,
      notes: ""
    }
  });
}

export async function importMonitoredProductsController(req: Request, res: Response) {
  const summary = await importMonitoredProducts(buildImportInput(req.body as Record<string, unknown>));
  const message = `Imported ${summary.created}, updated ${summary.updated}, skipped ${summary.skipped}.`;

  redirectWithNotice(res, "/replens", {
    notice: summary.warnings.length > 0 ? `${message} ${summary.warnings[0]}` : message
  });
}

export async function renderEditMonitoredProduct(req: Request, res: Response) {
  const monitoredProduct = await prisma.monitoredProduct.findUniqueOrThrow({
    where: { id: Number(req.params.id) },
    include: {
      savedSearch: true
    }
  });

  res.render("replens/form", {
    title: "Edit Replen Monitor",
    monitoredProduct
  });
}

export async function updateMonitoredProductController(req: Request, res: Response) {
  const id = Number(req.params.id);
  await updateMonitoredProduct(id, buildUpdateInput(req.body as Record<string, unknown>));
  redirectWithNotice(res, "/replens", { notice: "Replen monitor updated." });
}

export async function runMonitoredProductScan(req: Request, res: Response) {
  const monitoredProduct = await prisma.monitoredProduct.findUniqueOrThrow({
    where: { id: Number(req.params.id) }
  });

  try {
    await scanSavedSearch(monitoredProduct.savedSearchId, "manual-replen");
    redirectWithNotice(res, "/replens", { notice: "Replen monitor scan completed." });
  } catch (error) {
    if (error instanceof ScanAlreadyRunningError) {
      redirectWithNotice(res, "/replens", { error: "That replen monitor is already running in the background." });
      return;
    }

    throw error;
  }
}

export async function toggleMonitoredProduct(req: Request, res: Response) {
  const monitoredProduct = await prisma.monitoredProduct.findUniqueOrThrow({
    where: { id: Number(req.params.id) },
    include: { savedSearch: true }
  });

  await prisma.savedSearch.update({
    where: { id: monitoredProduct.savedSearchId },
    data: {
      isActive: !monitoredProduct.savedSearch.isActive
    }
  });

  redirectWithNotice(res, "/replens", {
    notice: monitoredProduct.savedSearch.isActive ? "Replen monitor paused." : "Replen monitor resumed."
  });
}

export async function deleteMonitoredProduct(req: Request, res: Response) {
  const monitoredProduct = await prisma.monitoredProduct.findUniqueOrThrow({
    where: { id: Number(req.params.id) }
  });

  await prisma.savedSearch.delete({
    where: { id: monitoredProduct.savedSearchId }
  });

  redirectWithNotice(res, "/replens", { notice: "Replen monitor deleted." });
}
