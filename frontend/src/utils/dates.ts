// Postgres returns DATE columns as full ISO timestamps when serialized through
// the JSON layer (e.g. "2025-06-12T07:00:00.000Z" for a row whose meeting_date
// is just 2025-06-12). The frontend formatters were written assuming the value
// is already YYYY-MM-DD and appending "T00:00:00", which produces an invalid
// date when the value is the full ISO string ("Invalid Date" in the UI).
//
// `isoDate` normalizes any date-ish input to YYYY-MM-DD so every callsite can
// safely do `new Date(isoDate(x) + 'T00:00:00')` and get a local-midnight Date.
export function isoDate(d: string | Date | null | undefined): string {
  if (!d) return ''
  if (d instanceof Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return String(d).slice(0, 10)
}

// Convenience: parse a Postgres date string into a local-midnight Date, so
// comparisons like `dateA >= today` are timezone-safe.
export function parseLocalDate(d: string | Date | null | undefined): Date {
  return new Date(isoDate(d) + 'T00:00:00')
}
