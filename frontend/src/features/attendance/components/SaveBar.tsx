/**
 * Sticky save bar for the roll call. Sits above the mobile bottom nav (the
 * nav is ~56px + safe area; `main` already pads for it) and at the bottom of
 * the viewport on desktop, so Save is always one tap away on a long roll.
 */
import { Button, Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { RollCounts } from '../useRollCall';

interface SaveBarProps {
  dirty: boolean;
  saved: boolean; // a session already exists
  counts: RollCounts;
  total: number;
  disabled: boolean;
  onSave: () => void;
  onReset: () => void;
}

export function SaveBar({ dirty, saved, counts, total, disabled, onSave, onReset }: SaveBarProps) {
  const status = dirty
    ? { icon: 'edit_note', text: 'Unsaved changes', cls: 'text-on-warning-container' }
    : saved
      ? { icon: 'cloud_done', text: 'All changes saved', cls: 'text-on-success-container' }
      : { icon: 'pending_actions', text: 'Not saved yet', cls: 'text-on-surface-variant' };
  return (
    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 lg:bottom-space-md">
      <div
        className={cn(
          'flex items-center gap-space-sm rounded-xl border p-space-sm shadow-level-2',
          dirty ? 'border-warning/60 bg-warning-container' : 'border-outline-variant/40 bg-surface-container-lowest',
        )}
      >
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className={cn('flex items-center gap-1.5 font-label-lg text-label-lg', status.cls)}>
            <Icon name={status.icon} size={18} />
            {status.text}
          </p>
          <p className="truncate font-body-sm text-body-sm text-on-surface-variant tnum">
            {total - counts.unmarked}/{total} marked · {counts.A} absent
            {counts.unmarked > 0 && ` · ${counts.unmarked} left`}
          </p>
        </div>
        {dirty && (
          <Button variant="ghost" onClick={onReset} className="hidden sm:inline-flex">
            Discard
          </Button>
        )}
        <Button icon="save" onClick={onSave} disabled={disabled}>
          {saved ? 'Update' : 'Save'}
          {/* Leading space keeps the accessible name "Save attendance"; the button's gap handles the visual spacing. */}
          <span className="hidden sm:inline"> attendance</span>
        </Button>
      </div>
    </div>
  );
}
