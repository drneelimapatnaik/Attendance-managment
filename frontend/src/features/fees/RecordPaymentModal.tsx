/**
 * Record a fee payment. Opened globally via
 * `openModal({ type: 'record-payment', studentId?, invoiceId? })`.
 *
 * Flow: pick a student (searchable, students with dues first) → tick the
 * unpaid invoices being settled → amount, method, reference, date → save.
 *
 * A smaller (partial) amount is allocated oldest-invoice-first across the
 * selection; each invoice it touches gets its own payment and receipt number
 * (that is how the ledger links money to invoices). After saving, the dialog
 * turns into the printable receipt, and the toast links to it on /fees.
 */
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ID, Payment, PaymentMethod } from '@/types/domain';
import { Badge, Button, Checkbox, EmptyState, Icon, Modal, SegmentedControl, TextField, type Segment } from '@/components/ui';
import { FeeStatusBadge, PersonCell } from '@/components/domain';
import { useCan, useFeeIndex, useLookups, useMoney } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast, useUiStore } from '@/store/uiStore';
import { feeSummaryFor, type InvoiceView, type StudentFeeSummary } from '@/domain/fees';
import { formatDate, formatPeriod, today } from '@/lib/date';
import { cn } from '@/lib/cn';
import { PaymentStudentPicker } from './components/PaymentStudentPicker';
import { ReceiptView } from './ReceiptModal';

export interface RecordPaymentModalProps {
  open: boolean;
  onClose: () => void;
  studentId?: string;
  invoiceId?: string;
}

type Errors = Partial<Record<'student' | 'invoices' | 'amount' | 'reference' | 'date', string>>;

const METHOD_SEGMENTS: Segment<PaymentMethod>[] = [
  { value: 'Cash', label: 'Cash', icon: 'payments' },
  { value: 'UPI', label: 'UPI', icon: 'qr_code_2' },
  { value: 'Card', label: 'Card', icon: 'credit_card' },
  { value: 'Bank Transfer', label: 'Bank', icon: 'account_balance', ariaLabel: 'Bank transfer' },
  { value: 'Cheque', label: 'Cheque', icon: 'receipt' },
];

