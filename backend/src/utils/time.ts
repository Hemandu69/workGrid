/**
 * WorkGrid Centralized Timezone & Time Conversion Utilities
 * Standard Presentation Timezone: Asia/Kolkata (IST, UTC+05:30)
 */

export const APP_TIMEZONE = 'Asia/Kolkata';
export const TIMEZONE_LABEL = 'IST';

/**
 * Returns current timestamp in UTC (system of record)
 */
export function getCurrentDate(): Date {
  return new Date();
}

/**
 * Converts a UTC date + hour into exact ISO string
 */
export function createUtcTimestamp(dateStr: string, hour: number, minute: number = 0): Date {
  const d = new Date(dateStr + 'T00:00:00.000Z');
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

/**
 * Formats a Date/ISO string to IST time (e.g. "03:30 PM IST")
 */
export function formatToISTTime(date: Date | string | number, includeTimezone = true): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  const timeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);

  return includeTimezone ? `${timeStr} ${TIMEZONE_LABEL}` : timeStr;
}

/**
 * Formats a Date/ISO string to IST date (e.g. "20 Aug 2026")
 */
export function formatToISTDate(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Formats a Date/ISO string to full IST date + time (e.g. "20 Aug 2026, 03:30 PM IST")
 */
export function formatToISTDateTime(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  const dateStr = formatToISTDate(d);
  const timeStr = formatToISTTime(d);
  return `${dateStr}, ${timeStr}`;
}

/**
 * Converts a UTC hourly range (e.g. 10:00 UTC - 11:00 UTC on dateStr) to exact IST presentation
 */
export function formatUtcWindowToIST(dateStr: string, startHourUtc: number, endHourUtc: number) {
  const startDateUtc = createUtcTimestamp(dateStr, startHourUtc);
  const endDateUtc = createUtcTimestamp(dateStr, endHourUtc);

  const startIST = formatToISTTime(startDateUtc);
  const endIST = formatToISTTime(endDateUtc);
  const dateIST = formatToISTDate(startDateUtc);

  return {
    startIso: startDateUtc.toISOString(),
    endIso: endDateUtc.toISOString(),
    startIST,
    endIST,
    dateIST,
    activeWindowIST: `${startIST.replace(` ${TIMEZONE_LABEL}`, '')} – ${endIST}`,
  };
}

/**
 * Decomposes a UTC Date into its IST wall-clock date (YYYY-MM-DD), hour (0-23),
 * and minute components — the inverse of convertISTToUTC.
 */
export function getISTDateTimeParts(date: Date): { dateStr: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = parseInt(get('hour'), 10) % 24;
  const minute = parseInt(get('minute'), 10);

  return { dateStr, hour, minute };
}

/**
 * Formats a naive 0-24 slot hour (already the person's local wall-clock
 * hour — AvailabilitySlot.hour is stored and edited as a plain local
 * number, never UTC — so no timezone conversion happens here) into a
 * 12-hour clock label, e.g. 9 -> "09:00 AM", 24 -> "12:00 AM" (midnight,
 * the end-of-day boundary — never treated as a next-day timestamp).
 */
export function formatSlotHourLabel(hour: number): string {
  const h = hour % 24;
  const period = h < 12 ? 'AM' : 'PM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour.toString().padStart(2, '0')}:00 ${period}`;
}

/**
 * The current wall-clock hour (0-23) in APP_TIMEZONE — the correct value
 * to compare against AvailabilitySlot.hour, which is a naive local hour,
 * not a UTC hour.
 */
export function getCurrentLocalHour(now: Date = new Date()): number {
  return getISTDateTimeParts(now).hour;
}

/**
 * Today's calendar date (YYYY-MM-DD) in APP_TIMEZONE — the correct "today"
 * for comparing against real calendar dates, since the UTC calendar date
 * can differ from the IST one near midnight.
 */
export function getCurrentLocalDateString(now: Date = new Date()): string {
  return getISTDateTimeParts(now).dateStr;
}

/**
 * Converts an IST date string & hour into corresponding UTC date string & hour
 */
export function convertISTToUTC(istDateStr: string, istHour: number, istMinute: number = 0): {
  utcDateStr: string;
  utcHour: number;
  utcMinute: number;
  utcIso: string;
} {
  // Construct a date string in IST format e.g. "2026-08-20T15:30:00+05:30"
  const hh = istHour.toString().padStart(2, '0');
  const mm = istMinute.toString().padStart(2, '0');
  const istIso = `${istDateStr}T${hh}:${mm}:00+05:30`;
  const date = new Date(istIso);

  const utcDateStr = date.toISOString().split('T')[0];
  const utcHour = date.getUTCHours();
  const utcMinute = date.getUTCMinutes();

  return {
    utcDateStr,
    utcHour,
    utcMinute,
    utcIso: date.toISOString(),
  };
}
