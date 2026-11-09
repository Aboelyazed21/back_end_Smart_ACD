import { forwardRef, useId, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/format';

const CONTROL =
  'w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 disabled:bg-ink-50 disabled:text-ink-500';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink-800">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs leading-5 text-ink-500">{hint}</p>}
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leading?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, leading, id, required, ...props },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <Field label={label} htmlFor={inputId} hint={hint} error={error} required={required}>
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-ink-400">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          required={required}
          className={cn(CONTROL, 'h-10', leading && 'ps-10', error && 'border-danger focus:border-danger', className)}
          aria-invalid={Boolean(error)}
          {...props}
        />
      </div>
    </Field>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, label, hint, error, options, placeholder, id, required, ...props },
  ref,
) {
  const generated = useId();
  const selectId = id ?? generated;
  return (
    <Field label={label} htmlFor={selectId} hint={hint} error={error} required={required}>
      <select
        ref={ref}
        id={selectId}
        required={required}
        className={cn(CONTROL, 'h-10 appearance-none', error && 'border-danger', className)}
        aria-invalid={Boolean(error)}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, label, hint, error, id, required, ...props },
  ref,
) {
  const generated = useId();
  const textareaId = id ?? generated;
  return (
    <Field label={label} htmlFor={textareaId} hint={hint} error={error} required={required}>
      <textarea
        ref={ref}
        id={textareaId}
        required={required}
        className={cn(CONTROL, 'min-h-[96px] py-2.5 leading-6', error && 'border-danger', className)}
        aria-invalid={Boolean(error)}
        {...props}
      />
    </Field>
  );
});

export function Checkbox({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('flex cursor-pointer items-center gap-2 text-sm text-ink-700', className)}>
      <input
        id={id}
        type="checkbox"
        className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
        {...props}
      />
      {label}
    </label>
  );
}
