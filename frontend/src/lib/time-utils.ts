/**
 * WorkGrid Centralized Timezone & Dynamic Time Utilities
 * Standard Presentation Timezone: Asia/Kolkata (IST, UTC+05:30)
 */

export const APP_TIMEZONE = 'Asia/Kolkata';
export const TIMEZONE_LABEL = 'IST';

/**
 * Returns current timestamp in UTC
 */
export function getCurrentDate(): Date {
  return new Date();
}

/**
 * Returns current date string formatted as YYYY-MM-DD in Asia/Kolkata timezone
 */
export function getCurrentISTDateString(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now); // en-CA produces YYYY-MM-DD
}

/**
 * Formats a Date/ISO string to IST time (e.g. "04:30 PM IST")
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
 * Formats a Date/ISO string to full IST date + time (e.g. "20 Aug 2026, 04:30 PM IST")
 */
export function formatToISTDateTime(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  const dateStr = formatToISTDate(d);
  const timeStr = formatToISTTime(d);
  return `${dateStr}, ${timeStr}`;
}

/**
 * Formats relative time from now in IST (e.g. "Just now", "5m ago", "Today at 3:45 PM IST")
 */
export function formatRelativeIST(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;

  return formatToISTDateTime(d);
}

/**
 * Converts a UTC date + hour (0..24) to exact IST window label
 * e.g. date: "2026-08-20", startHour: 10, endHour: 11 -> "03:30 PM – 04:30 PM IST"
 */
export function formatUtcWindowToIST(dateStr: string, startHourUtc: number, endHourUtc: number) {
  const startDateUtc = new Date(`${dateStr}T00:00:00.000Z`);
  startDateUtc.setUTCHours(startHourUtc, 0, 0, 0);

  const endDateUtc = new Date(`${dateStr}T00:00:00.000Z`);
  endDateUtc.setUTCHours(endHourUtc, 0, 0, 0);

  const startFormatted = formatToISTTime(startDateUtc, false);
  const endFormatted = formatToISTTime(endDateUtc, true);
  const dateIST = formatToISTDate(startDateUtc);

  return {
    startIso: startDateUtc.toISOString(),
    endIso: endDateUtc.toISOString(),
    startIST: formatToISTTime(startDateUtc, true),
    endIST: endFormatted,
    dateIST,
    activeWindowIST: `${startFormatted} – ${endFormatted}`,
  };
}

/**
 * Generate 24 hourly slot options in IST with accurate UTC mapping
 */
export function getISTTimeOptions(): Array<{
  istHour: number;
  istMinute: number;
  label: string;
  utcHourEquivalent: number;
}> {
  return Array.from({ length: 24 }, (_, i) => {
    const period = i >= 12 ? 'PM' : 'AM';
    const displayHour = i % 12 === 0 ? 12 : i % 12;
    const label = `${displayHour.toString().padStart(2, '0')}:00 ${period} ${TIMEZONE_LABEL}`;
    
    // IST (UTC +05:30): UTC hour = (IST hour - 5.5 + 24) % 24
    // We floor/round to whole hour for backend query
    const utcHourEquivalent = (i - 5 + 24) % 24;

    return {
      istHour: i,
      istMinute: 0,
      label,
      utcHourEquivalent,
    };
  });
}
