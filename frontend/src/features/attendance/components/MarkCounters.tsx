/**
 * Running tallies for the roll call — Present / Late / Absent / Excused /
 * Unmarked — plus a progress meter of how much of the roll is marked.
 * Each tile carries its label, so colour is never the only signal.
 */
import { ProgressBar } from '@/components/ui';
import { MARK_LABELS } from '@/domain/attendance';
import { cn } from '@/lib/cn';
import { MARK_ORDER } from '../attendanceStats';
import type { RollCounts } from '../useRollCall';
import { MARK_SOFT } from './markStyles';

export function MarkCounters({ counts, total }: { counts: RollCounts; total: number }) {
  const tiles = [
    ...MARK_ORDER.map((m) => ({ key: m, label: MARK_LABELS[m], value: counts[m], cls: MARK_SOFT[m] })),
    {
      key: 'U',
      label: 'Unmarked',
      value: counts.unmarked,
      cls: counts.unmarked ? 'bg-surface-container-high text-on-surface' : 'bg-surface-container-low text-secondary',
    },
  ];
  return (
    <div className="flex flex-col gap-space-xs">
      <div className="grid grid-cols-5 gap-space-2xs" aria-live="polite">
        {tiles.map((t) => (
          <div key={t.key} className={cn('flex flex-col items-center rounded-lg px-0.5 py-1.5', t.cls)}>
            <span className="font-title-lg text-title-lg tnum">{t.value}</span>
            <span className="max-w-full truncate font-label-sm text-[10px] tracking-normal sm:text-label-sm sm:tracking-[0.03em]">
              {t.label}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-space-xs">
        <ProgressBar value={total ? (total - counts.unmarked) / total : 0} label="Roll call progress" className="flex-1" />
        <span className="shrink-0 font-label-md text-label-md text-secondary tnum">
          {total - counts.unmarked}/{total} marked
        </span>
      </div>
    </div>
  );
}
