import { describe, expect, it } from 'vitest';
import { ApiError, errorMessage, qs } from './api';

describe('qs', () => {
  it('omits empty values and encodes the rest', () => {
    expect(qs({ page: 2, limit: 20, search: undefined, status: '', course: null })).toBe('?page=2&limit=20');
  });

  it('returns an empty string when nothing is set', () => {
    expect(qs({})).toBe('');
  });
});

describe('errorMessage', () => {
  it('localizes rate-limit errors with retry-after', () => {
    const error = new ApiError(429, 'RATE_LIMITED', 'Too many requests', {}, null, 30);
    expect(errorMessage(error)).toContain('30 ثانية');
  });

  it('surfaces the first Zod-style issue', () => {
    const error = new ApiError(422, 'VALIDATION_ERROR', 'Validation failed', [
      { path: 'email', message: 'Invalid email' },
    ]);
    expect(errorMessage(error)).toBe('Validation failed (email: Invalid email)');
  });

  it('falls back to the API message for other errors', () => {
    expect(errorMessage(new ApiError(404, 'NOT_FOUND', 'Not found'))).toBe('Not found');
  });

  it('handles plain errors and unknown values', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('weird')).toBe('حدث خطأ غير متوقع.');
  });
});
