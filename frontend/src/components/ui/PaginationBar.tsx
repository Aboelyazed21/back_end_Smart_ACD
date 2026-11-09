import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Pagination } from '../../lib/types';
import { formatInt, formatTerm, termOptions } from '../../lib/format';
import { IconButton } from './Button';
import { Select } from './Input';

export function PaginationBar({
  pagination,
  onPage,
  className,
}: {
  pagination: Pagination;
  onPage: (page: number) => void;
  className?: string;
}) {
  if (!pagination || pagination.total === 0) return null;
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-sm text-ink-500">
        <span>
          عرض {formatInt((pagination.page - 1) * pagination.limit + 1)}–
          {formatInt(Math.min(pagination.page * pagination.limit, pagination.total))} من {formatInt(pagination.total)}
        </span>
        <div className="flex items-center gap-1">
          <IconButton
            label="الصفحة السابقة"
            disabled={pagination.page <= 1}
            onClick={() => onPage(pagination.page - 1)}
            className="disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" />
          </IconButton>
          <span className="px-2 text-xs font-semibold text-ink-700">
            {formatInt(pagination.page)} / {formatInt(Math.max(1, pagination.pages))}
          </span>
          <IconButton
            label="الصفحة التالية"
            disabled={pagination.page >= pagination.pages}
            onClick={() => onPage(pagination.page + 1)}
            className="disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

export function TermSelect({
  value,
  onChange,
  label = 'الفصل الدراسي',
  allowAll = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  allowAll?: boolean;
  className?: string;
}) {
  const options = termOptions(8);
  if (value && !options.some((option) => option.value === value)) {
    options.unshift({ value, label: formatTerm(value) });
  }
  return (
    <Select
      label={label}
      className={className}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      options={allowAll ? [{ value: '', label: 'كل الفصول' }, ...options] : options}
    />
  );
}
