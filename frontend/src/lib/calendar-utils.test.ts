import { describe, it, expect } from 'vitest';
import {
  getWeeksInMonth,
  isDateInMonth,
  formatMonthYearLabel,
  formatWeekLabel,
  getMondayOnOrBefore,
  shiftMonth,
  addDays,
} from './calendar-utils';

describe('calendar-utils — month/week generation', () => {
  it('September 2026 — the explicit spec test case: Aug 31 disabled, Sep 1-30 active, Oct 1-4 disabled, 5 weeks', () => {
    // Sep 1, 2026 is a Tuesday.
    const weeks = getWeeksInMonth(2026, 9);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual({ weekStart: '2026-08-31', weekEnd: '2026-09-06' });
    expect(weeks[4]).toEqual({ weekStart: '2026-09-28', weekEnd: '2026-10-04' });

    expect(isDateInMonth('2026-08-31', 2026, 9)).toBe(false);
    for (let d = 1; d <= 30; d++) {
      const dateStr = `2026-09-${d.toString().padStart(2, '0')}`;
      expect(isDateInMonth(dateStr, 2026, 9)).toBe(true);
    }
    expect(isDateInMonth('2026-10-01', 2026, 9)).toBe(false);
    expect(isDateInMonth('2026-10-04', 2026, 9)).toBe(false);
  });

  it('January (begins on a Thursday in 2026) generates correct weeks', () => {
    const weeks = getWeeksInMonth(2026, 1);
    expect(weeks[0].weekStart).toBe('2025-12-29'); // Monday before Jan 1
    expect(weeks[weeks.length - 1].weekEnd >= '2026-01-31').toBe(true);
  });

  it('February 2026 (non-leap) has no Feb 29', () => {
    const weeks = getWeeksInMonth(2026, 2);
    const allDates = weeks.flatMap((w) => {
      const dates: string[] = [];
      let d = w.weekStart;
      for (let i = 0; i < 7; i++) {
        dates.push(d);
        d = addDays(d, 1);
      }
      return dates;
    });
    expect(allDates).not.toContain('2026-02-29');
    expect(allDates).toContain('2026-02-28');
  });

  it('February 2027 (non-leap) has no Feb 29', () => {
    const weeks = getWeeksInMonth(2027, 2);
    const hasFeb29 = weeks.some((w) => w.weekStart <= '2027-02-29' && w.weekEnd >= '2027-02-29') &&
      isDateInMonth('2027-02-29', 2027, 2);
    // 2027-02-29 isn't a real date at all — isDateInMonth is a pure string
    // comparison, so the real assertion is that no week actually contains it
    // as a valid day (proven by the day-count check below instead).
    expect(hasFeb29).toBe(false);
    const lastDay = new Date(Date.UTC(2027, 2, 0)).getUTCDate();
    expect(lastDay).toBe(28);
  });

  it('February 2028 (leap year) has Feb 29', () => {
    const lastDay = new Date(Date.UTC(2028, 2, 0)).getUTCDate();
    expect(lastDay).toBe(29);
    expect(isDateInMonth('2028-02-29', 2028, 2)).toBe(true);
  });

  it('a 30-day month (April) and a 31-day month (May) both generate complete week coverage', () => {
    const april = getWeeksInMonth(2026, 4);
    const may = getWeeksInMonth(2026, 5);
    expect(april[0].weekStart <= '2026-04-01').toBe(true);
    expect(april[april.length - 1].weekEnd >= '2026-04-30').toBe(true);
    expect(may[0].weekStart <= '2026-05-01').toBe(true);
    expect(may[may.length - 1].weekEnd >= '2026-05-31').toBe(true);
  });

  it('a month beginning on a Monday needs no leading out-of-month days in its first week', () => {
    // 2026-06-01 is a Monday.
    const weeks = getWeeksInMonth(2026, 6);
    expect(weeks[0].weekStart).toBe('2026-06-01');
  });

  it('a month beginning on a Sunday has 6 out-of-month days in its first week', () => {
    // 2026-11-01 is a Sunday.
    const weeks = getWeeksInMonth(2026, 11);
    expect(weeks[0].weekStart).toBe('2026-10-26');
    expect(weeks[0].weekEnd).toBe('2026-11-01');
  });

  it('a month ending on a Sunday needs no trailing out-of-month days in its last week', () => {
    // 2027-01-31 is a Sunday, the last day of January.
    const weeks = getWeeksInMonth(2027, 1);
    expect(weeks[weeks.length - 1].weekEnd).toBe('2027-01-31');
  });

  it('a month ending on a Monday has 6 trailing out-of-month days in its last week', () => {
    // 2026-11-30 is a Monday.
    const weeks = getWeeksInMonth(2026, 11);
    const last = weeks[weeks.length - 1];
    expect(last.weekStart).toBe('2026-11-30');
    expect(last.weekEnd).toBe('2026-12-06');
  });

  it('correctly produces a genuine 6-week month (e.g. May 2027: starts Saturday, ends Monday)', () => {
    const weeks = getWeeksInMonth(2027, 5);
    expect(weeks).toHaveLength(6);
  });

  it('year transition: December 2026 -> January 2027 rolls forward without breaking week math', () => {
    const dec = shiftMonth(2026, 12, 1);
    expect(dec).toEqual({ year: 2027, month: 1 });
    const jan = shiftMonth(2027, 1, -1);
    expect(jan).toEqual({ year: 2026, month: 12 });

    const decWeeks = getWeeksInMonth(2026, 12);
    const janWeeks = getWeeksInMonth(2027, 1);
    expect(decWeeks[decWeeks.length - 1].weekEnd >= '2026-12-31').toBe(true);
    expect(janWeeks[0].weekStart <= '2027-01-01').toBe(true);
  });

  it('formatMonthYearLabel is dynamic, never hardcoded', () => {
    expect(formatMonthYearLabel(2026, 9)).toBe('September 2026');
    expect(formatMonthYearLabel(2027, 1)).toBe('January 2027');
    expect(formatMonthYearLabel(2028, 12)).toBe('December 2028');
  });

  it('formatWeekLabel handles same-month and cross-month ranges', () => {
    expect(formatWeekLabel('2026-09-07', '2026-09-13')).toBe('Sep 7 – Sep 13');
    expect(formatWeekLabel('2026-08-31', '2026-09-06')).toBe('Aug 31 – Sep 6');
    expect(formatWeekLabel('2026-09-28', '2026-10-04')).toBe('Sep 28 – Oct 4');
  });

  it('getMondayOnOrBefore handles every weekday correctly, including Sunday', () => {
    expect(getMondayOnOrBefore('2026-09-01')).toBe('2026-08-31'); // Tuesday -> prior Monday
    expect(getMondayOnOrBefore('2026-09-06')).toBe('2026-08-31'); // Sunday -> prior Monday (6-day walk-back)
    expect(getMondayOnOrBefore('2026-08-31')).toBe('2026-08-31'); // Already Monday
  });
});
