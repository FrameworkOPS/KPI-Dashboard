// DATE columns come back from pg as 'YYYY-MM-DD' strings (see the type parser
// in config/database.ts), so they never shift with the server's timezone.
// These helpers turn them into local-midnight Dates for arithmetic and back.

/** Local-midnight Date for a 'YYYY-MM-DD' string (or a Date, returned as-is). */
export function toLocalDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  return new Date(String(value).slice(0, 10) + 'T00:00:00');
}

/** 'YYYY-MM-DD' in local time, without the UTC shift of toISOString(). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
