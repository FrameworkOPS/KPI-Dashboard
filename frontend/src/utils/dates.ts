// DATE columns arrive from the API as 'YYYY-MM-DD'. Older rows and some
// responses may still carry a full timestamp, so every helper normalizes
// first and never lets the browser's timezone shift a calendar date.

/** 'YYYY-MM-DD' for any date-ish input, using local time for Date objects. */
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

/** Local-midnight Date for a calendar date, so day comparisons are exact. */
export function parseLocalDate(d: string | Date | null | undefined): Date {
  return new Date(isoDate(d) + 'T00:00:00')
}

/** Today's calendar date in local time (never the UTC date). */
export function todayISO(): string {
  return isoDate(new Date())
}

/** Local midnight today, for "is this due date in the past" checks. */
export function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** True when the calendar date is before today. */
export function isBeforeToday(d: string | Date | null | undefined): boolean {
  if (!d) return false
  return parseLocalDate(d).getTime() < startOfToday().getTime()
}

/** Monday of the week containing `date`, at local midnight. */
export function mondayOf(date: Date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d
}

export function currentQuarter(d: Date = new Date()): number {
  return Math.ceil((d.getMonth() + 1) / 3)
}

/** "Wed, Oct 8" style label; options override the default parts. */
export function formatDate(d: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!d) return ''
  const parsed = parseLocalDate(d)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('en-US', options ?? { month: 'short', day: 'numeric' })
}
