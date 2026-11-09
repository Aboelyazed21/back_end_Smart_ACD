import { reconciliationAttempts } from '../services/studentContext';

const CODE = /^[A-Z]{3}\d{4}$/;

describe('reconciliationAttempts', () => {
  it('splits a large credit gap into engine-valid attempts', () => {
    const attempts = reconciliationAttempts(104, 4);
    expect(attempts.length).toBeGreaterThan(1);
    expect(attempts.every((attempt) => attempt.credits >= 0 && attempt.credits <= 12)).toBe(true);
    expect(attempts.reduce((sum, attempt) => sum + attempt.credits, 0)).toBe(104);
    expect(new Set(attempts.map((attempt) => attempt.code)).size).toBe(attempts.length);
    expect(attempts.every((attempt) => CODE.test(attempt.code))).toBe(true);
    expect(attempts.every((attempt) => !attempt.counts_in_gpa && attempt.grade_letter === 'P')).toBe(true);
  });

  it('skips codes already present in the transcript', () => {
    const attempts = reconciliationAttempts(24, 3, ['TRF0001']);
    expect(attempts.map((attempt) => attempt.code)).toEqual(['TRF0002', 'TRF0003']);
    expect(attempts.reduce((sum, attempt) => sum + attempt.credits, 0)).toBe(24);
  });

  it('returns nothing for a non-positive gap and caps at 300 credits', () => {
    expect(reconciliationAttempts(0, 1)).toEqual([]);
    expect(reconciliationAttempts(-5, 1)).toEqual([]);
    expect(reconciliationAttempts(350, 1).reduce((sum, attempt) => sum + attempt.credits, 0)).toBe(300);
  });
});
