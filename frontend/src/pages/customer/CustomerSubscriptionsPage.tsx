import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import { formatPaise, formatDate, formatBps } from '../../utils/format';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';

export const CustomerSubscriptionsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('id');

  const [items, setItems] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/portal/subscriptions');
      setItems(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: string) => {
    try {
      const res = await apiRequest(`/portal/subscriptions/${id}`);
      setDetail(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load subscription detail');
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

  const handleAction = async (id: string, action: string) => {
    setError('');
    setActionMsg('');
    try {
      await apiRequest(`/portal/subscriptions/${id}/${action}`, { method: 'POST' });
      setActionMsg(`Action '${action}' completed successfully.`);
      await loadList();
      if (selectedId === id) {
        await loadDetail(id);
      }
    } catch (err: any) {
      setError(err.message || 'Action failed');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Subscriptions</h1>
          <p className="page-subtitle">
            View your active plans, quotations, and manage subscription lifecycle
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {actionMsg && <div className="alert alert-success">{actionMsg}</div>}

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Subscription #</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Start Date</th>
                <th>Expiry Date</th>
                <th>Next Invoice</th>
                <th>Recurring Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="empty-state">
                    Loading subscriptions...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-state">
                    No subscriptions found
                  </td>
                </tr>
              ) : (
                items.map((sub) => (
                  <tr key={sub.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {sub.number}
                    </td>
                    <td>{sub.plan?.name || '—'}</td>
                    <td>
                      <StatusBadge status={sub.status} />
                    </td>
                    <td>{formatDate(sub.startDate)}</td>
                    <td>{formatDate(sub.expiryDate)}</td>
                    <td>{formatDate(sub.nextInvoiceDate)}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {formatPaise(sub.recurringTotal)}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setSearchParams({ id: sub.id })}
                      >
                        View Details
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
        title={detail ? `Subscription ${detail.number}` : 'Subscription Details'}
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
                <StatusBadge status={detail.status} />
                {detail.quotationValidUntil && detail.status === 'quotation' && (
                  <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                    Valid until {formatDate(detail.quotationValidUntil)}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(detail.allowedActions || []).map((act: string) => (
                  <button
                    key={act}
                    className={`btn btn-sm ${
                      act === 'accept' || act === 'resume' || act === 'renew'
                        ? 'btn-primary'
                        : act === 'reject' || act === 'close'
                        ? 'btn-danger'
                        : 'btn-secondary'
                    }`}
                    onClick={() => handleAction(detail.id, act)}
                    style={{ textTransform: 'capitalize' }}
                  >
                    {act}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom: 16, fontSize: 13 }}>
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>Plan</div>
                <div style={{ fontWeight: 600 }}>
                  {detail.plan?.name} ({detail.plan?.billingPeriod})
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>Term</div>
                <div style={{ fontWeight: 600 }}>
                  {formatDate(detail.startDate)} → {formatDate(detail.expiryDate)}
                </div>
              </div>
            </div>

            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Tax</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.lines || []).map((l: any) => (
                    <tr key={l.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{l.product?.name}</div>
                        {l.variant?.name && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {l.variant.name}
                          </div>
                        )}
                      </td>
                      <td>{l.quantity}</td>
                      <td className="mono">{formatPaise(l.unitPrice)}</td>
                      <td>{l.tax ? `${l.tax.name} (${formatBps(l.tax.rateBps)})` : '—'}</td>
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
                <span>Recurring Total</span>
                <span className="mono">{formatPaise(detail.totals?.recurringTotal)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
