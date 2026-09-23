/**
 * Reusable identity cells: avatar + name + subtitle (students, staff),
 * and batch tag lists. Keeps table rows consistent across features.
 */
import { Link } from 'react-router-dom';
import type { Batch, ID } from '@/types/domain';
import { Avatar, Tag } from '@/components/ui';
import { useLookups } from '@/hooks/useTenant';
import { cn } from '@/lib/cn';

interface PersonCellProps {
  name: string;
  subtitle?: string;
  photoUrl?: string;
  to?: string;
  dimmed?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function PersonCell({ name, subtitle, photoUrl, to, dimmed, size = 'md' }: PersonCellProps) {
  const title = (
    <span
      className={cn(
        'block truncate font-semibold leading-tight text-on-surface',
        size === 'sm' ? 'font-label-lg text-label-lg' : 'font-title-md text-title-md',
      )}
    >
      {name}
    </span>
  );
  return (
    <div className="flex min-w-0 items-center gap-space-xs">
      <Avatar name={name} src={photoUrl} size={size} dimmed={dimmed} />
      <div className="flex min-w-0 flex-col">
        {to ? (
          <Link to={to} className="hover:text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
            {title}
          </Link>
        ) : (
          title
        )}
        {subtitle && <span className="truncate font-body-sm text-body-sm text-secondary">{subtitle}</span>}
      </div>
    </div>
  );
}

/**
 * Batch assignment cell from the roster: one batch → "Batch M2 · Math";
 * several → short codes "M2 S1 · Math & Sci".
 */
export function BatchTags({ batchIds, withSubject = true }: { batchIds: ID[]; withSubject?: boolean }) {
  const { batch: batchMap, subject } = useLookups();
  const batches = batchIds.map((id) => batchMap.get(id)).filter((b): b is Batch => !!b && b.status !== 'Archived');
  if (!batches.length) return <span className="font-body-sm text-body-sm text-secondary">Unassigned</span>;
  const subs = [...new Set(batches.map((b) => b.subjectId))].map((id) => subject.get(id));
  const subjectText = subs.length === 1 ? (subs[0]?.name ?? '') : subs.map((s) => s?.shortName ?? s?.name.slice(0, 4) ?? '').join(' & ');
  return (
    <div className="flex items-center gap-1">
      {batches.length === 1 ? (
        <Link to={`/batches/${batches[0].id}`} onClick={(e) => e.stopPropagation()}>
          <Tag className="px-2.5 py-1 hover:bg-surface-container-highest">{batches[0].name}</Tag>
        </Link>
      ) : (
        batches.map((b) => (
          <Link key={b.id} to={`/batches/${b.id}`} onClick={(e) => e.stopPropagation()}>
            <Tag title={b.title} className="hover:bg-surface-container-highest">
              {b.code}
            </Tag>
          </Link>
        ))
      )}
      {withSubject && <span className="ml-1 whitespace-nowrap font-body-sm text-body-sm text-secondary">{subjectText}</span>}
    </div>
  );
}
