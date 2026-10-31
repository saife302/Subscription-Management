import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import {
  formatPaise,
  rupeesToPaise,
  paiseToRupeesInput,
  getTodayIST,
} from '../../utils/format';

export const PaymentsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [payments, setPayments] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    totalAmount: 0,
  });
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Record payment modal
  const [recordOpen, setRecordOpen] = useState(false);
  const [confirmedInvoices, setConfirmedInvoices] = useState<any[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [amountRupees, setAmountRupees] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [paymentDate, setPaymentDate] = useState(getTodayIST());
  const [note, setNote] = useState('');

  // Reverse payment modal (Admin only)
  const [reverseTarget, setReverseTarget] = useState<any | null>(null);
  const [reverseReason, setReverseReason] = useState('Recorded on wrong invoice');

  const loadPayments = useCallback(
    async (page = 1) => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        if (search) params.set('search', search);
        if (methodFilter) params.set('method', methodFilter);
        const res = await apiRequest(`/payments?${params.toString()}`);
        setPayments(res.data || []);
        setMeta(
          res.meta || {
            page: 1,
            limit: 20,
            total: 0,
            totalPages: 1,
            totalAmount: 0,
          }
        );
      } catch (err: any) {
        setError(err.message);
      }
    },
    [search, methodFilter]
  );

  useEffect(() => {
    loadPayments(1);
  }, [loadPayments]);

  const openRecordModal = async () => {
    setError(null);
    try {
      const res = await apiRequest('/invoices?status=confirmed&limit=100');
      const unpaid = (res.data || []).filter((i: any) => i.balance > 0);
      setConfirmedInvoices(unpaid);
      if (unpaid.length > 0) {
        setSelectedInvoiceId(unpaid[0].id);
        setAmountRupees(paiseToRupeesInput(unpaid[0].balance));
      }
      setRecordOpen(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/payments', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: selectedInvoiceId,
          method,
          amount: rupeesToPaise(amountRupees),
          paymentDate,
          note,
        }),
      });
      setRecordOpen(false);
      setNote('');
      setMsg('Payment recorded and invoice balance updated.');
      loadPayments(1);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReversePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reverseTarget) return;
    setError(null);
    try {
      await apiRequest(`/payments/${reverseTarget.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: reverseReason }),
      });
      setReverseTarget(null);
      setMsg('Payment reversed and invoice balance restored.');
      loadPayments(meta.page);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">
            Record full or partial payments against confirmed invoices
          </p>
        </div>
        <button className="btn btn-primary" onClick={openRecordModal}>
          + Record Payment
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      <div className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div className="filter-bar" style={{ marginBottom: 0 }}>
            <input
              type="text"
              className="form-input"
              style={{ maxWidth: '260px' }}
              placeholder="Search invoice # or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="form-select"
              style={{ maxWidth: '180px' }}
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
            >
              <option value="">All Methods</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div
            style={{
              padding: '8px 14px',
              background: 'var(--success-soft)',
              borderRadius: '8px',
              color: 'var(--success)',
              fontWeight: 700,
            }}
          >
            Total Matching Payments:{' '}
            <span className="mono">{formatPaise(meta.totalAmount)}</span>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Payment Date</th>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Note / UTR</th>
                <th>Recorded By</th>
                {isAdmin && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.paymentDate}</td>
                  <td className="mono" style={{ fontWeight: 600 }}>
                    <Link
                      to={`/staff/invoices/${p.invoice?.id}`}
                      style={{ color: 'var(--primary)', textDecoration: 'none' }}
                    >
                      {p.invoice?.number}
                    </Link>
                  </td>
                  <td>{p.customer?.name}</td>
                  <td style={{ textTransform: 'uppercase', fontSize: '12px' }}>
                    {p.method}
                  </td>
                  <td className="mono" style={{ fontWeight: 700, color: 'var(--success)' }}>
                    {formatPaise(p.amount)}
                  </td>
                  <td>{p.note || '-'}</td>
                  <td>{p.recordedBy?.name || 'Staff'}</td>
                  {isAdmin && (
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => setReverseTarget(p)}
                      >
                        Reverse
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          onPageChange={(p) => loadPayments(p)}
        />
      </div>

      {/* Record Payment Modal */}
      <Modal
        open={recordOpen}
        title="Record Payment"
        onClose={() => setRecordOpen(false)}
      >
        <form onSubmit={handleRecordPayment}>
          <div className="form-group">
            <label className="form-label">Select Confirmed Invoice *</label>
            <select
              className="form-select"
              required
              value={selectedInvoiceId}
              onChange={(e) => {
                setSelectedInvoiceId(e.target.value);
                const inv = confirmedInvoices.find((x) => x.id === e.target.value);
                if (inv) {
                  setAmountRupees(paiseToRupeesInput(inv.balance));
                }
              }}
            >
              {confirmedInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.number} - {inv.customer?.name} (Balance: {formatPaise(inv.balance)})
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                className="form-input mono"
                required
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Method *</label>
              <select
                className="form-select"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="bank_transfer">Bank Transfer</option>
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
              <label className="form-label">Payment Date *</label>
              <input
                type="date"
                className="form-input"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Note / UTR</label>
              <input
                type="text"
                className="form-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setRecordOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Record Payment
            </button>
          </div>
        </form>
      </Modal>

      {/* Reverse Payment Modal */}
      <Modal
        open={Boolean(reverseTarget)}
        title="Reverse Payment (Admin Only)"
        onClose={() => setReverseTarget(null)}
      >
        <form onSubmit={handleReversePayment}>
          <p>
            Reverse payment of <strong>{formatPaise(reverseTarget?.amount)}</strong> on invoice{' '}
            <strong>{reverseTarget?.invoice?.number}</strong>? If the invoice was Paid, it will return to Confirmed status.
          </p>
          <div className="form-group">
            <label className="form-label">Reason *</label>
            <input
              type="text"
              className="form-input"
              required
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setReverseTarget(null)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-danger">
              Confirm Reversal
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
