/**
 * Profile › Details: every stored personal, guardian, school, address and
 * enrolment field as definition lists — the read-only counterpart of the
 * admission form (StudentFormModal), which the Edit button opens.
 */
import type { ReactNode } from 'react';
import type { Student } from '@/types/domain';
import { Button, Card, CardHeader } from '@/components/ui';
import { BatchTags, StudentStatusBadge } from '@/components/domain';
import { useCan, useLookups, useMoney, useSettings } from '@/hooks/useTenant';
import { useUiStore } from '@/store/uiStore';
import { discountedFee } from '@/domain/fees';
import { ageOn, formatDate, tenureLabel } from '@/lib/date';
import { telHref } from '@/lib/format';
import { cn } from '@/lib/cn';

interface DetailItem {
  label: string;
  value?: ReactNode;
  wide?: boolean;
}

function DefinitionList({ items }: { items: DetailItem[] }) {
  return (
    <dl className="grid gap-x-space-lg gap-y-space-md sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className={cn('min-w-0', i.wide && 'sm:col-span-2')}>
          <dt className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">{i.label}</dt>
          <dd className="mt-0.5 break-words font-body-md text-body-md text-on-surface">
            {i.value === undefined || i.value === '' ? <span className="text-secondary">Not provided</span> : i.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const linkCls = 'text-primary hover:underline';

export function DetailsTab({ student: s }: { student: Student }) {
  const can = useCan();
  const money = useMoney();
  const settings = useSettings();
  const { batch: batchMap } = useLookups();
  const openModal = useUiStore((st) => st.openModal);
  const campus = settings.campuses.find((c) => c.id === s.campusId);
  const monthly = s.batchIds.reduce((sum, id) => {
    const b = batchMap.get(id);
    return b && b.status === 'Active' ? sum + discountedFee(b.monthlyFee, s.concessionPct) : sum;
  }, 0);

  const edit = can('students.manage') ? (
    <Button size="sm" variant="tonal" icon="edit" onClick={() => openModal({ type: 'student-form', studentId: s.id })}>
      Edit
    </Button>
  ) : undefined;

  return (
    <div className="grid gap-space-lg lg:grid-cols-2">
      <Card className="flex flex-col gap-space-md">
        <CardHeader title="Personal" icon="person" actions={edit} />
        <DefinitionList
          items={[
            { label: 'Full name', value: s.name, wide: true },
            { label: 'Student ID', value: <span className="tnum">{s.id}</span> },
            { label: 'ID card number', value: <span className="tnum">{s.cardNo}</span> },
            { label: 'Gender', value: s.gender },
            { label: 'Date of birth', value: `${formatDate(s.dob)} · ${ageOn(s.dob)} yrs` },
            { label: 'Grade', value: s.grade },
            { label: 'Section / stream', value: s.section },
            { label: 'School', value: s.school, wide: true },
            {
              label: 'Student mobile',
              value: s.phone && (
                <a href={telHref(s.phone)} className={linkCls}>
                  {s.phone}
                </a>
              ),
            },
            {
              label: 'Student email',
              value: s.email && (
                <a href={`mailto:${s.email}`} className={linkCls}>
                  {s.email}
                </a>
              ),
            },
          ]}
        />
      </Card>

      <Card className="flex flex-col gap-space-md">
        <CardHeader title="Parent / guardian" icon="family_restroom" />
        <DefinitionList
          items={[
            { label: 'Name', value: s.guardian.name },
            { label: 'Relation', value: s.guardian.relation },
            {
              label: 'Mobile',
              value: (
                <a href={telHref(s.guardian.phone)} className={cn(linkCls, 'tnum')}>
                  {s.guardian.phone}
                </a>
              ),
            },
            {
              label: 'Email',
              value: s.guardian.email && (
                <a href={`mailto:${s.guardian.email}`} className={linkCls}>
                  {s.guardian.email}
                </a>
              ),
            },
            { label: 'Home address', value: s.address && <span className="whitespace-pre-line">{s.address}</span>, wide: true },
          ]}
        />
      </Card>

      <Card className="flex flex-col gap-space-md">
        <CardHeader title="Enrolment" icon="school" />
        <DefinitionList
          items={[
            { label: 'Status', value: <StudentStatusBadge status={s.status} /> },
            { label: 'Campus', value: campus?.name },
            { label: 'Joining date', value: `${formatDate(s.joiningDate)} · ${tenureLabel(s.joiningDate)}` },
            { label: 'App access', value: s.portalAccess },
            { label: 'Batches', value: <BatchTags batchIds={s.batchIds} />, wide: true },
            { label: 'Concession', value: `${s.concessionPct}%` },
            { label: 'Monthly tuition', value: <span className="tnum">{money.format(monthly)}</span> },
          ]}
        />
      </Card>

      <Card className="flex flex-col gap-space-md">
        <CardHeader title="Notes" icon="sticky_note_2" />
        {s.notes ? (
          <p className="whitespace-pre-line font-body-md text-body-md text-on-surface">{s.notes}</p>
        ) : (
          <p className="font-body-md text-body-md text-secondary">
            No notes yet. Medical information, pickup instructions and other remarks added in the admission form appear here.
          </p>
        )}
      </Card>
    </div>
  );
}
