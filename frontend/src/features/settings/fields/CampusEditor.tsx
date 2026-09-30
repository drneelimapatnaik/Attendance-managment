/**
 * Campus list with add / edit / remove, shared by Settings › Campuses and the
 * setup wizard's Campuses step. The caller owns the list (and decides when it
 * is persisted) and supplies the reasons a campus may not be removed, plus the
 * modal's open state so an "Add campus" button can live anywhere.
 */
import type { ReactNode } from 'react';
import type { Campus } from '@/types/domain';
import { Badge, Icon, IconButton } from '@/components/ui';
import { CampusFormModal } from '../components/CampusFormModal';

/** `'new'` opens an empty form; a campus opens it for editing. */
export type CampusEditing = Campus | 'new' | null;

interface CampusEditorProps {
  campuses: Campus[];
  onChange: (next: Campus[]) => void;
  editing: CampusEditing;
  onEditingChange: (editing: CampusEditing) => void;
  /** Why this campus can't be removed right now, or null. */
  removeBlock?: (campus: Campus) => string | null;
  /** Extra line under the address, e.g. batch/student counts. */
  meta?: (campus: Campus) => ReactNode;
  /** Marks a campus that has not been saved yet. */
  isUnsaved?: (campus: Campus) => boolean;
  /** Shown instead of the list while there are no campuses. */
  emptyHint?: ReactNode;
}

export function CampusEditor({ campuses, onChange, editing, onEditingChange, removeBlock, meta, isUnsaved, emptyHint }: CampusEditorProps) {
  const upsert = (c: Campus) =>
    onChange(campuses.some((x) => x.id === c.id) ? campuses.map((x) => (x.id === c.id ? c : x)) : [...campuses, c]);
  const remove = (id: string) => onChange(campuses.filter((x) => x.id !== id));
  const editingCampus = editing && editing !== 'new' ? editing : undefined;

  return (
    <>
      {campuses.length === 0 ? (
        <p className="flex items-center gap-space-xs rounded-xl border border-dashed border-outline-variant/60 p-space-md font-body-md text-body-md text-secondary">
          <Icon name="location_off" size={18} />
          {emptyHint ?? 'No campuses yet.'}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-surface-container-low rounded-xl border border-outline-variant/40">
          {campuses.map((c) => {
            const block = removeBlock?.(c) ?? null;
            return (
              <li key={c.id} className="flex items-start gap-space-sm p-space-sm sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-space-sm">
                  <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-low text-primary sm:flex">
                    <Icon name="domain" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-space-xs font-label-lg text-label-lg text-on-surface">
                      {c.name}
                      {isUnsaved?.(c) && <Badge tone="info">New · unsaved</Badge>}
                    </p>
                    <p className="font-body-sm text-body-sm text-secondary">{c.address}</p>
                    {meta?.(c)}
                    {block && (
                      <p className="mt-0.5 flex items-center gap-1 font-body-sm text-body-sm text-secondary">
                        <Icon name="lock" size={14} />
                        {block}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <IconButton icon="edit" label={`Edit ${c.name}`} onClick={() => onEditingChange(c)} />
                  <IconButton
                    icon="delete"
                    label={block ? `Can't remove ${c.name}: ${block}` : `Remove ${c.name}`}
                    tone="danger"
                    disabled={!!block}
                    onClick={() => remove(c.id)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <CampusFormModal
          open
          onClose={() => onEditingChange(null)}
          campus={editingCampus}
          takenNames={campuses.filter((c) => c.id !== editingCampus?.id).map((c) => c.name)}
          onSubmit={upsert}
        />
      )}
    </>
  );
}
