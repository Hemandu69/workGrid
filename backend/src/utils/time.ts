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
