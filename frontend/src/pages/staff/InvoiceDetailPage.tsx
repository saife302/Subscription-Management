import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';
import {
  formatPaise,
  paiseToRupeesInput,
  rupeesToPaise,
  getTodayIST,
} from '../../utils/format';

export const InvoiceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [inv, setInv] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Record Payment Modal
  const [payOpen, setPayOpen] = useState(false);
  const [payAmountRupees, setPayAmountRupees] = useState('');
  const [payMethod, setPayMethod] = useState('bank_transfer');
  const [payDate, setPayDate] = useState(getTodayIST());
  const [payNote, setPayNote] = useState('');

  // Cancel Invoice Modal
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rebill, setRebill] = useState(true);

  const loadInvoice = useCallback(async () => {
    if (!id) return;
    try {
      const res = await apiRequest(`/invoices/${id}`);
      setInv(res.data);
      setPayAmountRupees(paiseToRupeesInput(res.data.balance));
    } catch (err: any) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    loadInvoice();
  }, [loadInvoice]);

  const handleConfirm = async () => {
    if (!inv) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest(`/invoices/${inv.id}/confirm`, {
        method: 'POST',
      });
      setInv(res.data);
      setMsg('Invoice confirmed and locked.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async () => {
    if (!inv) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest(`/invoices/${inv.id}/send`, {
        method: 'POST',
      });
      setInv(res.data);
      setMsg(`Invoice emailed to ${inv.customerSnapshot?.email || inv.customer?.name}.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inv) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest(`/invoices/${inv.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ rebill }),
      });
      setInv(res.data);
      setCancelOpen(false);
      setMsg('Invoice cancelled and discount usage released.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inv) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest('/payments', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: inv.id,
          method: payMethod,
          amount: rupeesToPaise(payAmountRupees),
          paymentDate: payDate,
          note: payNote,
        }),
      });
      setPayOpen(false);
      setPayNote('');
      setMsg('Payment recorded successfully.');
      await loadInvoice();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!inv) {
    return (
      <div className="card">
        {error ? <div className="alert alert-error">{error}</div> : 'Loading invoice...'}
      </div>
    );
  }

  const allowed: string[] = inv.allowedActions || [];

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Link
              to="/staff/invoices"
              style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}
            >
              ← Invoices
            </Link>
            <h1 className="page-title mono">{inv.number}</h1>
            <StatusBadge status={inv.status} />
            {inv.isOverdue && (
              <StatusBadge status="overdue" label={`${inv.daysOverdue}d Overdue`} />
            )}
          </div>
          <p className="page-subtitle">
            Subscription:{' '}
            <Link to={`/staff/subscriptions/${inv.subscription?.id}`}>
              {inv.subscription?.number}
            </Link>{' '}
            • Period: {inv.periodStart} to {inv.periodEnd}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={() => window.print()}
          >
            🖨 Print Invoice
          </button>
          {allowed.includes('confirm') && (
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={handleConfirm}
            >
              ✓ Confirm Invoice
            </button>
          )}
          {allowed.includes('send') && (
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={handleSend}
            >
              ✉ {inv.sentCount > 0 ? `Resend Email (${inv.sentCount})` : 'Send Email'}
            </button>
          )}
          {allowed.includes('recordPayment') && (
            <button
              className="btn btn-success"
              onClick={() => {
                setPayAmountRupees(paiseToRupeesInput(inv.balance));
                setPayOpen(true);
              }}
            >
              💳 Record Payment
            </button>
          )}
          {allowed.includes('cancel') && (
            <button
              className="btn btn-danger"
              onClick={() => setCancelOpen(true)}
            >
              Cancel Invoice
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error no-print">{error}</div>}
      {msg && <div className="alert alert-success no-print">{msg}</div>}

      {/* Print-Friendly Invoice Document */}
      <div className="card" style={{ padding: '32px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            borderBottom: '2px solid var(--border)',
            paddingBottom: '20px',
            marginBottom: '24px',
          }}
        >
          <div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--primary)' }}>
              SubNex
            </div>
            <div style={{ fontWeight: 600 }}>{inv.company?.name}</div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              {inv.company?.address}
            </div>
            <div className="mono" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              GSTIN: {inv.company?.taxId}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '20px', fontWeight: 700 }} className="mono">
              {inv.number}
            </div>
            <div style={{ marginTop: '4px' }}>
              <StatusBadge status={inv.status} />
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              Invoice Date: <strong className="mono">{inv.invoiceDate}</strong>
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              Due Date: <strong className="mono">{inv.dueDate}</strong>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '24px',
            marginBottom: '24px',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: '4px',
              }}
            >
              Billed To (Customer Snapshot)
            </div>
            <div style={{ fontWeight: 700, fontSize: '15px' }}>
              {inv.customerSnapshot?.name || inv.customer?.name}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {inv.customerSnapshot?.email}
            </div>
            {inv.customerSnapshot?.billingAddress?.line1 && (
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                {inv.customerSnapshot.billingAddress.line1},{' '}
                {inv.customerSnapshot.billingAddress.city}{' '}
                {inv.customerSnapshot.billingAddress.postalCode}
              </div>
            )}
            {inv.customerSnapshot?.taxId && (
              <div className="mono" style={{ fontSize: '12px', marginTop: '2px' }}>
                GSTIN: {inv.customerSnapshot.taxId}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: '4px',
              }}
            >
              Billing Period & Balance
            </div>
            <div style={{ fontSize: '13px' }}>
              Period: <span className="mono">{inv.periodStart}</span> to{' '}
              <span className="mono">{inv.periodEnd}</span>
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '8px' }}>
              Balance Due:{' '}
              <span
                className="mono"
                style={{ color: inv.balance > 0 ? 'var(--danger)' : 'var(--success)' }}
              >
                {formatPaise(inv.balance)}
              </span>
            </div>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Subtotal</th>
                <th>Discount</th>
                <th>GST / Taxes</th>
                <th>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {(inv.lines || []).map((l: any, idx: number) => (
                <tr key={idx}>
                  <td style={{ fontWeight: 600 }}>
                    {l.description ||
                      `${l.productName}${l.variantLabel ? ` · ${l.variantLabel}` : ''}`}
                  </td>
                  <td className="mono">{l.quantity}</td>
                  <td className="mono">{formatPaise(l.unitPrice)}</td>
                  <td className="mono">{formatPaise(l.subtotal)}</td>
                  <td className="mono" style={{ color: 'var(--success)' }}>
                    {l.discount
                      ? `-${formatPaise(l.discount.amount)} (${l.discount.name})`
                      : l.orderDiscountShare > 0
                      ? `-${formatPaise(l.orderDiscountShare)}`
                      : '—'}
                  </td>
                  <td>
                    {(l.taxes || []).map((t: any, i: number) => (
                      <div key={i} style={{ fontSize: '12px' }}>
                        {t.name}: <span className="mono">{formatPaise(t.amount)}</span>
                      </div>
                    ))}
                  </td>
                  <td className="mono" style={{ fontWeight: 700 }}>
                    {formatPaise(l.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '20px',
          }}
        >
          <div style={{ width: '320px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>Untaxed Amount:</span>
              <span className="mono">{formatPaise(inv.untaxedAmount)}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 0',
                color: 'var(--success)',
              }}
            >
              <span>Total Discounts:</span>
              <span className="mono">-{formatPaise(inv.discountTotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>Total GST / Taxes:</span>
              <span className="mono">{formatPaise(inv.taxTotal)}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderTop: '1px solid var(--border)',
                fontWeight: 700,
                fontSize: '15px',
              }}
            >
              <span>Invoice Total:</span>
              <span className="mono">{formatPaise(inv.total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>Amount Paid:</span>
              <span className="mono">{formatPaise(inv.amountPaid)}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderTop: '2px solid var(--text)',
                fontWeight: 700,
                fontSize: '16px',
              }}
            >
              <span>Balance Due:</span>
              <span className="mono">{formatPaise(inv.balance)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payments Recorded on this Invoice */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '12px' }}>
          Payments Recorded ({(inv.payments || []).length})
        </h3>
        {(inv.payments || []).length === 0 ? (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            No payments recorded for this invoice yet.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Payment Date</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Reference / Note</th>
                  <th>Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {inv.payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="mono">{p.paymentDate}</td>
                    <td style={{ textTransform: 'uppercase' }}>{p.method}</td>
                    <td className="mono" style={{ fontWeight: 600, color: 'var(--success)' }}>
                      {formatPaise(p.amount)}
                    </td>
                    <td>{p.note || '—'}</td>
                    <td>{p.recordedBy?.name || 'Staff'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      <Modal
        open={payOpen}
        title={`Record Payment — ${inv.number}`}
        onClose={() => setPayOpen(false)}
      >
        <form onSubmit={handleRecordPayment}>
          <div className="alert alert-info">
            Current Invoice Balance: <strong className="mono">{formatPaise(inv.balance)}</strong>.
            Partial payments are allowed; paying the full balance marks the invoice Paid automatically.
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                className="form-input mono"
                required
                value={payAmountRupees}
                onChange={(e) => setPayAmountRupees(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Method *</label>
              <select
                className="form-select"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
              >
                <option value="bank_transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Payment Date (IST) *</label>
              <input
                type="date"
                className="form-input"
                required
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">UTR / Reference Note</label>
              <input
                type="text"
                className="form-input"
                placeholder="UTR 88213"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPayOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-success" disabled={busy}>
              {busy ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Cancel Invoice Modal */}
      <Modal
        open={cancelOpen}
        title={`Cancel Invoice — ${inv.number}`}
        onClose={() => setCancelOpen(false)}
      >
        <form onSubmit={handleCancel}>
          <p>
            Cancelling this invoice marks it <code>isVoid: true</code> and releases any reserved discount uses.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <input
              type="checkbox"
              checked={rebill}
              onChange={(e) => setRebill(e.target.checked)}
            />
            Move subscription's <code>nextInvoiceDate</code> back to <code>{inv.periodStart}</code> so the next billing run bills this period again
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCancelOpen(false)}
            >
              Back
            </button>
            <button type="submit" className="btn btn-danger" disabled={busy}>
              Confirm Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
