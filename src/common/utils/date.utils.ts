export function toStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toEndOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfToday(): Date {
  return toStartOfDay(new Date());
}

export function endOfToday(): Date {
  return toEndOfDay(new Date());
}

export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toStartOfDay(d);
}

export function startOfWeek(date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return toStartOfDay(new Date(d.setDate(diff)));
}

export function startOfMonth(date = new Date()): Date {
  return toStartOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function endOfMonth(date = new Date()): Date {
  return toEndOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

export function startOfYear(date = new Date()): Date {
  return toStartOfDay(new Date(date.getFullYear(), 0, 1));
}

export function formatDateRange(range?: string): { start: Date; end: Date } | null {
  if (!range) return null;
  const now = new Date();
  switch (range) {
    case 'today':
      return { start: toStartOfDay(now), end: toEndOfDay(now) };
    case 'yesterday': {
      const y = daysAgo(1);
      return { start: toStartOfDay(y), end: toEndOfDay(y) };
    }
    case 'week':
      return { start: startOfWeek(now), end: toEndOfDay(now) };
    case 'month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'year':
      return { start: startOfYear(now), end: toEndOfDay(now) };
    default:
      return null;
  }
}

export function parseDate(value: string | Date | undefined, fallback = new Date()): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return isNaN(d.getTime()) ? fallback : d;
}
