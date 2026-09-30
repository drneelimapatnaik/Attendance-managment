/**
 * Accept-or-replace chip list, used by the Academics step for grades and
 * subjects. Suggestions come pre-selected so a typical institute can move on
 * with one glance; tapping a chip toggles it, and anything can be typed in.
 *
 * Chips that already exist in the store are locked: the wizard only ever adds
 * academics, so nothing an institute created can be deleted from here.
 */
import { useState, type KeyboardEvent } from 'react';
import { Button, Icon, TextField } from '@/components/ui';
import { cn } from '@/lib/cn';

interface ChipPickerProps {
  label: string;
  hint?: string;
  /** Offered chips, in display order. */
  suggestions: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Values that already exist and cannot be unpicked here. */
  locked?: string[];
  lockedHint?: string;
  addPlaceholder: string;
  error?: string;
}

export function ChipPicker({
  label,
  hint,
  suggestions,
  selected,
  onChange,
  locked = [],
  lockedHint,
  addPlaceholder,
  error,
}: ChipPickerProps) {
  const [entry, setEntry] = useState('');
  const lockedSet = new Set(locked.map((v) => v.toLowerCase()));
  // Suggestions first, then anything the institute typed, then locked values.
  const options = [...suggestions, ...selected.filter((v) => !suggestions.includes(v))].filter((v) => !lockedSet.has(v.toLowerCase()));

  const toggle = (value: string) => onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  const add = () => {
    const value = entry.trim().replace(/\s+/g, ' ');
    setEntry('');
    if (!value || lockedSet.has(value.toLowerCase())) return;
    const existing = options.find((v) => v.toLowerCase() === value.toLowerCase());
    if (existing) {
      if (!selected.includes(existing)) toggle(existing);
      return;
    }
    onChange([...selected, value]);
  };

  const onEntryKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter adds the value instead of submitting the step.
    if (e.key !== 'Enter') return;
    e.preventDefault();
    add();
  };

  return (
    <fieldset className="flex flex-col gap-space-xs">
      <legend className="label">{label}</legend>
      {hint && <p className="font-body-sm text-body-sm text-secondary">{hint}</p>}

      <div className="flex flex-wrap gap-space-xs">
        {locked.map((value) => (
          <span
            key={`locked-${value}`}
            title={lockedHint}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-surface-container px-space-sm font-label-lg text-label-lg text-on-surface-variant md:min-h-[36px]"
          >
            <Icon name="lock" size={16} />
            {value}
          </span>
        ))}
        {options.map((value) => {
          const on = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(value)}
              className={cn(
                'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-space-sm font-label-lg text-label-lg transition-colors md:min-h-[36px]',
                on
                  ? 'border-primary-container bg-primary-fixed text-on-primary-fixed'
                  : 'border-outline-variant/70 text-on-surface-variant hover:bg-surface-container-low',
              )}
            >
              <Icon name={on ? 'check_circle' : 'add_circle'} size={16} />
              {value}
            </button>
          );
        })}
      </div>

      <div className="flex items-end gap-space-xs">
        <TextField
          label={addPlaceholder}
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={onEntryKeyDown}
          containerClassName="max-w-xs flex-1"
        />
        <Button variant="tonal" icon="add" onClick={add} disabled={!entry.trim()}>
          Add
        </Button>
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-1 font-body-sm text-body-sm text-error">
          <Icon name="error" size={14} />
          {error}
        </p>
      )}
    </fieldset>
  );
}
