import { Router } from "express";

import {
  receiveEbayAccountDeletionNotification,
  verifyEbayAccountDeletionWebhook
} from "../controllers/webhookController";
import { asyncHandler } from "../utils/asyncHandler";

const webhookRouter = Router();

webhookRouter.get("/ebay/account-deletion", asyncHandler(verifyEbayAccountDeletionWebhook));
webhookRouter.post("/ebay/account-deletion", asyncHandler(receiveEbayAccountDeletionNotification));

export default webhookRouter;
