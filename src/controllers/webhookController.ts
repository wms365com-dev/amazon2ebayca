import { Request, Response } from "express";

import { logger } from "../config/logger";
import {
  buildEbayChallengeResponse,
  getEbayAccountDeletionWebhookUrl,
  hasEbayNotificationVerificationToken
} from "../services/ebay/notificationService";

export async function verifyEbayAccountDeletionWebhook(req: Request, res: Response) {
  const challengeCode = String(req.query.challenge_code ?? "").trim();

  if (!challengeCode) {
    res.status(400).json({ error: "Missing challenge_code query parameter" });
    return;
  }

  if (!hasEbayNotificationVerificationToken()) {
    res.status(500).json({ error: "Missing eBay verification token configuration" });
    return;
  }

  const challengeResponse = buildEbayChallengeResponse(challengeCode);

  res.type("application/json");
  res.status(200).json({ challengeResponse });
}

export async function receiveEbayAccountDeletionNotification(req: Request, res: Response) {
  logger.info(
    {
      path: req.path,
      endpoint: getEbayAccountDeletionWebhookUrl(),
      headers: {
        "x-ebay-signature": req.header("x-ebay-signature") ?? null
      },
      body: req.body
    },
    "Received eBay account deletion notification"
  );

  res.status(200).json({ received: true });
}
