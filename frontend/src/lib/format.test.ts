import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import {
  currentTermValue,
  formatDate,
  formatInt,
  formatNumber,
  formatPercent,
  formatTerm,
  formatTime,
  humanize,
  initials,
  termOptions,
  truncate,
} from './format';

describe('formatNumber', () => {
  it('renders an em dash for empty values', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
    expect(formatNumber('')).toBe('—');
  });

  it('formats numeric strings and numbers with Latin digits', () => {
    expect(formatInt(12)).toBe('12');
    expect(formatNumber('3.5', 1)).toBe('3.5');
  });

  it('returns raw text for non-finite input', () => {
    expect(formatNumber('not-a-number')).toBe('not-a-number');
  });
});

describe('formatPercent', () => {
  it('appends the Arabic percent sign', () => {
    expect(formatPercent(75)).toBe('75.0٪');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('formatDate', () => {
  it('formats valid dates and rejects junk', () => {
    expect(formatDate('2026-10-01T00:00:00.000Z')).toContain('2026');
    expect(formatDate('nope')).toBe('—');
    expect(formatDate(null)).toBe('—');
  });
});

describe('formatTerm', () => {
  it('translates canonical terms', () => {
    expect(formatTerm('2026-2027-fall')).toBe('خريف 2026-2027');
    expect(formatTerm('2026-2027-spring')).toBe('ربيع 2026-2027');
  });

  it('falls back to the raw value or a default label', () => {
    expect(formatTerm('weird')).toBe('weird');
    expect(formatTerm(null)).toBe('الفصل الحالي');
  });
});

describe('formatTime', () => {
  it('converts 24h times to Arabic meridiem', () => {
    expect(formatTime('09:05')).toBe('9:05 ص');
    expect(formatTime('13:30')).toBe('1:30 م');
    expect(formatTime('00:00')).toBe('12:00 ص');
  });

  it('handles missing and malformed values', () => {
    expect(formatTime(null)).toBe('—');
    expect(formatTime('bad')).toBe('bad');
  });
});

describe('currentTermValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a canonical academic-year term', () => {
    vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));
    expect(currentTermValue()).toBe('2026-2027-fall');
  });

  it('uses the previous academic year before September', () => {
    vi.setSystemTime(new Date('2026-03-15T00:00:00Z'));
    expect(currentTermValue()).toBe('2025-2026-spring');
  });
});

describe('termOptions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('walks backwards across academic years', () => {
    const options = termOptions(4);
    expect(options.map((option) => option.value)).toEqual([
      '2026-2027-fall',
      '2025-2026-summer',
      '2025-2026-spring',
      '2025-2026-fall',
    ]);
    expect(options[0]?.label).toBe('خريف 2026-2027');
  });
});

describe('text helpers', () => {
  it('builds initials from the first two words', () => {
    expect(initials('أحمد محمد علي')).toBe('أم');
    expect(initials('  ')).toBe('؟');
    expect(initials(null)).toBe('؟');
  });

  it('truncates long strings', () => {
    expect(truncate('abcdef', 3)).toBe('abc…');
    expect(truncate('abc', 3)).toBe('abc');
  });

  it('humanizes enum-like values', () => {
    expect(humanize('in_review')).toBe('In Review');
    expect(humanize(null)).toBe('—');
  });
});
