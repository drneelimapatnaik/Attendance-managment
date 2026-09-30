/**
 * Settings › Campuses: list with add / edit / remove, staged in a draft and
 * persisted with the section's Save. A campus can't be removed while it is
 * the last one, or while batches or current students still belong to it
 * (they would be orphaned) — the reason is shown next to the disabled button.
 * The list itself lives in ../fields (shared with the setup wizard).
 */
import { useMemo, useState } from 'react';
import type { Campus } from '@/types/domain';
import { Button } from '@/components/ui';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { pluralize } from '@/lib/format';
import { SettingsSection } from '../components/SettingsSection';
import { CampusEditor, type CampusEditing } from '../fields';
import { useDraft } from '../useDraft';

export function CampusesSection() {
  const settings = useSettings();
  const batches = useDataStore((s) => s.batches);
  const students = useDataStore((s) => s.students);
  const updateSettings = useDataStore((s) => s.updateSettings);
  const toast = useToast();
  const saved = useMemo(() => ({ campuses: settings.campuses }), [settings.campuses]);
  const { draft, setDraft, dirty, reset } = useDraft(saved);
  const [editing, setEditing] = useState<CampusEditing>(null);

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
      <CampusEditor
        campuses={draft.campuses}
        onChange={(campuses) => setDraft({ campuses })}
        editing={editing}
        onEditingChange={setEditing}
        removeBlock={removeBlock}
        isUnsaved={(c) => !settings.campuses.some((x) => x.id === c.id)}
        meta={(c) => (
          <p className="font-body-sm text-body-sm text-on-surface-variant tnum">
            {pluralize(usage.get(c.id)?.batches ?? 0, 'batch', 'batches')} · {pluralize(usage.get(c.id)?.students ?? 0, 'student')}
          </p>
        )}
        emptyHint="No campuses yet — add the first one."
      />
    </SettingsSection>
  );
}
