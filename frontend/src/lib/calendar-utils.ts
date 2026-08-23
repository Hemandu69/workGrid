/**
 * Pure calendar-date arithmetic for the calendar-aware Weekly Availability
 * page. Every function here operates on Date.UTC(...)-anchored dates (never
 * the browser's local timezone), so month/week generation is correct
 * regardless of where the browser happens to be — these are plain calendar
 * dates, not real-world instants, so no IANA timezone conversion applies.
 */

export interface WeekRange {
  weekStart: string; // YYYY-MM-DD, always a Monday
  weekEnd: string; // YYYY-MM-DD, always the following Sunday
}

export function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function parseDateStr(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDateStr(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateStr(d);
}

/**
 * The Monday on or before the given date — JS's getUTCDay() is 0=Sunday,
 * so Sunday needs a 6-day walk-back while every other day walks back
 * (day - 1).
 */
export function getMondayOnOrBefore(dateStr: string): string {
  const d = parseDateStr(dateStr);
  const dow = d.getUTCDay();
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  return addDays(dateStr, -daysSinceMonday);
}

export function getMondayOfWeekContaining(dateStr: string): string {
  return getMondayOnOrBefore(dateStr);
}

/**
 * Every Monday-Sunday calendar week that intersects the given month —
 * naturally 4, 5, or 6 weeks depending on the real calendar. Days-in-month
 * comes from new Date(Date.UTC(year, month, 0)) (day 0 of the *next* month
 * is the last day of *this* month) — this is correctly leap-year-aware via
 * JS's own Date arithmetic, never a hand-rolled per-month day count.
 */
export function getWeeksInMonth(year: number, month: number): WeekRange[] {
  const firstOfMonth = toDateStr(new Date(Date.UTC(year, month - 1, 1)));
  const lastOfMonth = toDateStr(new Date(Date.UTC(year, month, 0)));

  const weeks: WeekRange[] = [];
  let weekStart = getMondayOnOrBefore(firstOfMonth);
  while (weekStart <= lastOfMonth) {
    const weekEnd = addDays(weekStart, 6);
    weeks.push({ weekStart, weekEnd });
    weekStart = addDays(weekStart, 7);
  }
  return weeks;
}

export function isDateInMonth(dateStr: string, year: number, month: number): boolean {
  const [y, m] = dateStr.split('-').map(Number);
  return y === year && m === month;
}

const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const WEEK_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** e.g. formatMonthYearLabel(2026, 9) -> "September 2026" — never hardcoded. */
export function formatMonthYearLabel(year: number, month: number): string {
  return MONTH_YEAR_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)));
}

/** e.g. "Aug 31 – Sep 6" / "Sep 28 – Oct 4" — dynamic month names, no hardcoding. */
export function formatWeekLabel(weekStart: string, weekEnd: string): string {
  return `${WEEK_LABEL_FORMATTER.format(parseDateStr(weekStart))} – ${WEEK_LABEL_FORMATTER.format(parseDateStr(weekEnd))}`;
}

/** e.g. "Sep 1" — used under a day name in the calendar-aware timetable header. */
export function formatShortDate(dateStr: string): string {
  return WEEK_LABEL_FORMATTER.format(parseDateStr(dateStr));
}

/** Rolls month/year forward or backward by one month (Dec->Jan / year++ handled by plain integer arithmetic). */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroBased = (month - 1) + delta;
  const newYear = year + Math.floor(zeroBased / 12);
  const newMonth = ((zeroBased % 12) + 12) % 12 + 1;
  return { year: newYear, month: newMonth };
}
