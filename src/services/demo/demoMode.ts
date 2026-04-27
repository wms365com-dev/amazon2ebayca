import { env } from "../../config/env";
import { AppSettings } from "../../types/domain";

export function isDemoModeActive(settings?: AppSettings): boolean {
  return Boolean(settings?.demoModeOverride || env.demoModeRequested);
}
