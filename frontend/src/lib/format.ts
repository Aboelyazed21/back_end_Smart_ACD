import clsx, { type ClassValue } from 'clsx';
import i18n, { currentLocale } from '../i18n';
import { SEASONS } from './constants';
import type { Season } from './types';

export function cn(...values: ClassValue[]): string {
  return clsx(values);
}

export function formatNumber(value: number | string | null | undefined, digits = 2): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return String(value);
  return new Intl.NumberFormat(currentLocale(), {
    minimumFractionDigits: Number.isInteger(num) && digits === 0 ? 0 : Math.min(digits, 2),
    maximumFractionDigits: Math.min(digits, 2),
    // Keep Latin digits everywhere so codes, counts and percentages never mix
    // Arabic-Indic and Western numerals on the same screen.
    numberingSystem: 'latn',
  }).format(num);
}

export function formatInt(value: number | string | null | undefined): string {
  return formatNumber(value, 0);
}

export function formatPercent(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return `${formatNumber(value, 1)}${i18n.t('٪')}`;
}

export function formatDate(value: string | Date | null | undefined, withTime = false): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(currentLocale(), {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    numberingSystem: 'latn',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function formatTerm(term: string | null | undefined): string {
  if (!term) return i18n.t('الفصل الحالي');
  const match = /^(\d{4}-\d{4})-(fall|spring|summer)$/.exec(term);
  if (!match) return term;
  return `${i18n.t(SEASONS[match[2] as Season])} ${match[1]}`;
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const [h, m] = value.split(':');
  const hour = Number(h);
  if (!Number.isFinite(hour)) return value;
  const suffix = i18n.t(hour < 12 ? 'ص' : 'م');
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m ?? '00'} ${suffix}`;
}

export function currentTermValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const season: Season = month >= 9 ? 'fall' : month <= 1 ? 'spring' : month <= 5 ? 'spring' : 'summer';
  const academicYear = month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  return `${academicYear}-${season}`;
}

export function termOptions(count = 6): Array<{ value: string; label: string }> {
  const base = currentTermValue();
  const match = /^(\d{4})-(\d{4})-(fall|spring|summer)$/.exec(base);
  if (!match) return [{ value: base, label: formatTerm(base) }];
  const startYear = Number(match[1]);
  const order: Season[] = ['fall', 'spring', 'summer'];
  let index = order.indexOf(match[3] as Season);
  let year = startYear;
  const options: Array<{ value: string; label: string }> = [];
  for (let i = 0; i < count; i += 1) {
    const season = order[index];
    const value = `${year}-${year + 1}-${season}`;
    options.push({ value, label: formatTerm(value) });
    index -= 1;
    if (index < 0) {
      index = order.length - 1;
      year -= 1;
    }
  }
  return options;
}

export function initials(name: string | null | undefined): string {
  if (!name || !name.trim()) return i18n.t('؟');
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]).join('');
}

export function truncate(value: string, length = 80): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

/** Renders a backend enum/status token, preferring a translation when one exists. */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  const translated = i18n.t(value);
  if (translated !== value) return translated;
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}
