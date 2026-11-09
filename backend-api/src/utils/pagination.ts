import { AppError } from './errors';

export interface Page {
  page: number;
  limit: number;
  offset: number;
}

export function parsePage(query: Record<string, unknown>, defaultLimit = 20): Page {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? defaultLimit);
  if (!Number.isInteger(page) || page < 1) {
    throw AppError.badRequest('INVALID_PAGINATION', 'page must be a positive integer');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw AppError.badRequest('INVALID_PAGINATION', 'limit must be between 1 and 100');
  }
  return { page, limit, offset: (page - 1) * limit };
}

export function parseSort(
  value: unknown,
  whitelist: Record<string, string>,
  fallback: string,
): { column: string; direction: 'ASC' | 'DESC' } {
  if (typeof value !== 'string' || value.length === 0) {
    return { column: fallback, direction: 'DESC' };
  }
  const [rawColumn, rawDirection] = value.split(':');
  const column = whitelist[rawColumn ?? ''];
  if (!column) {
    throw AppError.badRequest('INVALID_SORT', 'unsupported sort column');
  }
  const direction = rawDirection === 'asc' ? 'ASC' : 'DESC';
  return { column, direction };
}

export function paginated<T>(items: T[], total: number, page: Page) {
  return {
    data: items,
    pagination: {
      page: page.page,
      limit: page.limit,
      total,
      pages: Math.ceil(total / page.limit),
    },
  };
}
