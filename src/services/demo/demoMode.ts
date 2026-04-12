import { env } from "../../config/env";
import { AppSettings } from "../../types/domain";

export function isDemoModeActive(settings?: AppSettings): boolean {
  return settings?.demoModeOverride || env.demoModeRequested || !env.hasEbayCredentials || !env.hasAmazonCredentials;
}
