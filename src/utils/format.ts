export const currencyFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD"
});

export const percentFormatter = new Intl.NumberFormat("en-CA", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }

  return currencyFormatter.format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }

  return `${value.toFixed(1)}%`;
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) {
    return "--";
  }

  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
