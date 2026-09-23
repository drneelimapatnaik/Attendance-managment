/**
 * Settings › Data & privacy: export every record for this tenant as JSON
 * (portability / backups) and reset the demo tenant (confirmed first).
 */
import { useState } from 'react';
import type { DataSnapshot } from '@/types/domain';
import { Button, ConfirmDialog, Icon } from '@/components/ui';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { downloadBlob } from '@/lib/export';
import { today } from '@/lib/date';
import { formatNumber } from '@/lib/format';
import { SettingsSection } from '../components/SettingsSection';

/** The persisted data slice of the store — everything, minus actions. */
function snapshot(): DataSnapshot {
  const s = useDataStore.getState();
  return {
    settings: s.settings,
    staff: s.staff,
    subjects: s.subjects,
    topics: s.topics,
    batches: s.batches,
    students: s.students,
    coverage: s.coverage,
    sessions: s.sessions,
    invoices: s.invoices,
    payments: s.payments,
    assessments: s.assessments,
    // App logins are exported without credentials or invite tokens.
    portalAccounts: s.portalAccounts.map(({ password: _password, token: _token, ...rest }) => rest),
    notifications: s.notifications,
    activity: s.activity,
  };
}

export function DataPrivacySection() {
  const settings = useSettings();
  const counts = {
    students: useDataStore((s) => s.students.length),
    sessions: useDataStore((s) => s.sessions.length),
    invoices: useDataStore((s) => s.invoices.length),
    payments: useDataStore((s) => s.payments.length),
  };
  const resetDemoData = useDataStore((s) => s.resetDemoData);
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);
  const fmt = (n: number) => formatNumber(n, settings.currency.locale);

  const exportAll = () => {
    const data = snapshot();
    const body = JSON.stringify({ format: 'edutrack-export', version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
    downloadBlob(body, `${settings.instituteCode.toLowerCase()}-edutrack-export-${today()}.json`, 'application/json');
    toast({ title: 'Export ready', description: 'Contains personal data — store the file securely.' });
  };

  const reset = () => {
    resetDemoData();
    setConfirmReset(false);
    toast({ title: 'Demo data restored', description: 'Every screen now shows the original demo institute.' });
  };

  return (
    <SettingsSection id="data" icon="shield" title="Data & privacy" description="Your data belongs to you — take a full copy any time.">
      <div className="flex flex-col gap-space-md">
        <div className="flex flex-col gap-space-sm rounded-xl border border-outline-variant/40 p-space-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-label-lg text-label-lg text-on-surface">Export all data</p>
            <p className="font-body-sm text-body-sm text-secondary">
              One JSON file with settings, staff, {fmt(counts.students)} students, {fmt(counts.sessions)} class sessions,{' '}
              {fmt(counts.invoices)} invoices and {fmt(counts.payments)} payments.
            </p>
          </div>
          <Button variant="tonal" icon="download" onClick={exportAll} className="shrink-0">
            Export JSON
          </Button>
        </div>

        <div className="flex flex-col gap-space-sm rounded-xl border border-error/30 bg-error-container/20 p-space-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-space-xs">
            <Icon name="restart_alt" className="mt-px text-error" />
            <div>
              <p className="font-label-lg text-label-lg text-on-surface">Reset demo data</p>
              <p className="font-body-sm text-body-sm text-secondary">
                Replaces everything on this device with the original demo institute. Changes you made are lost.
              </p>
            </div>
          </div>
          <Button variant="danger-soft" icon="restart_alt" onClick={() => setConfirmReset(true)} className="shrink-0">
            Reset demo data
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={reset}
        title="Reset demo data?"
        confirmLabel="Reset everything"
        message={
          <>
            All students, attendance, fees, staff and settings on this device are replaced with the demo institute. Consider{' '}
            <strong className="text-on-surface">exporting</strong> first — this can’t be undone.
          </>
        }
      />
    </SettingsSection>
  );
}
