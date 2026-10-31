import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';
import { formatPaise, formatDate } from '../../utils/format';

export const SubscriptionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [sub, setSub] = useState<any | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Edit Lines modal
  const [editOpen, setEditOpen] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editLines, setEditLines] = useState<any[]>([]);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    try {
      const res = await apiRequest(`/subscriptions/${id}`);
      setSub(res.data);
    } catch (err: any) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    loadDetail();
    apiRequest('/products?limit=100')
      .then((res) => setProducts(res.data || []))
      .catch(() => {});
  }, [loadDetail]);

  const runAction = async (action: string) => {
    if (!sub) return;
    setBusy(true);
    setError(null);
    setActionMsg(null);
    try {
      if (action === 'delete') {
        await apiRequest(`/subscriptions/${sub.id}`, { method: 'DELETE' });
        navigate('/staff/subscriptions');
        return;
      }
      if (action === 'createInvoice') {
        const res = await apiRequest(`/subscriptions/${sub.id}/invoices`, {
          method: 'POST',
        });
        setActionMsg(`Created invoice ${res.data.number}`);
        await loadDetail();
        return;
      }
      const res = await apiRequest(`/subscriptions/${sub.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setSub(res.data);
      setActionMsg(`Action "${action}" completed.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openEditModal = () => {
    if (!sub) return;
    setEditNotes(sub.notes || '');
    setEditLines(
      (sub.lines || []).map((l: any) => ({
        id: l.id,
        productId: l.productId,
        variantId: l.variantId || '',
        quantity: l.quantity,
      }))
    );
    setEditOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sub) return;
    setError(null);
    try {
      const res = await apiRequest(`/subscriptions/${sub.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          notes: editNotes,
          lines: editLines.map((l) => ({
            ...(l.id ? { id: l.id } : {}),
            productId: l.productId,
            variantId: l.variantId || null,
            quantity: Number(l.quantity),
          })),
        }),
      });
      setSub(res.data);
      setEditOpen(false);
      setActionMsg('Subscription updated.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!sub) {
    return (
      <div className="card">
        {error ? <div className="alert alert-error">{error}</div> : 'Loading subscription...'}
      </div>
    );
  }

  const allowed: string[] = sub.allowedActions || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Link
              to="/staff/subscriptions"
              style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}
            >
              ← Subscriptions
            </Link>
            <h1 className="page-title mono">{sub.number}</h1>
            <StatusBadge status={sub.status} />
            {sub.isExpired && <StatusBadge status="expired" label="Past Expiry" />}
          </div>
          <p className="page-subtitle">
            Customer: <strong>{sub.customer?.name}</strong> ({sub.customer?.email}) • Plan:{' '}
            <strong>{sub.plan?.name}</strong> ({sub.plan?.billingPeriod})
          </p>
        </div>

        {/* Dynamic Action Buttons strictly from allowedActions */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {allowed.includes('edit') && (
            <button className="btn btn-secondary" onClick={openEditModal}>
              ✎ Edit Lines / Notes
            </button>
          )}
          {allowed.includes('send') && (
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => runAction('send')}
            >
              Send Quotation
            </button>
          )}
          {allowed.includes('confirm') && (
            <button
              className="btn btn-success"
              disabled={busy}
              onClick={() => runAction('confirm')}
            >
              ✓ Confirm Quotation
            </button>
          )}
          {allowed.includes('activate') && (
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => runAction('activate')}
            >
              ⚡ Activate Now
            </button>
          )}
          {allowed.includes('createInvoice') && (
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => runAction('createInvoice')}
            >
              🧾 Create Invoice Now
            </button>
          )}
          {allowed.includes('pause') && (
            <button
              className="btn btn-warning"
              disabled={busy}
              onClick={() => runAction('pause')}
            >
              ⏸ Pause
            </button>
          )}
          {allowed.includes('resume') && (
            <button
              className="btn btn-success"
              disabled={busy}
              onClick={() => runAction('resume')}
            >
              ▶ Resume
            </button>
          )}
          {allowed.includes('renew') && (
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => runAction('renew')}
            >
              ↻ Renew (+1 Term)
            </button>
          )}
          {allowed.includes('close') && (
            <button
              className="btn btn-danger"
              disabled={busy}
              onClick={() => runAction('close')}
            >
              ✕ Close Subscription
            </button>
          )}
          {allowed.includes('cancel') && (
            <button
              className="btn btn-danger"
              disabled={busy}
              onClick={() => runAction('cancel')}
            >
              Cancel Deal
            </button>
          )}
          {allowed.includes('delete') && (
            <button
              className="btn btn-danger"
              disabled={busy}
              onClick={() => runAction('delete')}
            >
              Delete Draft
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {actionMsg && <div className="alert alert-success">{actionMsg}</div>}

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Contract Period</div>
          <div className="kpi-value mono" style={{ fontSize: '16px' }}>
            {sub.startDate} → {sub.expiryDate}
          </div>
          <div className="kpi-sub">
            Payment Terms: {sub.paymentTermDays} days
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Next Invoice Date</div>
          <div className="kpi-value mono" style={{ fontSize: '18px' }}>
            {sub.nextInvoiceDate || '-'}
          </div>
          <div className="kpi-sub">
            Quotation Valid Until: {sub.quotationValidUntil || '-'}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Recurring Total (incl. GST)</div>
          <div className="kpi-value mono">{formatPaise(sub.totals?.total)}</div>
          <div className="kpi-sub">
            Net before tax: <span className="mono">{formatPaise(sub.recurringNet)}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Invoices Summary</div>
          <div className="kpi-value mono">{sub.invoiceSummary?.count || 0} Invoices</div>
          <div className="kpi-sub">
            Outstanding: <span className="mono">{formatPaise(sub.invoiceSummary?.outstandingAmount)}</span>
            {sub.invoiceSummary?.lastInvoice && (
              <>
                {' '}
                •{' '}
                <Link to={`/staff/invoices/${sub.invoiceSummary.lastInvoice.id}`}>
                  {sub.invoiceSummary.lastInvoice.number}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Priced Lines Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Priced Subscription Lines</h3>
          {sub.orderDiscount && (
            <span className="badge badge-success">
              Order Discount: {sub.orderDiscount.name} (-
              {formatPaise(sub.orderDiscount.amount)})
            </span>
          )}
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product & Variant</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Subtotal</th>
                <th>Line Discount</th>
                <th>Order Discount Share</th>
                <th>Taxes</th>
                <th>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {(sub.lines || []).map((l: any) => (
                <tr key={l.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{l.productName}</div>
                    {l.variantLabel && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {l.variantLabel}
                      </div>
                    )}
                  </td>
                  <td className="mono">{l.quantity}</td>
                  <td className="mono">{formatPaise(l.unitPrice)}</td>
                  <td className="mono">{formatPaise(l.subtotal)}</td>
                  <td className="mono" style={{ color: 'var(--success)' }}>
                    {l.discount
                      ? `-${formatPaise(l.discount.amount)} (${l.discount.name})`
                      : '-'}
                  </td>
                  <td className="mono" style={{ color: 'var(--success)' }}>
                    {l.orderDiscountShare > 0
                      ? `-${formatPaise(l.orderDiscountShare)}`
                      : '-'}
                  </td>
                  <td>
                    {(l.taxes || []).map((tx: any) => (
                      <div key={tx.taxId} style={{ fontSize: '12px' }}>
                        {tx.name}: <span className="mono">{formatPaise(tx.amount)}</span>
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
            gap: '24px',
            marginTop: '16px',
            paddingTop: '14px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <div>
            Untaxed Subtotal:{' '}
            <strong className="mono">{formatPaise(sub.totals?.untaxedAmount)}</strong>
          </div>
          <div style={{ color: 'var(--success)' }}>
            Total Discounts:{' '}
            <strong className="mono">-{formatPaise(sub.totals?.discountTotal)}</strong>
          </div>
          <div>
            Total Tax: <strong className="mono">{formatPaise(sub.totals?.taxTotal)}</strong>
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--primary)' }}>
            Total: <span className="mono">{formatPaise(sub.totals?.total)}</span>
          </div>
        </div>
      </div>

      {/* Audit History */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '12px' }}>
          Audit History (Newest First)
        </h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Transition</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {(sub.history || []).map((h: any, idx: number) => (
                <tr key={idx}>
                  <td className="mono" style={{ fontSize: '12px' }}>
                    {formatDate(h.at)}
                  </td>
                  <td>{h.by?.name || 'System'}</td>
                  <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                    {h.action}
                  </td>
                  <td>
                    {h.from || '-'} → <strong>{h.to || '-'}</strong>
                  </td>
                  <td>{h.note || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Lines Modal */}
      <Modal
        open={editOpen}
        title={`Edit Subscription - ${sub.number}`}
        maxWidth="700px"
        onClose={() => setEditOpen(false)}
      >
        <form onSubmit={handleSaveEdit}>
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label className="form-label" style={{ margin: 0 }}>
                Lines (Min Qty for Plan Product: {sub.plan?.minQuantity})
              </label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  setEditLines([
                    ...editLines,
                    { productId: products[0]?.id || '', variantId: '', quantity: 1 },
                  ])
                }
              >
                + Add Line
              </button>
            </div>
            {editLines.map((l, idx) => {
              const prod = products.find((p) => p.id === l.productId);
              return (
                <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <select
                    className="form-select"
                    value={l.productId}
                    onChange={(e) => {
                      const next = [...editLines];
                      next[idx].productId = e.target.value;
                      next[idx].variantId = '';
                      setEditLines(next);
                    }}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="form-select"
                    value={l.variantId}
                    onChange={(e) => {
                      const next = [...editLines];
                      next[idx].variantId = e.target.value;
                      setEditLines(next);
                    }}
                  >
                    <option value="">No Variant</option>
                    {(prod?.variants || []).map((v: any) => (
                      <option key={v.id} value={v.id}>
                        {v.attribute}: {v.value}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    className="form-input mono"
                    style={{ maxWidth: '100px' }}
                    value={l.quantity}
                    onChange={(e) => {
                      const next = [...editLines];
                      next[idx].quantity = Number(e.target.value);
                      setEditLines(next);
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={editLines.length <= 1}
                    onClick={() => setEditLines(editLines.filter((_, i) => i !== idx))}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <input
              type="text"
              className="form-input"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Changes
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
