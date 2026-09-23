/**
 * Settings › Campuses: list with add / edit / remove, staged in a draft and
 * persisted with the section's Save. A campus can't be removed while it is
 * the last one, or while batches or current students still belong to it
 * (they would be orphaned) — the reason is shown next to the disabled button.
 */
import { useMemo, useState } from 'react';
import type { Campus } from '@/types/domain';
import { Badge, Button, Icon, IconButton } from '@/components/ui';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { pluralize } from '@/lib/format';
import { CampusFormModal } from '../components/CampusFormModal';
import { SettingsSection } from '../components/SettingsSection';
import { useDraft } from '../useDraft';

export function CampusesSection() {
  const settings = useSettings();
  const batches = useDataStore((s) => s.batches);
  const students = useDataStore((s) => s.students);
  const updateSettings = useDataStore((s) => s.updateSettings);
  const toast = useToast();
  const saved = useMemo(() => ({ campuses: settings.campuses }), [settings.campuses]);
  const { draft, setDraft, dirty, reset } = useDraft(saved);
  const [editing, setEditing] = useState<Campus | 'new' | null>(null);

  // Tenant-wide usage per campus (this page manages every campus).
  const usage = useMemo(() => {
    const map = new Map<string, { batches: number; students: number }>();
    for (const b of batches) {
      if (b.status === 'Archived') continue;
      const u = map.get(b.campusId) ?? { batches: 0, students: 0 };
      u.batches++;
      map.set(b.campusId, u);
    }
    for (const s of students) {
      if (s.status === 'Inactive') continue;
      const u = map.get(s.campusId) ?? { batches: 0, students: 0 };
      u.students++;
      map.set(s.campusId, u);
    }
    return map;
  }, [batches, students]);

  const removeBlock = (c: Campus): string | null => {
    if (draft.campuses.length <= 1) return 'You need at least one campus.';
    const u = usage.get(c.id);
    if (u?.batches) return `Has ${pluralize(u.batches, 'batch', 'batches')} — archive or move them first.`;
    if (u?.students) return `Has ${pluralize(u.students, 'current student')} — move them first.`;
    return null;
  };

  const upsert = (c: Campus) =>
    setDraft((d) => ({
      campuses: d.campuses.some((x) => x.id === c.id) ? d.campuses.map((x) => (x.id === c.id ? c : x)) : [...d.campuses, c],
    }));
  const remove = (id: string) => setDraft((d) => ({ campuses: d.campuses.filter((x) => x.id !== id) }));

  const editingCampus = editing && editing !== 'new' ? editing : undefined;

  return (
    <SettingsSection
      id="campuses"
      icon="location_city"
      title="Campuses"
      description="Branches of your institute. The campus picker in the top bar filters every screen."
      dirty={dirty}
      onSave={() => {
        updateSettings({ campuses: draft.campuses });
        toast({ title: 'Campuses saved', description: pluralize(draft.campuses.length, 'campus', 'campuses') });
      }}
      onDiscard={reset}
      headerActions={
        <Button variant="tonal" size="sm" icon="add_business" onClick={() => setEditing('new')}>
          Add campus
        </Button>
      }
    >
      <ul className="flex flex-col divide-y divide-surface-container-low rounded-xl border border-outline-variant/40">
        {draft.campuses.map((c) => {
          const u = usage.get(c.id);
          const block = removeBlock(c);
          const isNew = !settings.campuses.some((x) => x.id === c.id);
          return (
            <li key={c.id} className="flex items-start gap-space-sm p-space-sm sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-space-sm">
                <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-low text-primary sm:flex">
                  <Icon name="domain" />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-space-xs font-label-lg text-label-lg text-on-surface">
                    {c.name}
                    {isNew && <Badge tone="info">New · unsaved</Badge>}
                  </p>
                  <p className="font-body-sm text-body-sm text-secondary">{c.address}</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant tnum">
                    {pluralize(u?.batches ?? 0, 'batch', 'batches')} · {pluralize(u?.students ?? 0, 'student')}
                  </p>
                  {block && (
                    <p className="mt-0.5 flex items-center gap-1 font-body-sm text-body-sm text-secondary">
                      <Icon name="lock" size={14} />
                      {block}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <IconButton icon="edit" label={`Edit ${c.name}`} onClick={() => setEditing(c)} />
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

      {editing && (
        <CampusFormModal
          open
          onClose={() => setEditing(null)}
          campus={editingCampus}
          takenNames={draft.campuses.filter((c) => c.id !== editingCampus?.id).map((c) => c.name)}
          onSubmit={upsert}
        />
      )}
    </SettingsSection>
  );
}
