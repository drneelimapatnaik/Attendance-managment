/**
 * "Print ID Cards" — previews CR80-proportioned cards for the chosen students
 * and prints them (only `.print-area` is printed; see styles/index.css).
 */
import type { Student } from '@/types/domain';
import { Avatar, Button, Modal } from '@/components/ui';
import { useLookups, useSettings } from '@/hooks/useTenant';
import { formatDate } from '@/lib/date';

interface IdCardsModalProps {
  open: boolean;
  onClose: () => void;
  students: Student[];
}

export function IdCardsModal({ open, onClose, students }: IdCardsModalProps) {
  const settings = useSettings();
  const { batch } = useLookups();
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Print ID Cards"
      description={`${students.length} card${students.length === 1 ? '' : 's'} · valid for Academic Year ${settings.academicYear}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button icon="print" onClick={() => window.print()} disabled={!students.length}>
            Print cards
          </Button>
        </>
      }
    >
      <div className="print-area grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-3">
        {students.map((s) => (
          <div
            key={s.id}
            className="break-inside-avoid overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest"
            style={{ aspectRatio: '85.6 / 54' }}
          >
            <div className="flex items-center justify-between bg-primary px-3 py-1.5 text-on-primary">
              <span className="truncate font-label-md text-label-md">{settings.name}</span>
              <span className="font-label-sm text-label-sm opacity-80">{settings.academicYear}</span>
            </div>
            <div className="flex gap-3 p-3">
              <Avatar name={s.name} src={s.photoUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-title-md text-title-md text-on-surface">{s.name}</p>
                <p className="font-body-sm text-body-sm text-secondary">
                  {s.grade} · {s.section}
                </p>
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                  {s.batchIds
                    .map((id) => batch.get(id)?.name)
                    .filter(Boolean)
                    .join(', ')}
                </p>
                <p className="font-body-sm text-body-sm text-secondary">DOB {formatDate(s.dob)}</p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-outline-variant/40 px-3 py-1.5">
              <span className="font-label-md text-label-md text-primary tnum">{s.id}</span>
              <span className="font-label-sm text-label-sm text-secondary tnum">Card #{s.cardNo}</span>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
