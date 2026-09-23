/**
 * Student profile header card: identity (avatar, name, status and app-access
 * badges, ID · card · grade, batches), guardian contact with tap-to-call,
 * SMS and WhatsApp, and the actions the signed-in role may take — edit,
 * record payment, print ID card, change status, send the app invite.
 */
import { useState } from 'react';
import type { PortalAccess, Student, StudentStatus } from '@/types/domain';
import type { StudentFeeSummary } from '@/domain/fees';
import { Avatar, Badge, Button, Card, Icon, IconButton, Menu, buttonClasses, type BadgeTone, type MenuItem } from '@/components/ui';
import { BatchTags, StudentStatusBadge } from '@/components/domain';
import { useCan, useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast, useUiStore } from '@/store/uiStore';
import { telHref } from '@/lib/format';
import { IdCardsModal } from '../IdCardsModal';

const PORTAL: Record<PortalAccess, { tone: BadgeTone; icon: string; label: string }> = {
  Active: { tone: 'success', icon: 'smartphone', label: 'App active' },
  Invited: { tone: 'info', icon: 'mark_email_unread', label: 'App invite sent' },
  'Not Invited': { tone: 'neutral', icon: 'phonelink_off', label: 'No app access' },
};

const STATUS_ACTIONS: { status: StudentStatus; label: string; icon: string; note: string }[] = [
  { status: 'Active', label: 'Mark active', icon: 'check_circle', note: 'Back on roll calls and monthly billing.' },
  { status: 'On Leave', label: 'Mark on leave', icon: 'beach_access', note: 'Their seat is kept while they are away.' },
  { status: 'Inactive', label: 'Mark inactive', icon: 'archive', note: 'Removed from roll calls — their seat is now free.' },
];

/** wa.me wants the number as bare digits, country code included. */
const whatsappHref = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;
const smsHref = (phone: string) => `sms:${phone.replace(/[^\d+]/g, '')}`;

interface ProfileHeaderProps {
  student: Student;
  fee: StudentFeeSummary;
}

export function ProfileHeader({ student: s, fee }: ProfileHeaderProps) {
  const can = useCan();
  const toast = useToast();
  const settings = useSettings();
  const openModal = useUiStore((st) => st.openModal);
  const setStudentsStatus = useDataStore((st) => st.setStudentsStatus);
  const updateStudent = useDataStore((st) => st.updateStudent);
  const [idCardOpen, setIdCardOpen] = useState(false);

  const campus = settings.campuses.length > 1 ? settings.campuses.find((c) => c.id === s.campusId) : undefined;
  const portal = PORTAL[s.portalAccess];

  const setStatus = (next: StudentStatus) => {
    if (next === s.status) return;
    const previous = s.status;
    const action = STATUS_ACTIONS.find((a) => a.status === next)!;
    setStudentsStatus([s.id], next);
    toast({
      title: `${s.name} is now ${next.toLowerCase()}`,
      description: action.note,
      action: { label: 'Undo', onClick: () => setStudentsStatus([s.id], previous) },
    });
  };

  const sendInvite = () => {
    updateStudent(s.id, { portalAccess: 'Invited' });
    toast({
      title: `App invite sent to ${s.guardian.name}`,
      description: `Download link and login code sent by SMS to ${s.guardian.phone}.`,
      tone: 'info',
    });
  };

  const menuItems: MenuItem[] = can('students.manage')
    ? [
        ...STATUS_ACTIONS.map<MenuItem>((a) => ({
          label: a.label,
          icon: a.icon,
          checked: s.status === a.status,
          onSelect: () => setStatus(a.status),
        })),
        {
          label: s.portalAccess === 'Invited' ? 'Resend app invite' : 'Send app invite',
          icon: 'send_to_mobile',
          separator: true,
          disabled: s.portalAccess === 'Active',
          description: s.portalAccess === 'Active' ? 'The family already uses the app' : `SMS to ${s.guardian.phone}`,
          onSelect: sendInvite,
        },
      ]
    : [];

  return (
    <Card className="flex flex-col gap-space-md md:p-space-lg">
      <div className="flex flex-col gap-space-md lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-space-md">
          <Avatar name={s.name} src={s.photoUrl} size="xl" dimmed={s.status === 'Inactive'} />
          <div className="flex min-w-0 flex-col gap-space-xs">
            <h1 className="break-words font-headline-lg text-headline-lg-mobile tracking-tight text-on-surface md:text-headline-lg">
              {s.name}
            </h1>
            <div className="flex flex-wrap items-center gap-space-xs">
              <StudentStatusBadge status={s.status} />
              <Badge tone={portal.tone} icon={portal.icon}>
                {portal.label}
              </Badge>
            </div>
            <p className="font-body-md text-body-md text-secondary">
              <span className="font-semibold text-on-surface tnum">{s.id}</span>
              <span className="tnum"> · Card #{s.cardNo}</span> · {s.grade} – {s.section}
              {campus && <> · {campus.name}</>}
            </p>
            <BatchTags batchIds={s.batchIds} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-space-xs lg:max-w-[50%] lg:justify-end">
          {can('students.manage') && (
            <Button variant="tonal" icon="edit" onClick={() => openModal({ type: 'student-form', studentId: s.id })}>
              Edit
            </Button>
          )}
          <Button variant="tonal" icon="badge" onClick={() => setIdCardOpen(true)}>
            Print ID card
          </Button>
          {can('fees.collect') && (
            <Button
              icon="payments"
              variant={fee.outstanding > 0 ? 'primary' : 'tonal'}
              onClick={() => openModal({ type: 'record-payment', studentId: s.id })}
            >
              Record Payment
            </Button>
          )}
          {menuItems.length > 0 && (
            <Menu
              width="w-64"
              items={menuItems}
              header={
                <p className="border-b border-outline-variant/30 px-space-sm py-space-xs font-label-sm text-label-sm uppercase tracking-wider text-secondary">
                  Enrolment status
                </p>
              }
              trigger={(props) => <IconButton {...props} icon="more_vert" label="More actions" className="bg-surface-container" />}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-space-sm rounded-xl bg-surface-container-low p-space-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-space-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-lowest text-primary">
            <Icon name="family_restroom" />
          </span>
          <div className="min-w-0">
            <p className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">{s.guardian.relation} · Guardian</p>
            <p className="truncate font-label-lg text-label-lg text-on-surface">{s.guardian.name}</p>
            <p className="truncate font-body-sm text-body-sm text-secondary">
              <span className="tnum">{s.guardian.phone}</span>
              {s.guardian.email && <> · {s.guardian.email}</>}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-space-xs sm:flex">
          <a href={telHref(s.guardian.phone)} aria-label={`Call ${s.guardian.name}`} className={buttonClasses({ variant: 'secondary' })}>
            <Icon name="call" size={18} />
            Call
          </a>
          <a href={smsHref(s.guardian.phone)} aria-label={`Text ${s.guardian.name}`} className={buttonClasses({ variant: 'secondary' })}>
            <Icon name="sms" size={18} />
            SMS
          </a>
          <a
            href={whatsappHref(s.guardian.phone)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp ${s.guardian.name} (opens in a new tab)`}
            className={buttonClasses({ variant: 'secondary' })}
          >
            <Icon name="chat" size={18} />
            WhatsApp
          </a>
        </div>
      </div>

      <IdCardsModal open={idCardOpen} onClose={() => setIdCardOpen(false)} students={[s]} />
    </Card>
  );
}
