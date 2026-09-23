/**
 * Fee Management (/fees).
 *
 * Header actions: Record Payment, Issue Invoices (fees.collect), CSV export of
 * the current tab. Below: KPI tiles + collection charts (FeeOverview), then
 * three URL-addressable tabs — Dues, Invoices, Payments. `?receipt=` opens a
 * printable receipt over any tab (the Record Payment toast links here).
 */
import { useMemo, useState } from 'react';
import { Button, PageHeader, Tabs } from '@/components/ui';
import { useCan, useLookups, useSettings } from '@/hooks/useTenant';
import { useDocumentTitle, useIsMobile } from '@/hooks/ui';
import { useDataStore } from '@/store/dataStore';
import { useUiStore } from '@/store/uiStore';
import { formatPeriod, today } from '@/lib/date';
import { FeeOverview } from './components/FeeOverview';
import { DuesTab } from './components/DuesTab';
import { InvoicesTab } from './components/InvoicesTab';
import { PaymentsTab } from './components/PaymentsTab';
import { IssueInvoicesModal } from './components/IssueInvoicesModal';
import { ReceiptModal } from './ReceiptModal';
import { exportDues, exportInvoices, exportPayments } from './exportFees';
import { useDueRows, useFeeFilters, useInvoiceRows, usePaymentRows, type FeeTab } from './useFees';

export default function FeeManagementPage() {
  useDocumentTitle('Fee Management');
  const can = useCan();
  const settings = useSettings();
  const lookups = useLookups();
  const openModal = useUiStore((s) => s.openModal);
  const allPayments = useDataStore((s) => s.payments);
  const isMobile = useIsMobile();
  const [issueOpen, setIssueOpen] = useState(false);

  const { filters, setFilter, setTab, reset, isFiltered, receipts, openReceipt, closeReceipt } = useFeeFilters();
  const dues = useDueRows(filters);
  const invoices = useInvoiceRows(filters);
  const payments = usePaymentRows(filters);

  // Receipts are looked up tenant-wide so a shared link works whichever campus is selected.
  const receiptKey = receipts.join(',');
  const receiptPayments = useMemo(() => {
    const wanted = new Set(receiptKey.split(',').filter(Boolean));
    return wanted.size ? allPayments.filter((p) => wanted.has(p.receiptNo)) : [];
  }, [allPayments, receiptKey]);

  const currentRows = { dues: dues.rows, invoices: invoices.rows, payments: payments.rows }[filters.tab];
  const exportCurrent = () => {
    if (filters.tab === 'dues') exportDues(dues.rows, lookups.batch, settings.name);
    else if (filters.tab === 'invoices') exportInvoices(invoices.rows, settings.name);
    else exportPayments(payments.rows, settings.name);
  };

  const tabShared = { filters, setFilter, onReset: reset, isFiltered };

  return (
    <div className="flex flex-col gap-space-lg">
      <PageHeader
        eyebrow="Finance"
        title="Fee Management"
        meta={`Billing month: ${formatPeriod(today().slice(0, 7))}`}
        actions={
          <>
            <Button variant="tonal" icon="download" onClick={exportCurrent} disabled={!currentRows.length}>
              Export CSV
            </Button>
            {can('fees.collect') && (
              <>
                <Button variant="tonal" icon="receipt_long" onClick={() => setIssueOpen(true)}>
                  Issue Invoices
                </Button>
                <Button icon="payments" onClick={() => openModal({ type: 'record-payment' })}>
                  Record Payment
                </Button>
              </>
            )}
          </>
        }
      />

      <FeeOverview />

      <Tabs<FeeTab>
        value={filters.tab}
        onChange={setTab}
        ariaLabel="Fee views"
        // Phones drop icons and secondary counts so all three tabs fit without scrolling.
        items={[
          { value: 'dues', label: 'Dues', icon: isMobile ? undefined : 'pending_actions', count: dues.all.length },
          {
            value: 'invoices',
            label: 'Invoices',
            icon: isMobile ? undefined : 'receipt_long',
            count: isMobile ? undefined : invoices.all.length,
          },
          {
            value: 'payments',
            label: 'Payments',
            icon: isMobile ? undefined : 'payments',
            count: isMobile ? undefined : payments.all.length,
          },
        ]}
      />

      {filters.tab === 'dues' && <DuesTab rows={dues.rows} {...tabShared} />}
      {filters.tab === 'invoices' && <InvoicesTab rows={invoices.rows} periods={invoices.periods} {...tabShared} />}
      {filters.tab === 'payments' && (
        <PaymentsTab rows={payments.rows} {...tabShared} onOpenReceipt={(receiptNo) => openReceipt([receiptNo])} />
      )}

      {issueOpen && <IssueInvoicesModal open onClose={() => setIssueOpen(false)} />}
      <ReceiptModal open={receipts.length > 0} onClose={closeReceipt} payments={receiptPayments} />
    </div>
  );
}
