export function poundsToPennies(value: number | string): number {
  const parsed = typeof value === 'string' ? Number(value.replace(/[^0-9.-]/g, '')) : value;
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function penniesToPounds(value: number): number {
  return Math.round(value) / 100;
}

export function formatMoney(value: number, options?: { signed?: boolean; compact?: boolean }): string {
  const pounds = penniesToPounds(value);
  const formatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: options?.compact && Number.isInteger(pounds) ? 0 : 2,
    maximumFractionDigits: options?.compact && Number.isInteger(pounds) ? 0 : 2,
    signDisplay: options?.signed ? 'always' : 'auto',
  }).format(pounds);
  return formatted.replace('-£', '−£');
}

export function clampMoney(value: number): number {
  return Math.max(0, Math.round(value));
}
