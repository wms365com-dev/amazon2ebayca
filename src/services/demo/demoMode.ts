import { env } from "../../config/env";
import { AppSettings } from "../../types/domain";

export type ConnectorName = "ebay" | "amazon";
export type ConnectorMode = "live" | "demo" | "missing";

export interface ConnectorStatus {
  connector: ConnectorName;
  configured: boolean;
  mode: ConnectorMode;
  label: string;
  reason: string;
  badgeClass: "active-badge" | "badge-demo" | "inactive-badge";
}

export interface ConnectorModeSummary {
  ebay: ConnectorStatus;
  amazon: ConnectorStatus;
  anyDemo: boolean;
  allLive: boolean;
  mixedMode: boolean;
  hasMissingCredentials: boolean;
  headline: string;
  detail: string;
}

export function getConnectorStatus(connector: ConnectorName, settings?: AppSettings): ConnectorStatus {
  const configured = connector === "ebay" ? env.hasEbayCredentials : env.hasAmazonCredentials;

  if (settings?.demoModeOverride) {
    return {
      connector,
      configured,
      mode: "demo",
      label: "Forced demo",
      reason: "Settings override is forcing this connector to use fixture data.",
      badgeClass: "badge-demo"
    };
  }

  if (configured) {
    return {
      connector,
      configured,
      mode: "live",
      label: "Live API",
      reason: "Credentials are present, so this connector can use live marketplace data.",
      badgeClass: "active-badge"
    };
  }

  if (env.demoModeRequested) {
    return {
      connector,
      configured: false,
      mode: "demo",
      label: "Demo fallback",
      reason: "Credentials are missing, so DEMO_MODE is allowing fixture fallback for this connector.",
      badgeClass: "badge-demo"
    };
  }

  return {
    connector,
    configured: false,
    mode: "missing",
    label: "Missing credentials",
    reason: "Live data is required here until credentials are added or demo fallback is enabled.",
    badgeClass: "inactive-badge"
  };
}

export function getConnectorModes(settings?: AppSettings): ConnectorModeSummary {
  const ebay = getConnectorStatus("ebay", settings);
  const amazon = getConnectorStatus("amazon", settings);
  const modes = [ebay.mode, amazon.mode];
  const anyDemo = modes.includes("demo");
  const allLive = modes.every((mode) => mode === "live");
  const hasMissingCredentials = modes.includes("missing");
  const mixedMode = new Set(modes).size > 1;

  let headline = "Live connector mode";
  if (allLive) {
    headline = "Live connector mode";
  } else if (anyDemo && mixedMode) {
    headline = "Mixed live and demo mode";
  } else if (anyDemo) {
    headline = "Demo connector mode";
  } else if (hasMissingCredentials) {
    headline = "Live credentials required";
  }

  const detail = `eBay ${ebay.label.toLowerCase()} / Amazon ${amazon.label.toLowerCase()}`;

  return {
    ebay,
    amazon,
    anyDemo,
    allLive,
    mixedMode,
    hasMissingCredentials,
    headline,
    detail
  };
}

export function isDemoModeActive(settings?: AppSettings): boolean {
  return getConnectorModes(settings).anyDemo;
}
