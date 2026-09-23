/**
 * Printable fee receipt.
 *
 * One receipt document can cover several payments made together: a payment
 * split across invoices creates one payment (and receipt number) per invoice,
 * so the document lists each line with its receipt number and totals them.
 *
 * `ReceiptView` is the document itself (reused by RecordPaymentModal's success
 * step); `ReceiptModal` wraps it with Print / Close. Only `.print-area` is
 * printed (styles/index.css), so Print yields a clean receipt page.
 */
import type { ReactNode } from 'react';
import type { Payment } from '@/types/domain';
import { Button, EmptyState, Icon, Modal } from '@/components/ui';
import { useFeeIndex, useLookups, useMoney, useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { feeSummaryFor } from '@/domain/fees';
import { formatDate, formatPeriod, today } from '@/lib/date';
import { amountInWords } from './amountInWords';

function Detail({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">{label}</dt>
      <dd className="mt-0.5 font-label-lg text-label-lg text-on-surface">{children}</dd>
      {sub && <dd className="font-body-sm text-body-sm text-secondary">{sub}</dd>}
    </div>
  );
}

export function ReceiptView({ payments }: { payments: Payment[] }) {
  const settings = useSettings();
  const money = useMoney();
  const lookups = useLookups();
  const invoices = useDataStore((s) => s.invoices);
  const feeIndex = useFeeIndex();
  if (!payments.length) return null;

  const lines = [...payments].sort((a, b) => a.receiptNo.localeCompare(b.receiptNo));
  const first = lines[0];
  const last = lines[lines.length - 1];
  const student = lookups.student.get(first.studentId);
  const campus = settings.campuses.find((c) => c.id === student?.campusId);
  const collector = lookups.staff.get(first.collectedBy);
  const total = lines.reduce((s, p) => s + p.amount, 0);
  const words = amountInWords(total, settings.currency.code);
  // Today's balance is only meaningful on a receipt issued today.
  const balanceToday = first.date === today() ? feeSummaryFor(feeIndex, first.studentId).outstanding : null;

  return (
    <article className="print-area mx-auto w-full max-w-2xl rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-space-md text-on-surface md:p-space-lg">
      <header className="flex flex-col gap-space-sm border-b border-outline-variant/50 pb-space-md sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-space-sm">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-contain" />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary">
              <Icon name="school" />
            </span>
          )}
          <div className="min-w-0">
            <p className="font-title-lg text-title-lg text-on-surface">{settings.name}</p>
            <p className="font-body-sm text-body-sm text-secondary">{campus?.address ?? settings.address}</p>
            <p className="font-body-sm text-body-sm text-secondary">
              {settings.contactPhone} · {settings.contactEmail}
            </p>
          </div>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-primary">Fee receipt</p>
          <p className="font-title-md text-title-md text-on-surface tnum">
            {lines.length === 1 ? first.receiptNo : `${first.receiptNo} – ${last.receiptNo}`}
          </p>
          <p className="font-body-sm text-body-sm text-secondary">Date: {formatDate(first.date)}</p>
        </div>
      </header>

      <dl className="grid gap-space-sm py-space-md sm:grid-cols-2">
        <Detail label="Received from" sub={student ? `${student.id} · ${student.grade} - ${student.section}` : undefined}>
          {student?.name ?? first.studentId}
        </Detail>
        {student && (
          <Detail label="Parent / guardian" sub={student.guardian.phone}>
            {student.guardian.name} ({student.guardian.relation})
          </Detail>
        )}
      </dl>

      <table className="w-full">
        <caption className="sr-only">Receipt lines</caption>
        <thead>
          <tr className="border-b border-outline-variant/50">
            <th scope="col" className="th px-0">
              Description
            </th>
            <th scope="col" className="th px-0 text-right">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((p) => {
            const inv = invoices.find((i) => i.id === p.invoiceId);
            return (
              <tr key={p.id} className="border-b border-outline-variant/30">
                <td className="py-space-xs pr-space-sm align-top">
                  <span className="block font-label-lg text-label-lg text-on-surface">{inv?.description ?? 'Tuition fee'}</span>
                  <span className="font-body-sm text-body-sm text-secondary">
                    {inv ? `${formatPeriod(inv.period)} · ${inv.id}` : p.invoiceId}
                    {lines.length > 1 && ` · ${p.receiptNo}`}
                  </span>
                </td>
                <td className="py-space-xs text-right align-top font-label-lg text-label-lg text-on-surface tnum">
                  {money.format(p.amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="pt-space-sm font-title-md text-title-md text-on-surface">Total received</td>
            <td className="pt-space-sm text-right font-title-md text-title-md text-on-surface tnum">{money.format(total)}</td>
          </tr>
        </tfoot>
      </table>
      {words && (
        <p className="mt-space-sm rounded-lg bg-surface-container-low px-space-sm py-space-xs font-body-md text-body-md text-on-surface">
          <span className="font-label-md text-label-md text-secondary">In words: </span>
          {words}
        </p>
      )}

      <dl className="mt-space-md grid grid-cols-2 gap-space-sm sm:grid-cols-4">
        <Detail label="Payment mode">{first.method}</Detail>
        <Detail label="Reference">{first.reference || '—'}</Detail>
        <Detail label="Collected by">{collector?.name ?? '—'}</Detail>
        {balanceToday != null && <Detail label="Balance due">{money.format(balanceToday)}</Detail>}
      </dl>

      <footer className="mt-space-lg flex flex-col gap-space-md border-t border-dashed border-outline-variant pt-space-md sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-xs font-body-sm text-body-sm text-secondary">
          Computer-generated receipt from {settings.name}. Please keep it for your records.
        </p>
        <div className="text-center">
          <div className="mb-1 h-8 w-40 border-b border-outline" aria-hidden />
          <span className="font-label-sm text-label-sm text-secondary">Authorised signatory</span>
        </div>
      </footer>
    </article>
  );
}

interface ReceiptModalProps {
  open: boolean;
  onClose: () => void;
  payments: Payment[];
}

export function ReceiptModal({ open, onClose, payments }: ReceiptModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Fee receipt"
      description={payments.length > 1 ? `${payments.length} receipts issued together` : payments[0]?.receiptNo}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button icon="print" onClick={() => window.print()} disabled={!payments.length}>
            Print receipt
          </Button>
        </>
      }
    >
      {payments.length ? (
        <ReceiptView payments={payments} />
      ) : (
        <EmptyState
          compact
          icon="receipt_long"
          title="Receipt not found"
          description="It may have been removed, or the link points to a receipt from another institute."
        />
      )}
    </Modal>
  );
}