const REFERENCE: Record<PaymentMethod, { label: string; placeholder: string }> = {
  Cash: { label: 'Reference / note', placeholder: 'Optional' },
  UPI: { label: 'UPI transaction ID', placeholder: 'e.g. 405321897765' },
  Card: { label: 'Card approval code', placeholder: 'Approval code or last 4 digits' },
  'Bank Transfer': { label: 'UTR / transaction reference', placeholder: 'e.g. HDFCN52026091234' },
  Cheque: { label: 'Cheque number & bank', placeholder: 'e.g. 100245 · SBI' },
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const sumBalance = (views: InvoiceView[]) => round2(views.reduce((s, v) => s + v.balance, 0));

/** Unpaid invoices, oldest first — the order a partial payment settles them. */
function unpaidOf(summary: StudentFeeSummary): InvoiceView[] {
  return summary.invoices
    .filter((v) => v.balance > 0)
    .sort((a, b) => a.invoice.issuedOn.localeCompare(b.invoice.issuedOn) || a.invoice.id.localeCompare(b.invoice.id));
}

/** Preselect the requested invoice, else everything overdue, else everything unpaid. */
function defaultSelection(unpaid: InvoiceView[], invoiceId?: ID): Set<ID> {
  if (invoiceId && unpaid.some((v) => v.invoice.id === invoiceId)) return new Set([invoiceId]);
  const overdue = unpaid.filter((v) => v.status === 'Overdue');
  return new Set((overdue.length ? overdue : unpaid).map((v) => v.invoice.id));
}

/** Split `amount` across `invoices` in order, never exceeding an invoice's balance. */
function allocate(amount: number, invoices: InvoiceView[]): { view: InvoiceView; amount: number }[] {
  let remaining = round2(amount);
  const out: { view: InvoiceView; amount: number }[] = [];
  for (const view of invoices) {
    if (remaining <= 0) break;
    const take = round2(Math.min(remaining, view.balance));
    out.push({ view, amount: take });
    remaining = round2(remaining - take);
  }
  return out;
}

function SectionTitle({ icon, children, trailing }: { icon: string; children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="mb-space-sm flex items-center justify-between gap-space-xs">
      <h3 className="flex items-center gap-space-2xs font-label-sm text-label-sm uppercase tracking-wider text-secondary">
        <Icon name={icon} size={16} className="text-primary" />
        {children}
      </h3>
      {trailing}
    </div>
  );
}

export default function RecordPaymentModal({ open, onClose, studentId, invoiceId }: RecordPaymentModalProps) {
  const can = useCan();
  const navigate = useNavigate();
  const toast = useToast();
  const closeModal = useUiStore((s) => s.closeModal);
  const money = useMoney();
  const feeIndex = useFeeIndex();
  const lookups = useLookups();
  const recordPayment = useDataStore((s) => s.recordPayment);
  const presetInvoice = useDataStore((s) => (invoiceId ? s.invoices.find((i) => i.id === invoiceId) : undefined));
  const presetStudentId = studentId ?? presetInvoice?.studentId ?? '';

  // Selection + amount for a student, recomputed whenever the student changes.
  const selectionFor = (sid: ID, invId?: ID) => {
    const unpaid = unpaidOf(feeSummaryFor(feeIndex, sid));
    const selected = defaultSelection(unpaid, invId);
    return { selected, amount: String(sumBalance(unpaid.filter((v) => selected.has(v.invoice.id)))) };
  };

  const [initial] = useState(() => selectionFor(presetStudentId, invoiceId));
  const [studentLocked, setStudentLocked] = useState(!!presetStudentId);
  const [selectedStudentId, setSelectedStudentId] = useState<ID>(presetStudentId);
  const [selected, setSelected] = useState<Set<ID>>(initial.selected);
  const [amount, setAmount] = useState(initial.amount);
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(today());
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState<Payment[] | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const referenceRef = useRef<HTMLInputElement>(null);

  const student = lookups.student.get(selectedStudentId);
  const summary = feeSummaryFor(feeIndex, selectedStudentId);
  const unpaid = useMemo(() => unpaidOf(summary), [summary]);
  const chosen = unpaid.filter((v) => selected.has(v.invoice.id));
  const selectedTotal = sumBalance(chosen);
  const amountNum = Number(amount);
  const validAmount = amount.trim() !== '' && Number.isFinite(amountNum) && amountNum > 0;
  const allocation = validAmount ? allocate(Math.min(amountNum, selectedTotal), chosen) : [];
  const allocated = new Map(allocation.map((a) => [a.view.invoice.id, a.amount]));
  const payingNow = round2(allocation.reduce((s, a) => s + a.amount, 0));

  const pickStudent = (id: ID) => {
    const next = selectionFor(id);
    setSelectedStudentId(id);
    setSelected(next.selected);
    setAmount(next.amount);
    setErrors({});
  };

  // Changing the invoice selection resets the amount to the new total.
  const applySelection = (next: Set<ID>) => {
    setSelected(next);
    setAmount(String(sumBalance(unpaid.filter((v) => next.has(v.invoice.id)))));
    setErrors((e) => ({ ...e, invoices: undefined, amount: undefined }));
  };
  const toggleInvoice = (id: ID) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    applySelection(next);
  };
  const toggleAll = () => applySelection(selected.size === unpaid.length ? new Set() : new Set(unpaid.map((v) => v.invoice.id)));

  const validate = (): Errors => {
    const e: Errors = {};
    if (!student) e.student = 'Choose the student who is paying.';
    else if (!chosen.length) e.invoices = 'Select at least one invoice to settle.';
    if (!validAmount) e.amount = 'Enter an amount greater than zero.';
    else if (amountNum > selectedTotal + 0.001) e.amount = `Cannot exceed the selected balance of ${money.format(selectedTotal)}.`;
    else if (round2(amountNum) !== amountNum) e.amount = 'Use at most two decimal places.';
    if (method !== 'Cash' && reference.trim().length < 3) e.reference = `Enter the ${REFERENCE[method].label.toLowerCase()}.`;
    if (!date) e.date = 'Payment date is required.';
    else if (date > today()) e.date = 'Payment date cannot be in the future.';
    return e;
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length || !student) {
      // Bring the first invalid field into view (the form scrolls inside the sheet on phones).
      (errs.amount ? amountRef : errs.date ? dateRef : errs.reference ? referenceRef : null)?.current?.focus();
      return;
    }
    const created = allocation.map((a) =>
      recordPayment({ invoiceId: a.view.invoice.id, amount: a.amount, method, date, reference: reference.trim() || undefined }),
    );
    const receiptNos = created.map((p) => p.receiptNo);
    setDone(created);
    toast({
      title: `Payment recorded · ${receiptNos[0]}${receiptNos.length > 1 ? ` +${receiptNos.length - 1}` : ''}`,
      description: `${money.format(payingNow)} from ${student.name} via ${method}`,
      action: {
        label: 'View receipt',
        onClick: () => {
          closeModal();
          navigate(`/fees?tab=payments&receipt=${encodeURIComponent(receiptNos.join(','))}`);
        },
      },
    });
  };

  // "Record another": same student if they still owe, otherwise back to the picker.
  const recordAnother = () => {
    const stillOwes = feeSummaryFor(feeIndex, selectedStudentId).outstanding > 0;
    setDone(null);
    setStudentLocked(false);
    setReference('');
    pickStudent(stillOwes ? selectedStudentId : '');
  };

  if (!can('fees.collect')) {
    return (
      <Modal open={open} onClose={onClose} size="sm" title="Record Payment">
        <EmptyState
          compact
          icon="lock"
          title="You can't collect fees"
          description="Your role doesn't include fee collection. Ask an administrator or accountant."
        />
      </Modal>
    );
  }

  if (done) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        icon={
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-container text-on-success-container">
            <Icon name="check_circle" filled />
          </span>
        }
        title="Payment recorded"
        description={`${money.format(done.reduce((s, p) => s + p.amount, 0))} · ${done.length} receipt${done.length === 1 ? '' : 's'} issued`}
        footer={
          <>
            <Button variant="secondary" icon="add" onClick={recordAnother}>
              Record another
            </Button>
            <Button variant="tonal" icon="print" onClick={() => window.print()}>
              Print receipt
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        }
      >
        <ReceiptView payments={done} />
      </Modal>
    );
  }

  const allSelected = unpaid.length > 0 && selected.size === unpaid.length;
  const refCopy = REFERENCE[method];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Record Payment"
      description={student ? `${student.name} · ${student.id}` : 'Collect a fee payment and issue a receipt.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="record-payment-form" icon="payments" disabled={!student || !unpaid.length}>
            {payingNow > 0 ? `Record ${money.format(payingNow)}` : 'Record payment'}
          </Button>
        </>
      }
    >
      <form id="record-payment-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-space-lg">
        <section>
          <SectionTitle icon="person_search">Student</SectionTitle>
          {student ? (
            <div className="flex items-center gap-space-sm rounded-lg bg-surface-container-low p-space-sm">
              <div className="min-w-0 flex-1">
                <PersonCell
                  name={student.name}
                  photoUrl={student.photoUrl}
                  subtitle={`${student.id} · ${student.guardian.name} · ${student.guardian.phone}`}
                />
              </div>
              <div className="hidden shrink-0 text-right sm:block">
                <span className="block font-label-sm text-label-sm uppercase tracking-wider text-secondary">Outstanding</span>
                <span className="font-title-md text-title-md text-on-surface tnum">{money.format(summary.outstanding)}</span>
              </div>
              {!studentLocked && (
                <Button size="sm" variant="ghost" icon="swap_horiz" onClick={() => pickStudent('')}>
                  Change
                </Button>
              )}
            </div>
          ) : (
            <PaymentStudentPicker onPick={pickStudent} error={errors.student} />
          )}
        </section>

        {student && (
          <section>
            <SectionTitle
              icon="receipt_long"
              trailing={
                unpaid.length > 1 && (
                  <Checkbox
                    checked={allSelected}
                    indeterminate={selected.size > 0 && !allSelected}
                    onChange={toggleAll}
                    label={<span className="font-label-md text-label-md">Select all</span>}
                  />
                )
              }
            >
              Invoices to settle
            </SectionTitle>
            {unpaid.length === 0 ? (
              <p className="flex items-center gap-space-xs rounded-lg bg-success-container p-space-sm font-body-md text-body-md text-on-success-container">
                <Icon name="check_circle" size={18} />
                No unpaid invoices — {student.name} is fully paid up.
              </p>
            ) : (
              <ul className="flex flex-col gap-space-xs">
                {unpaid.map((v) => {
                  const inv = v.invoice;
                  const checked = selected.has(inv.id);
                  const applied = allocated.get(inv.id);
                  return (
                    <li key={inv.id}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-start gap-space-sm rounded-lg border p-space-sm transition-colors',
                          checked
                            ? 'border-primary-container bg-primary-fixed/40'
                            : 'border-outline-variant/50 hover:bg-surface-container-low',
                        )}
                      >
                        <Checkbox className="mt-0.5" checked={checked} onChange={() => toggleInvoice(inv.id)} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-space-sm">
                            <span className="min-w-0 font-label-lg text-label-lg text-on-surface">
                              {formatPeriod(inv.period)} · {lookups.batch.get(inv.batchId)?.name ?? 'Batch'}
                            </span>
                            <span className="shrink-0 font-title-md text-title-md text-on-surface tnum">{money.format(v.balance)}</span>
                          </span>
                          <span className="block font-body-sm text-body-sm text-secondary">
                            {inv.id} · due {formatDate(inv.dueDate)}
                            {v.paid > 0 && ` · ${money.format(v.paid)} of ${money.format(inv.amount)} paid`}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-space-xs">
                            <FeeStatusBadge status={v.status} />
                            {v.daysOverdue > 0 && (
                              <span className="font-label-sm text-label-sm text-error">{v.daysOverdue} days overdue</span>
                            )}
                            {checked && applied !== undefined && applied < v.balance && (
                              <Badge tone="warning" icon="call_split">
                                Part payment {money.format(applied)}
                              </Badge>
                            )}
                            {checked && validAmount && applied === undefined && <Badge tone="neutral">Not covered by this amount</Badge>}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {errors.invoices && (
              <p className="mt-1 flex items-center gap-1 font-body-sm text-body-sm text-error">
                <Icon name="error" size={14} />
                {errors.invoices}
              </p>
            )}
          </section>
        )}

        {student && unpaid.length > 0 && (
          <section>
            <SectionTitle icon="payments">Payment</SectionTitle>
            <div className="grid gap-space-sm sm:grid-cols-2">
              <TextField
                ref={amountRef}
                label={`Amount (${money.symbol})`}
                required
                type="number"
                inputMode="decimal"
                min={0}
                max={selectedTotal}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                error={errors.amount}
                hint={
                  validAmount && amountNum < selectedTotal
                    ? 'Partial payment — applied to the oldest selected invoice first.'
                    : `Selected balance ${money.format(selectedTotal)}`
                }
                className="tnum"
              />
              <TextField
                ref={dateRef}
                label="Payment date"
                type="date"
                required
                max={today()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                error={errors.date}
              />
              <div className="sm:col-span-2">
                <span className="label">Payment method</span>
                <SegmentedControl<PaymentMethod>
                  ariaLabel="Payment method"
                  value={method}
                  onChange={(m) => {
                    setMethod(m);
                    setErrors((e) => ({ ...e, reference: undefined }));
                  }}
                  segments={METHOD_SEGMENTS}
                  className="grid w-full grid-cols-3 sm:grid-cols-5"
                />
              </div>
              <TextField
                ref={referenceRef}
                label={refCopy.label}
                required={method !== 'Cash'}
                placeholder={refCopy.placeholder}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                error={errors.reference}
                autoComplete="off"
                containerClassName="sm:col-span-2"
              />
            </div>
            <dl className="mt-space-sm grid grid-cols-3 gap-space-xs rounded-lg bg-surface-container-low p-space-sm">
              {[
                { label: 'Selected', value: selectedTotal },
                { label: 'Paying now', value: payingNow },
                { label: 'Due after', value: Math.max(0, round2(summary.outstanding - payingNow)) },
              ].map((x) => (
                <div key={x.label} className="min-w-0">
                  <dt className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">{x.label}</dt>
                  <dd className="truncate font-title-md text-title-md text-on-surface tnum">{money.format(x.value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </form>
    </Modal>
  );
}
