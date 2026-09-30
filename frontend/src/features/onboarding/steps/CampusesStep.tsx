/**
 * Setup step 3 — campuses. One is required: every batch and student belongs to
 * a campus, and the top-bar picker filters the app by it.
 *
 * Single-site institutes get a ready-made row built from the address entered in
 * step 1, so accepting takes one click. The list itself is the same component
 * Settings › Campuses uses.
 */
import { useMemo, useState } from 'react';
import type { Campus } from '@/types/domain';
import { Button, Icon } from '@/components/ui';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { uid } from '@/lib/id';
import { CampusEditor, type CampusEditing } from '@/features/settings/fields';
import { useDraft } from '@/features/settings/useDraft';
import { SetupStepShell } from '../components/SetupStepShell';
import type { SetupNav } from '../useSetupNav';

/** A campus row is usable once it has a name and somewhere to find it. */
const isUsable = (c: Campus) => c.name.trim().length >= 2 && c.address.trim().length >= 5;

export function CampusesStep({ nav }: { nav: SetupNav }) {
  const settings = useSettings();
  const updateSettings = useDataStore((s) => s.updateSettings);
  const [error, setError] = useState('');

  const saved = useMemo(() => {
    if (settings.campuses.length) return { campuses: settings.campuses };
    // Nothing yet: offer the main campus at the address given in step 1.
    const suggestion = settings.address.trim();
    return { campuses: suggestion ? [{ id: uid('cmp'), name: 'Main Campus', address: suggestion }] : [] };
  }, [settings.campuses, settings.address]);
  const { draft, setDraft } = useDraft(saved);
  const [editing, setEditing] = useState<CampusEditing>(null);

  const save = () => {
    const usable = draft.campuses.filter(isUsable);
    if (!usable.length) {
      setError('Add at least one campus — a name and its address.');
      return false;
    }
    setError('');
    updateSettings({ campuses: usable });
    return true;
  };

  return (
    <SetupStepShell
      nav={nav}
      onNext={save}
      note={
        <>
          Teaching from one place? One campus is all you need. Branches can be added later in{' '}
          <strong className="text-on-surface">Settings › Campuses</strong>.
        </>
      }
    >
      <CampusEditor
        campuses={draft.campuses}
        onChange={(campuses) => {
          setDraft({ campuses });
          setError('');
        }}
        editing={editing}
        onEditingChange={setEditing}
        removeBlock={() => null}
        isUnsaved={(c) => !settings.campuses.some((x) => x.id === c.id)}
        emptyHint="No campuses yet — add the place you teach."
      />
      <div className="flex flex-wrap items-center gap-space-sm">
        <Button variant="tonal" icon="add_business" onClick={() => setEditing('new')}>
          Add campus
        </Button>
        {error && (
          <p role="alert" className="flex items-center gap-1 font-body-sm text-body-sm text-error">
            <Icon name="error" size={14} />
            {error}
          </p>
        )}
      </div>
    </SetupStepShell>
  );
}
