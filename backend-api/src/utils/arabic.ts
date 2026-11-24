import { ArabicShaper } from 'arabic-persian-reshaper';

const ARABIC_RANGES: Array<[number, number]> = [
  [0x0600, 0x06ff],
  [0x0750, 0x077f],
  [0x08a0, 0x08ff],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfeff],
];

function isArabic(code: number): boolean {
  return ARABIC_RANGES.some(([start, end]) => code >= start && code <= end);
}

function isLatinOrDigit(char: string): boolean {
  return /[A-Za-z0-9\u00c0-\u024f]/.test(char);
}

const MIRRORED: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
};

function reverseRun(text: string): string {
  return Array.from(text)
    .reverse()
    .map((char) => MIRRORED[char] ?? char)
    .join('');
}

interface Run {
  rtl: boolean;
  text: string;
}

/**
 * Reorders one line of already-shaped text into visual order for an
 * left-to-right renderer: right-to-left runs are reversed, Latin/number runs
 * keep their internal order, and the runs themselves are emitted left to right.
 */
function reorderLine(shaped: string): string {
  const runs: Run[] = [];
  for (const char of shaped) {
    const code = char.codePointAt(0) ?? 0;
    const rtl = isArabic(code);
    const ltr = !rtl && isLatinOrDigit(char);
    const kind: 'rtl' | 'ltr' | 'neutral' = rtl ? 'rtl' : ltr ? 'ltr' : 'neutral';
    const last = runs[runs.length - 1];
    if (kind === 'neutral') {
      if (last) last.text += char;
      else runs.push({ rtl: true, text: char });
      continue;
    }
    const asRtl = kind === 'rtl';
    if (last && last.rtl === asRtl) last.text += char;
    else runs.push({ rtl: asRtl, text: char });
  }
  if (!runs.some((run) => run.rtl)) return shaped;
  return runs
    .map((run) => (run.rtl ? reverseRun(run.text) : run.text))
    .reverse()
    .join('');
}

/**
 * Converts logical Arabic (with Latin words and numbers) into the visual
 * sequence expected by pdfkit, which has no bidi or Arabic shaping support.
 * Returns an empty string for empty input so callers can skip the line.
 */
export function shapeArabic(input: string): string {
  if (!input) return '';
  const shaped = ArabicShaper.convertArabic(input);
  return reorderLine(shaped);
}
