/**
 * Day picker for the roll call: previous / next day, a native date input
 * (uses the OS picker on phones) and a "Today" shortcut. Full width on
 * phones so every control keeps a 44px touch target.
 */
import type { ISODate } from '@/types/domain';
import { Button, IconButton } from '@/components/ui';
import { addDays, today } from '@/lib/date';
import { cn } from '@/lib/cn';

interface DateStepperProps {
  value: ISODate;
  onChange: (date: ISODate) => void;
  className?: string;
}

export function DateStepper({ value, onChange, className }: DateStepperProps) {
  const isToday = value === today();
  return (
    <div className={cn('flex w-full items-center gap-space-2xs sm:w-auto', className)}>
      <IconButton
        icon="chevron_left"
        label="Previous day"
        className="bg-surface-container-low"
        onClick={() => onChange(addDays(value, -1))}
      />
      <input
        type="date"
        aria-label="Attendance date"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="field min-w-0 flex-1 cursor-pointer font-label-lg text-label-lg tnum sm:w-44 sm:flex-none"
      />
      <IconButton icon="chevron_right" label="Next day" className="bg-surface-container-low" onClick={() => onChange(addDays(value, 1))} />
      <Button variant={isToday ? 'secondary' : 'tonal'} icon="today" disabled={isToday} onClick={() => onChange(today())}>
        Today
      </Button>
    </div>
  );
}
