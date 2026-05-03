export function parseCurrencyInput(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numeric = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

export function parseIntegerInput(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

export function parseCheckbox(value: unknown): boolean {
  return value === "on" || value === "true" || value === true;
}

export function sanitizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .trim();
}

export function parseCommaList(value: unknown): string[] {
  return sanitizeText(value)
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}
