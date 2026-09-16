export function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object' && value !== null && 'toNumber' in (value as Record<string, unknown>)) {
    const n = (value as { toNumber: () => number }).toNumber();
    return isNaN(n) ? fallback : n;
  }
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  return isNaN(n) ? fallback : n;
}

export function toMoney(value: unknown): number {
  return Math.round(toNumber(value) * 1000) / 1000;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function money(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
}
