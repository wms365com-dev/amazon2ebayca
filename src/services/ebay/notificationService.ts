import crypto from "crypto";

import { env } from "../../config/env";

export const EBAY_ACCOUNT_DELETION_WEBHOOK_PATH = "/webhooks/ebay/account-deletion";

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getEbayAccountDeletionWebhookUrl() {
  return `${trimTrailingSlash(env.APP_BASE_URL)}${EBAY_ACCOUNT_DELETION_WEBHOOK_PATH}`;
}

export function hasEbayNotificationVerificationToken() {
  return Boolean(env.EBAY_NOTIFICATION_VERIFICATION_TOKEN);
}

export function buildEbayChallengeResponse(challengeCode: string) {
  const verificationToken = env.EBAY_NOTIFICATION_VERIFICATION_TOKEN;

  if (!verificationToken) {
    throw new Error("EBAY_NOTIFICATION_VERIFICATION_TOKEN is not configured");
  }

  const hash = crypto.createHash("sha256");
  hash.update(challengeCode);
  hash.update(verificationToken);
  hash.update(getEbayAccountDeletionWebhookUrl());

  return hash.digest("hex");
}
