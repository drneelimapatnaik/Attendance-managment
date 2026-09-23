/**
 * Add / edit one campus (name + address) inside the Campuses settings
 * section. Edits go into the section's draft; the section's Save persists.
 */
import { useState, type FormEvent } from 'react';
import type { Campus } from '@/types/domain';
import { Button, Modal, TextArea, TextField } from '@/components/ui';
import { uid } from '@/lib/id';

interface CampusFormModalProps {
  open: boolean;
  onClose: () => void;
  campus?: Campus;
  /** Names already used by other campuses (case-insensitive uniqueness). */
  takenNames: string[];
  onSubmit: (campus: Campus) => void;
}

export function CampusFormModal({ open, onClose, campus, takenNames, onSubmit }: CampusFormModalProps) {
  const [name, setName] = useState(campus?.name ?? '');
  const [address, setAddress] = useState(campus?.address ?? '');
  const [errors, setErrors] = useState<{ name?: string; address?: string }>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // The modal is portalled, but React events still bubble to the section's form.
    e.stopPropagation();
    const next: typeof errors = {};
    const n = name.trim();
    if (n.length < 2) next.name = 'Enter a campus name.';
    else if (takenNames.some((t) => t.toLowerCase() === n.toLowerCase())) next.name = 'Another campus already has this name.';
    if (address.trim().length < 5) next.address = 'Enter the campus address.';
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit({ id: campus?.id ?? uid('cmp'), name: n, address: address.trim() });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={campus ? `Edit ${campus.name}` : 'Add campus'}
      description="Branches share students, staff and settings; each has its own batches."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="campus-form" icon={campus ? 'check' : 'add_business'}>
            {campus ? 'Update campus' : 'Add campus'}
          </Button>
        </>
      }
    >
      <form id="campus-form" noValidate onSubmit={submit} className="flex flex-col gap-space-sm">
        <TextField
          label="Campus name"
          required
          placeholder="e.g. North Branch"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <TextArea label="Address" required rows={3} value={address} onChange={(e) => setAddress(e.target.value)} error={errors.address} />
      </form>
    </Modal>
  );
}
