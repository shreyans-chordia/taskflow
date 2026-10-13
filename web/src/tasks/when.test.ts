import { describe, expect, it } from 'vitest';
import { dateLabel, datePresets, parseDate, parseTime, time12, timeShort } from './when';

/** What the deadline pickers accept when typed into (DL-1). Today is Tuesday 13 October 2026. */
const TODAY = '2026-10-13';

describe('typed dates', () => {
  it('reads ISO, day-first numeric, and named months', () => {
    expect(parseDate('2026-10-22', TODAY)).toBe('2026-10-22');
    expect(parseDate('22/10/2026', TODAY)).toBe('2026-10-22');
    expect(parseDate('5-1-27', TODAY)).toBe('2027-01-05');
    expect(parseDate('22.10.2026', TODAY)).toBe('2026-10-22');
    expect(parseDate('22 Oct 2026', TODAY)).toBe('2026-10-22');
    expect(parseDate('October 22nd, 2026', TODAY)).toBe('2026-10-22');
    expect(parseDate(' Tomorrow ', TODAY)).toBe('2026-10-14');
    expect(parseDate('today', TODAY)).toBe(TODAY);
  });

  it('takes the next such day when the year is left out', () => {
    expect(parseDate('22 oct', TODAY)).toBe('2026-10-22');
    expect(parseDate('5 Jan', TODAY)).toBe('2027-01-05');
    expect(parseDate('13 Oct', TODAY)).toBe('2026-10-13');
  });

  it('refuses days that do not exist and things that are not dates', () => {
    expect(parseDate('31/02/2026', TODAY)).toBeNull();
    expect(parseDate('2026-13-01', TODAY)).toBeNull();
    expect(parseDate('22 Smarch', TODAY)).toBeNull();
    expect(parseDate('next friday', TODAY)).toBeNull();
    expect(parseDate('', TODAY)).toBeNull();
  });
});

describe('typed times', () => {
  it('reads 24-hour and 12-hour times', () => {
    expect(parseTime('18:30')).toBe('18:30');
    expect(parseTime('1830')).toBe('18:30');
    expect(parseTime('6:30 pm')).toBe('18:30');
    expect(parseTime('6.30PM')).toBe('18:30');
    expect(parseTime('6pm')).toBe('18:00');
    expect(parseTime('12 am')).toBe('00:00');
    expect(parseTime('12pm')).toBe('12:00');
    expect(parseTime('9')).toBe('09:00');
    expect(parseTime('noon')).toBe('12:00');
  });

  it('refuses times that do not exist', () => {
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('18:60')).toBeNull();
    expect(parseTime('13pm')).toBeNull();
    expect(parseTime('183')).toBeNull();
    expect(parseTime('soon')).toBeNull();
  });

  it('names times the way the rest of the app does', () => {
    expect(time12('18:30')).toBe('6:30 PM');
    expect(time12('00:05')).toBe('12:05 AM');
    expect(timeShort('09:00')).toBe('9 AM');
    expect(timeShort('23:59')).toBe('11:59 PM');
    expect(dateLabel('2026-10-22')).toBe('Thu 22 Oct 2026');
  });
});

describe('quick picks', () => {
  it('works them out from today', () => {
    expect(datePresets(TODAY)).toEqual([
      { label: 'Today', day: '2026-10-13' },
      { label: 'Tomorrow', day: '2026-10-14' },
      { label: 'Weekend', day: '2026-10-17' },
      { label: 'Next week', day: '2026-10-19' },
      { label: 'In 2 weeks', day: '2026-10-27' },
      { label: 'Month end', day: '2026-10-31' },
    ]);
  });

  it('on a Sunday the weekend is today, and next week starts tomorrow', () => {
    const sun = datePresets('2026-10-18');
    expect(sun.find((p) => p.label === 'Weekend')!.day).toBe('2026-10-18');
    expect(sun.find((p) => p.label === 'Next week')!.day).toBe('2026-10-19');
    expect(datePresets('2026-10-19').find((p) => p.label === 'Next week')!.day).toBe('2026-10-26'); // Monday → the next one
  });
});
