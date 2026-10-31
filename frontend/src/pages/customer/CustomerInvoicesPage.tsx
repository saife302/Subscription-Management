import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import { formatPaise, formatDate, formatBps } from '../../utils/format';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';

export const CustomerInvoicesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('id');

  const [items, setItems] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/portal/invoices');
      setItems(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: string) => {
    try {
      const res = await apiRequest(`/portal/invoices/${id}`);
      setDetail(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load invoice detail');
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Invoices</h1>
          <p className="page-subtitle">
            View and print your official SubNex tax invoices and payment history
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Status</th>
                <th>Invoice Date</th>
                <th>Due Date</th>
                <th>Grand Total</th>
                <th>Paid</th>
                <th>Balance Due</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="empty-state">
                    Loading invoices...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-state">
                    No invoices found
                  </td>
                </tr>
              ) : (
                items.map((inv) => (
                  <tr key={inv.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {inv.number}
                    </td>
                    <td>
                      <StatusBadge status={inv.status} />
                      {inv.isOverdue && (
                        <span style={{ marginLeft: 6 }}>
                          <StatusBadge status="overdue" />
                        </span>
                      )}
                    </td>
                    <td>{formatDate(inv.invoiceDate)}</td>
                    <td>{formatDate(inv.dueDate)}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {formatPaise(inv.grandTotal)}
                    </td>
                    <td className="mono" style={{ color: 'var(--success)' }}>
                      {formatPaise(inv.amountPaid)}
                    </td>
                    <td
                      className="mono"
                      style={{
                        fontWeight: 600,
                        color: inv.balance > 0 ? 'var(--danger)' : undefined,
                      }}
                    >
                      {formatPaise(inv.balance)}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setSearchParams({ id: inv.id })}
                      >
                        View / Print
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!detail}
        title={detail ? `Tax Invoice ${detail.number}` : 'Invoice'}
        onClose={() => setSearchParams({})}
      >
        {detail && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--primary)' }}>
                  SubNex
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Subscription & Billing Management
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <StatusBadge status={detail.status} />
                <button className="btn btn-sm btn-primary" onClick={() => window.print()}>
                  Print / Save PDF
                </button>
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom: 16, fontSize: 13 }}>
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>Invoice Date</div>
                <div style={{ fontWeight: 600 }}>{formatDate(detail.invoiceDate)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>Due Date</div>
                <div style={{ fontWeight: 600 }}>{formatDate(detail.dueDate)}</div>
              </div>
            </div>

            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Tax</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.lines || []).map((l: any) => (
                    <tr key={l.id}>
                      <td>{l.description}</td>
                      <td>{l.quantity}</td>
                      <td className="mono">{formatPaise(l.unitPrice)}</td>
                      <td>
                        {l.taxSnapshot
                          ? `${l.taxSnapshot.name} (${formatBps(l.taxSnapshot.rateBps)})`
                          : '—'}
                      </td>
                      <td className="mono" style={{ fontWeight: 600 }}>
                        {formatPaise(l.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Subtotal</span>
                <span className="mono">{formatPaise(detail.totals?.subtotal)}</span>
              </div>
              {(detail.totals?.discountTotal ?? 0) > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                    color: 'var(--success)',
                  }}
                >
                  <span>Discount</span>
                  <span className="mono">-{formatPaise(detail.totals?.discountTotal)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Tax Total</span>
                <span className="mono">{formatPaise(detail.totals?.taxTotal)}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 700,
                  fontSize: 15,
                  marginTop: 6,
                }}
              >
                <span>Grand Total</span>
                <span className="mono">{formatPaise(detail.totals?.grandTotal)}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 4,
                  color: 'var(--success)',
                }}
              >
                <span>Amount Paid</span>
                <span className="mono">{formatPaise(detail.totals?.amountPaid)}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 700,
                  marginTop: 4,
                  color: (detail.totals?.balance ?? 0) > 0 ? 'var(--danger)' : undefined,
                }}
              >
                <span>Balance Due</span>
                <span className="mono">{formatPaise(detail.totals?.balance)}</span>
              </div>
            </div>

            {(detail.payments || []).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                  Payments Recorded
                </div>
                {detail.payments.map((p: any) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      padding: '6px 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <span>
                      {formatDate(p.paymentDate)} • {p.method.replace('_', ' ').toUpperCase()}{' '}
                      {p.reference ? `(${p.reference})` : ''}
                    </span>
                    <strong className="mono" style={{ color: 'var(--success)' }}>
                      {formatPaise(p.amount)}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
