import { Router } from "express";

import { renderDashboard } from "../controllers/dashboardController";
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  renderEditSavedSearch,
  renderNewSavedSearch,
  runSavedSearchScan,
  updateSavedSearch
} from "../controllers/savedSearchController";
import {
  changeOpportunityStatus,
  listOpportunities,
  renderOpportunityDetail,
  rescanOpportunityController,
  saveOpportunityNotesController
} from "../controllers/opportunityController";
import { renderSettings, saveSettings } from "../controllers/settingsController";
import { renderAdmin, retryScanJob } from "../controllers/adminController";
import {
  deleteMonitoredProduct,
  importMonitoredProductsController,
  listMonitoredProducts,
  renderEditMonitoredProduct,
  runMonitoredProductScan,
  toggleMonitoredProduct,
  updateMonitoredProductController
} from "../controllers/replenController";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.get("/", asyncHandler(renderDashboard));
router.get("/dashboard", asyncHandler(renderDashboard));

router.get("/searches", asyncHandler(listSavedSearches));
router.get("/searches/new", asyncHandler(renderNewSavedSearch));
router.post("/searches", asyncHandler(createSavedSearch));
router.get("/searches/:id/edit", asyncHandler(renderEditSavedSearch));
router.post("/searches/:id/update", asyncHandler(updateSavedSearch));
router.post("/searches/:id/delete", asyncHandler(deleteSavedSearch));
router.post("/searches/:id/scan", asyncHandler(runSavedSearchScan));

router.get("/replens", asyncHandler(listMonitoredProducts));
router.post("/replens/import", asyncHandler(importMonitoredProductsController));
router.get("/replens/:id/edit", asyncHandler(renderEditMonitoredProduct));
router.post("/replens/:id/update", asyncHandler(updateMonitoredProductController));
router.post("/replens/:id/scan", asyncHandler(runMonitoredProductScan));
router.post("/replens/:id/toggle", asyncHandler(toggleMonitoredProduct));
router.post("/replens/:id/delete", asyncHandler(deleteMonitoredProduct));

router.get("/opportunities", asyncHandler(listOpportunities));
router.get("/opportunities/:id", asyncHandler(renderOpportunityDetail));
router.post("/opportunities/:id/status", asyncHandler(changeOpportunityStatus));
router.post("/opportunities/:id/rescan", asyncHandler(rescanOpportunityController));
router.post("/opportunities/:id/notes", asyncHandler(saveOpportunityNotesController));

router.get("/settings", asyncHandler(renderSettings));
router.post("/settings", asyncHandler(saveSettings));

router.get("/admin", asyncHandler(renderAdmin));
router.post("/admin/jobs/:id/retry", asyncHandler(retryScanJob));

export default router;
