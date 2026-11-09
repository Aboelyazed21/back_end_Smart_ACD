import { AppError } from '../utils/errors';

export type Season = 'fall' | 'spring' | 'summer';

export interface Term {
  season: Season;
  academicYear: string;
  term: string;
  week: number;
  isFirstSemester: boolean;
}

const TERM_RE = /^(\d{4})-(\d{4})[-\s:_]?(fall|spring|summer)$/i;
const SEASON_ONLY_RE = /^(fall|spring|summer)$/i;

export function defaultTerm(now = new Date()): Term {
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  // Academic year starts in September; summer belongs to the closing year.
  let start = year;
  let season: Season;
  if (month >= 9) {
    season = 'fall';
  } else if (month <= 5) {
    start = year - 1;
    season = 'spring';
  } else {
    start = year - 1;
    season = 'summer';
  }
  return buildTerm(season, `${start}-${start + 1}`, 1, false);
}

export function buildTerm(season: Season, academicYear: string, week = 1, isFirstSemester = false): Term {
  if (!/^\d{4}-\d{4}$/.test(academicYear)) {
    throw AppError.badRequest('INVALID_TERM', 'academic year must look like 2026-2027');
  }
  const [start, end] = academicYear.split('-').map(Number);
  if (end !== (start as number) + 1) {
    throw AppError.badRequest('INVALID_TERM', 'academic year must cover consecutive years');
  }
  if (!Number.isInteger(week) || week < 0 || week > 30) {
    throw AppError.badRequest('INVALID_TERM', 'week must be between 0 and 30');
  }
  return {
    season,
    academicYear,
    term: `${academicYear}-${season}`,
    week,
    isFirstSemester,
  };
}

/** Accepts `2026-2027-fall`, `fall 2026-2027`, `fall:2026-2027`, or `fall`. */
export function parseTerm(value: unknown, now = new Date()): Term {
  if (value === undefined || value === null || value === '') return defaultTerm(now);
  if (typeof value !== 'string') {
    throw AppError.badRequest('INVALID_TERM', 'term must be a string');
  }
  const raw = value.trim();
  const direct = TERM_RE.exec(raw.replace(/\s+/g, '-'));
  if (direct) {
    return buildTerm(direct[3]!.toLowerCase() as Season, `${direct[1]}-${direct[2]}`);
  }
  const seasonOnly = SEASON_ONLY_RE.exec(raw);
  if (seasonOnly) {
    const fallback = defaultTerm(now);
    return buildTerm(seasonOnly[1]!.toLowerCase() as Season, fallback.academicYear);
  }
  const parts = raw.split(/[:\s]+/);
  if (parts.length === 2) {
    const season = parts.find((p) => SEASON_ONLY_RE.test(p));
    const year = parts.find((p) => /^\d{4}-\d{4}$/.test(p));
    if (season && year) return buildTerm(season.toLowerCase() as Season, year);
  }
  throw AppError.badRequest('INVALID_TERM', 'term must be one of 2026-2027-fall, fall:2026-2027, or fall');
}

export function termToEngine(term: Term): {
  season: Season;
  academic_year: string;
  week: number;
  is_first_semester: boolean;
} {
  return {
    season: term.season,
    academic_year: term.academicYear,
    week: term.week,
    is_first_semester: term.isFirstSemester,
  };
}
