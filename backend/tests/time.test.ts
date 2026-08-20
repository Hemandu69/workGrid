import { describe, it, expect } from 'vitest';
import {
  formatToISTTime,
  formatToISTDate,
  formatToISTDateTime,
  formatUtcWindowToIST,
  convertISTToUTC,
} from '../src/utils/time.js';

describe('Timezone & IST Time Conversion Utilities', () => {
  it('should accurately convert 10:00 UTC to 03:30 PM IST (15:30)', () => {
    const utcDate = new Date('2026-08-20T10:00:00.000Z');
    const istTime = formatToISTTime(utcDate);
    expect(istTime).toBe('3:30 PM IST');
  });

  it('should accurately convert 10:30 UTC to 04:00 PM IST (16:00)', () => {
    const utcDate = new Date('2026-08-20T10:30:00.000Z');
    const istTime = formatToISTTime(utcDate);
    expect(istTime).toBe('4:00 PM IST');
  });

  it('should accurately handle date rollover: 21:00 UTC on Aug 20 becomes 02:30 AM IST on Aug 21', () => {
    const utcDate = new Date('2026-08-20T21:00:00.000Z');
    const istTime = formatToISTTime(utcDate);
    const istDate = formatToISTDate(utcDate);
    const istFull = formatToISTDateTime(utcDate);

    expect(istTime).toBe('2:30 AM IST');
    expect(istDate).toBe('Aug 21, 2026');
    expect(istFull).toBe('Aug 21, 2026, 2:30 AM IST');
  });

  it('should accurately handle date rollover: 23:30 UTC becomes 05:00 AM IST next day', () => {
    const utcDate = new Date('2026-08-20T23:30:00.000Z');
    const istTime = formatToISTTime(utcDate);
    expect(istTime).toBe('5:00 AM IST');
  });

  it('should format UTC hourly window to IST active window label', () => {
    // 10:00 UTC - 11:00 UTC on 2026-08-20
    const window = formatUtcWindowToIST('2026-08-20', 10, 11);
    expect(window.startIST).toBe('3:30 PM IST');
    expect(window.endIST).toBe('4:30 PM IST');
    expect(window.activeWindowIST).toBe('3:30 PM – 4:30 PM IST');
  });

  it('should convert IST input back to UTC correctly', () => {
    const converted = convertISTToUTC('2026-08-20', 15, 30);
    expect(converted.utcHour).toBe(10);
    expect(converted.utcMinute).toBe(0);
    expect(converted.utcDateStr).toBe('2026-08-20');
  });
});
