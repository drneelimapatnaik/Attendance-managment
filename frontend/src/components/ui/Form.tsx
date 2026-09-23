/**
 * Form controls — DESIGN.md › Form Inputs, Checkboxes & Selection Controls.
 *
 * Every control accepts `label`, `hint` and `error`; ids are generated so
 * labels and errors are wired for screen readers. Inputs are 44px tall on
 * touch screens and 40px on desktop (`.field` in styles/index.css).
 */
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

/* ------------------------------------------------------------ FieldShell */

interface ShellProps {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function FieldShell({ id, label, hint, error, required, className, children }: ShellProps) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <label htmlFor={id} className="label">
          {label}
          {required && <span className="ml-0.5 text-error">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 flex items-center gap-1 font-body-sm text-body-sm text-error">
          <Icon name="error" size={14} />
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1 font-body-sm text-body-sm text-secondary">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: ReactNode) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

/* ------------------------------------------------------------ TextField */

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  leadingIcon?: string;
  trailing?: ReactNode;
  containerClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, leadingIcon, trailing, containerClassName, className, id: idProp, required, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={containerClassName}>
      <div className="relative">
        {leadingIcon && <Icon name={leadingIcon} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />}
        <input
          ref={ref}
          id={id}
          required={required}
          aria-invalid={!!error}
          aria-describedby={describedBy(id, error, hint)}
          className={cn('field', leadingIcon && 'pl-10', trailing ? 'pr-10' : undefined, error && 'field-invalid', className)}
          {...rest}
        />
        {trailing && <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
    </FieldShell>
  );
});

/* ------------------------------------------------------------ SelectField */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  containerClassName?: string;
}

/** Native select (best on mobile: uses the OS picker) with the design's chevron. */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, error, options, placeholder, containerClassName, className, id: idProp, required, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={containerClassName}>
      <div className="relative">
        <select
          ref={ref}
          id={id}
          required={required}
          aria-invalid={!!error}
          aria-describedby={describedBy(id, error, hint)}
          className={cn('field cursor-pointer appearance-none pr-8 font-label-md text-label-md', error && 'field-invalid', className)}
          {...rest}
        >
          {placeholder !== undefined && (
            <option value="" disabled={required}>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="expand_more" size={18} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-secondary" />
      </div>
    </FieldShell>
  );
});

/* ------------------------------------------------------------ TextArea */

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  containerClassName?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, containerClassName, className, id: idProp, required, rows = 3, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={containerClassName}>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        required={required}
        aria-invalid={!!error}
        aria-describedby={describedBy(id, error, hint)}
        className={cn('field h-auto py-2', error && 'field-invalid', className)}
        {...rest}
      />
    </FieldShell>
  );
});

/* ------------------------------------------------------------ SearchInput */

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  containerClassName?: string;
}

export function SearchInput({ value, onChange, containerClassName, className, placeholder = 'Search…', ...rest }: SearchInputProps) {
  return (
    <div className={cn('relative', containerClassName)}>
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={rest['aria-label'] ?? placeholder}
        className={cn('field pl-10 pr-9 [&::-webkit-search-cancel-button]:hidden', className)}
        {...rest}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-secondary hover:bg-surface-container"
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Checkbox */

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  indeterminate?: boolean;
  label?: ReactNode;
}

/** 18px checkbox with indeterminate support (bulk selection headers). */
export function Checkbox({ indeterminate, label, className, ...rest }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  const box = (
    <input
      ref={ref}
      type="checkbox"
      className={cn('h-[18px] w-[18px] shrink-0 cursor-pointer rounded accent-primary-container', className)}
      {...rest}
    />
  );
  if (!label) return box;
  return (
    <label className="inline-flex cursor-pointer items-center gap-space-xs font-body-md text-body-md text-on-surface">
      {box}
      {label}
    </label>
  );
}

/* ------------------------------------------------------------ Switch */

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
}

export function Switch({ checked, onChange, label, description, disabled, id: idProp }: SwitchProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const control = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-primary-container' : 'bg-outline-variant',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
  if (!label) return control;
  return (
    <div className="flex items-start justify-between gap-space-md">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block font-label-lg text-label-lg text-on-surface">{label}</span>
        {description && <span className="block font-body-sm text-body-sm text-secondary">{description}</span>}
      </label>
      {control}
    </div>
  );
}

/* ------------------------------------------------------------ SegmentedControl */

export interface Segment<V extends string> {
  value: V;
  label: ReactNode;
  icon?: string;
  /** Tailwind classes applied when this segment is selected. */
  activeClassName?: string;
  ariaLabel?: string;
}

interface SegmentedControlProps<V extends string> {
  value: V | null;
  onChange: (value: V) => void;
  segments: Segment<V>[];
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

/**
 * Connected toggle group. Used for the attendance fast-toggles (P / L / A)
 * and for view switches. Large touch targets on mobile.
 * Keyboard: one tab stop; ←/→ (and Home/End) move and select, like radio buttons.
 */
export function SegmentedControl<V extends string>({
  value,
  onChange,
  segments,
  size = 'md',
  className,
  ariaLabel,
  disabled,
}: SegmentedControlProps<V>) {
  const selectedIndex = segments.findIndex((s) => s.value === value);
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const n = segments.length;
    const next =
      e.key === 'ArrowRight'
        ? (idx + 1) % n
        : e.key === 'ArrowLeft'
          ? (idx - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(segments[next].value);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={cn('inline-flex rounded-lg bg-surface-container-low p-0.5', disabled && 'opacity-60', className)}
    >
      {segments.map((s, idx) => {
        const active = s.value === value;
        // Roving tab stop: the selected segment (or the first) is the only one in the tab order.
        const tabbable = selectedIndex >= 0 ? idx === selectedIndex : idx === 0;
        return (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={s.ariaLabel}
            disabled={disabled}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => onChange(s.value)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={cn(
              'inline-flex items-center justify-center gap-1 rounded-md font-label-md text-label-md transition-all disabled:cursor-not-allowed',
              size === 'sm' ? 'h-9 min-w-9 px-2 md:h-8 md:min-w-8' : 'h-11 min-w-11 px-3 md:h-9 md:min-w-10',
              active
                ? (s.activeClassName ?? 'bg-surface-container-lowest text-primary shadow-sm')
                : 'text-on-surface-variant enabled:hover:bg-surface-container enabled:hover:text-on-surface',
            )}
          >
            {s.icon && <Icon name={s.icon} size={16} />}
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
