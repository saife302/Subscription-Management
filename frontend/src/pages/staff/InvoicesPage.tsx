import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { formatPaise, getTodayIST, formatDate } from '../../utils/format';

export const InvoicesPage: React.FC = () => {
  const { user } = useAuth();
  const canConfirm = user?.role === 'admin' || user?.role === 'staff';
  const canExecuteBilling = user?.role === 'admin' || user?.role === 'staff';

  const [invoices, setInvoices] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    statusCounts: {},
  });
  const [tab, setTab] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Billing Run Modal
  const [billingOpen, setBillingOpen] = useState(false);
  const [asOfDate, setAsOfDate] = useState(getTodayIST());
  const [billingResult, setBillingResult] = useState<any | null>(null);
  const [lastRun, setLastRun] = useState<any | null>(null);
  const [runningBilling, setRunningBilling] = useState(false);

  const loadInvoices = useCallback(
    async (page = 1) => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        if (tab === 'overdue') {
          params.set('overdue', 'true');
        } else if (tab) {
          params.set('status', tab);
        }
        if (search) params.set('search', search);
        const res = await apiRequest(`/invoices?${params.toString()}`);
        setInvoices(res.data || []);
        setMeta(
          res.meta || { page: 1, limit: 20, total: 0, totalPages: 1, statusCounts: {} }
        );
        setSelectedIds([]);
      } catch (err: any) {
        setError(err.message);
      }
    },
    [tab, search]
  );

  useEffect(() => {
    loadInvoices(1);
    apiRequest('/billing/last-run')
      .then((res) => setLastRun(res.data))
      .catch(() => {});
  }, [loadInvoices]);

  const handleBulkAction = async (action: 'confirm' | 'send') => {
    if (selectedIds.length === 0) return;
    setError(null);
    setMsg(null);
    try {
      const res = await apiRequest(`/invoices/bulk/${action}`, {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds }),
      });
      const sCount = res.data?.succeeded?.length || 0;
      const fCount = res.data?.failed?.length || 0;
      setMsg(
        `Bulk ${action}: ${sCount} succeeded${fCount > 0 ? `, ${fCount} skipped/failed` : ''}.`
      );
      loadInvoices(meta.page);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRunBilling = async (dryRun: boolean) => {
    setRunningBilling(true);
    setError(null);
    try {
      const res = await apiRequest('/billing/run', {
        method: 'POST',
        body: JSON.stringify({ asOfDate, dryRun }),
      });
      setBillingResult(res.data);
      if (!dryRun) {
        setLastRun(res.data);
        setMsg(
          `Billing run completed for ${asOfDate}: created ${res.data.created} draft invoices.`
        );
        loadInvoices(1);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunningBilling(false);
    }
  };

  const counts = meta.statusCounts || {};
  const totalAll =
    (counts.draft || 0) +
    (counts.confirmed || 0) +
    (counts.paid || 0) +
    (counts.cancelled || 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices & Billing Run</h1>
          <p className="page-subtitle">
            Automated recurring billing engine, draft confirmation, and overdue tracking
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {selectedIds.length > 0 && (
            <>
              {canConfirm && (
                <button
                  className="btn btn-secondary"
                  onClick={() => handleBulkAction('confirm')}
                >
                  ✓ Confirm Selected ({selectedIds.length})
                </button>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => handleBulkAction('send')}
              >
                Send Selected ({selectedIds.length})
              </button>
            </>
          )}
          <button
            className="btn btn-primary"
            onClick={() => {
              setBillingResult(null);
              setBillingOpen(true);
              handleRunBilling(true);
            }}
          >
            ⚡ Run Billing Dialog
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      {lastRun && (
        <div
          className="alert alert-info"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <div>
            <strong>Last Billing Run:</strong> asOfDate{' '}
            <span className="mono">{lastRun.asOfDate}</span> • Created{' '}
            <strong>{lastRun.created}</strong> invoices • Activated{' '}
            <strong>{lastRun.lifecycle?.activated || 0}</strong> subscriptions
          </div>
          <span style={{ fontSize: '12px' }}>{formatDate(lastRun.finishedAt)}</span>
        </div>
      )}

      <div className="card">
        <div className="tabs-bar">
          {[
            { key: '', label: 'All', count: totalAll },
            { key: 'draft', label: 'Draft', count: counts.draft || 0 },
            { key: 'confirmed', label: 'Confirmed', count: counts.confirmed || 0 },
            { key: 'overdue', label: 'Overdue', count: counts.overdue || 0 },
            { key: 'paid', label: 'Paid', count: counts.paid || 0 },
            { key: 'cancelled', label: 'Cancelled', count: counts.cancelled || 0 },
          ].map((t) => (
            <button
              key={t.key}
              className={`tab-btn ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label} <span className="tab-count">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="filter-bar">
          <input
            type="text"
            className="form-input"
            style={{ maxWidth: '280px' }}
            placeholder="Search INV/2026/... or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '36px' }}>
                  <input
                    type="checkbox"
                    checked={
                      invoices.length > 0 && selectedIds.length === invoices.length
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(invoices.map((i) => i.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                  />
                </th>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Subscription</th>
                <th>Invoice Date</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Total</th>
                <th>Balance</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(inv.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds([...selectedIds, inv.id]);
                        } else {
                          setSelectedIds(selectedIds.filter((id) => id !== inv.id));
                        }
                      }}
                    />
                  </td>
                  <td className="mono" style={{ fontWeight: 600 }}>
                    <Link
                      to={`/staff/invoices/${inv.id}`}
                      style={{ color: 'var(--primary)', textDecoration: 'none' }}
                    >
                      {inv.number}
                    </Link>
                  </td>
                  <td style={{ fontWeight: 500 }}>{inv.customer?.name}</td>
                  <td className="mono">
                    {inv.subscription ? (
                      <Link
                        to={`/staff/subscriptions/${inv.subscription.id}`}
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {inv.subscription.number}
                      </Link>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="mono">{inv.invoiceDate}</td>
                  <td className="mono">
                    {inv.dueDate}
                    {inv.isOverdue && (
                      <span
                        className="badge badge-danger"
                        style={{ marginLeft: '6px' }}
                      >
                        {inv.daysOverdue}d overdue
                      </span>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="mono" style={{ fontWeight: 600 }}>
                    {formatPaise(inv.total)}
                  </td>
                  <td
                    className="mono"
                    style={{
                      color:
                        inv.balance > 0 ? 'var(--warning)' : 'var(--success)',
                      fontWeight: 600,
                    }}
                  >
                    {formatPaise(inv.balance)}
                  </td>
                  <td>
                    <Link
                      to={`/staff/invoices/${inv.id}`}
                      className="btn btn-secondary btn-sm"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          onPageChange={(p) => loadInvoices(p)}
        />
      </div>

      {/* Run Billing Dialog */}
      <Modal
        open={billingOpen}
        title="Run Billing Engine (/billing/run)"
        onClose={() => setBillingOpen(false)}
      >
        <p style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: '13px' }}>
          The billing engine applies automatic subscription lifecycle transitions first, then catches up due billing periods one by one inside database transactions.
        </p>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '16px' }}>
          <div className="form-group" style={{ margin: 0, flex: 1 }}>
            <label className="form-label">As Of Date (IST)</label>
            <input
              type="date"
              className="form-input"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={runningBilling}
            onClick={() => handleRunBilling(true)}
          >
            Preview (dryRun: true)
          </button>
          {canExecuteBilling && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={runningBilling}
              onClick={() => handleRunBilling(false)}
            >
              Execute Run (dryRun: false)
            </button>
          )}
        </div>

        {billingResult && (
          <div
            style={{
              background: 'var(--surface-muted)',
              padding: '16px',
              borderRadius: '8px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <strong>
                {billingResult.dryRun ? 'Dry-Run Preview Result' : 'Executed Run Result'}
              </strong>
              <span className="mono">{billingResult.asOfDate}</span>
            </div>

            <div className="kpi-grid" style={{ marginBottom: 0 }}>
              <div className="kpi-card" style={{ padding: '12px' }}>
                <div className="kpi-label">Due Subscriptions</div>
                <div className="kpi-value">{billingResult.dueSubscriptions}</div>
              </div>
              <div className="kpi-card" style={{ padding: '12px' }}>
                <div className="kpi-label">
                  {billingResult.dryRun ? 'Would Create' : 'Created Invoices'}
                </div>
                <div className="kpi-value" style={{ color: 'var(--primary)' }}>
                  {billingResult.created}
                </div>
              </div>
              <div className="kpi-card" style={{ padding: '12px' }}>
                <div className="kpi-label">Lifecycle Changes</div>
                <div style={{ fontSize: '12px', marginTop: '6px' }}>
                  Activated: <strong>{billingResult.lifecycle?.activated || 0}</strong> •
                  Expired Quotes:{' '}
                  <strong>{billingResult.lifecycle?.quotationsExpired || 0}</strong> •
                  Auto-Closed: <strong>{billingResult.lifecycle?.autoClosed || 0}</strong>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
