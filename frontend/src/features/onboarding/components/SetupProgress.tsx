/**
 * Wizard progress. Phones get "Step 3 of 7" plus a bar (the labels would never
 * fit); from md up, a row of numbered steps that can be clicked to jump back
 * to anything already visited or finished.
 */
import { Icon, ProgressBar } from '@/components/ui';
import { cn } from '@/lib/cn';
import { SETUP_STEPS, isStepDone, type SetupData, type SetupStepId } from '../setupStatus';

interface SetupProgressProps {
  current: SetupStepId;
  index: number;
  total: number;
  data: SetupData;
  onJump: (id: SetupStepId) => void;
}

export function SetupProgress({ current, index, total, data, onJump }: SetupProgressProps) {
  return (
    <>
      {/* Phones */}
      <div className="flex flex-col gap-space-xs md:hidden">
        <div className="flex items-baseline justify-between gap-space-xs">
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">
            Step {index + 1} of {total}
          </p>
          <p className="font-label-md text-label-md text-primary">{SETUP_STEPS[index].label}</p>
        </div>
        <ProgressBar value={index / (total - 1)} label={`Setup progress: step ${index + 1} of ${total}`} />
      </div>

      {/* Tablet and up */}
      <ol className="hidden items-center gap-space-2xs md:flex">
        {SETUP_STEPS.map((s, i) => {
          const done = isStepDone(s.id, data) || i < index;
          const active = s.id === current;
          // Anything already visited or finished can be re-opened.
          const reachable = done || i <= index;
          return (
            <li key={s.id} className="flex min-w-0 flex-1 items-center gap-space-2xs">
              <button
                type="button"
                disabled={!reachable}
                aria-current={active ? 'step' : undefined}
                onClick={() => onJump(s.id)}
                className={cn(
                  'flex min-w-0 items-center gap-space-2xs rounded-lg px-2 py-1.5 text-left transition-colors',
                  reachable ? 'hover:bg-surface-container-low' : 'cursor-not-allowed opacity-50',
                  active && 'bg-primary-fixed/60',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-label-md text-label-md tnum',
                    active
                      ? 'bg-primary text-on-primary'
                      : done
                        ? 'bg-primary-fixed text-primary'
                        : 'border border-outline-variant text-secondary',
                  )}
                >
                  {done && !active ? <Icon name="check" size={16} /> : i + 1}
                </span>
                <span
                  className={cn(
                    'hidden truncate font-label-md text-label-md lg:inline',
                    active ? 'text-primary' : 'text-on-surface-variant',
                  )}
                >
                  {s.label}
                </span>
              </button>
              {i < SETUP_STEPS.length - 1 && (
                <span aria-hidden className={cn('h-px min-w-2 flex-1', i < index ? 'bg-primary-container' : 'bg-outline-variant/60')} />
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
