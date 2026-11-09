import { describe, expect, it } from 'vitest';
import { passwordChecks } from './password';

function allOk(password: string): boolean {
  return passwordChecks(password).every((check) => check.ok);
}

describe('passwordChecks', () => {
  it('accepts a password that meets the backend policy', () => {
    expect(allOk('ChangeMe!2026')).toBe(true);
  });

  it('requires at least twelve characters', () => {
    expect(allOk('Short!1')).toBe(false);
  });

  it('requires mixed case', () => {
    expect(allOk('alllowercase!1')).toBe(false);
    expect(allOk('ALLUPPERCASE!1')).toBe(false);
  });

  it('requires a digit', () => {
    expect(allOk('NoDigitsHere!!')).toBe(false);
  });

  it('requires a symbol', () => {
    expect(allOk('NoSymbolsHere12')).toBe(false);
  });
});
