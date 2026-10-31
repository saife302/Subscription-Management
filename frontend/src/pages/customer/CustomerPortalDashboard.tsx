import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import { formatPaise, formatDate } from '../../utils/format';
import { StatusBadge } from '../../components/StatusBadge';

export const CustomerPortalDashboard: React.FC = () => {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const sumRes = await apiRequest('/portal/summary');
      setSummary(sumRes.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load portal summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleQuoteAction = async (id: string, action: 'accept' | 'reject') => {
    setError('');
    setActionMsg('');
    try {
      await apiRequest(`/portal/subscriptions/${id}/${action}`, { method: 'POST' });
      setActionMsg(
        action === 'accept'
          ? 'Quotation accepted! Your subscription is now confirmed.'
          : 'Quotation declined.'
      );
      loadData();
    } catch (err: any) {
      setError(err.message || 'Action failed');
    }
  };

  if (loading) return <div className="empty-state">Loading your SubNex portal...</div>;

  const pendingQuotations: any[] = Array.isArray(summary?.pendingQuotations)
    ? summary.pendingQuotations
    : [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Welcome to SubNex Portal</h1>
          <p className="page-subtitle">
            Manage your subscriptions, review quotations, and download GST invoices
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {actionMsg && <div className="alert alert-success">{actionMsg}</div>}

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Active Subscriptions</div>
          <div className="kpi-value">{summary?.activeSubscriptions ?? 0}</div>
          <div className="kpi-sub">
            <Link to="/portal/subscriptions">Manage subscriptions →</Link>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Pending Quotations</div>
          <div
            className="kpi-value"
            style={{ color: pendingQuotations.length > 0 ? 'var(--warning)' : undefined }}
          >
            {pendingQuotations.length}
          </div>
          <div className="kpi-sub">Awaiting your review</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Outstanding Balance</div>
          <div
            className="kpi-value mono"
            style={{
              color: (summary?.outstandingAmount ?? 0) > 0 ? 'var(--danger)' : 'var(--success)',
            }}
          >
            {formatPaise(summary?.outstandingAmount ?? 0)}
          </div>
          <div className="kpi-sub">{summary?.overdueCount ?? 0} overdue invoice(s)</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Next Scheduled Billing</div>
          <div className="kpi-value mono" style={{ fontSize: 18 }}>
            {summary?.nextInvoice ? formatPaise(summary.nextInvoice.amount) : 'No upcoming billing'}
          </div>
          <div className="kpi-sub">
            {summary?.nextInvoice
              ? `${summary.nextInvoice.subscriptionNumber} • ${formatDate(summary.nextInvoice.date)}`
              : 'All caught up'}
          </div>
        </div>
      </div>

      {pendingQuotations.length > 0 && (
        <div className="card" style={{ marginBottom: 24, borderColor: '#fde68a' }}>
          <div className="card-header" style={{ background: '#fffbeb' }}>
            <h3 className="card-title" style={{ color: '#b45309' }}>
              Pending Quotations — Action Required
            </h3>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Subscription #</th>
                  <th>Plan</th>
                  <th>Recurring Total</th>
                  <th>Valid Until</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingQuotations.map((q) => (
                  <tr key={q.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      <Link to={`/portal/subscriptions?id=${q.id}`}>{q.number}</Link>
                    </td>
                    <td>{q.plan?.name || 'Subscription Plan'}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {formatPaise(q.recurringTotal)}
                    </td>
                    <td>{formatDate(q.quotationValidUntil)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleQuoteAction(q.id, 'accept')}
                        >
                          Accept Quotation
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleQuoteAction(q.id, 'reject')}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Quick Links</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Link
              to="/portal/subscriptions"
              className="btn btn-secondary"
              style={{ justifyContent: 'space-between' }}
            >
              <span>View My Subscriptions & Quotations</span>
              <span>→</span>
            </Link>
            <Link
              to="/portal/invoices"
              className="btn btn-secondary"
              style={{ justifyContent: 'space-between' }}
            >
              <span>View & Print Tax Invoices</span>
              <span>→</span>
            </Link>
            <Link
              to="/portal/profile"
              className="btn btn-secondary"
              style={{ justifyContent: 'space-between' }}
            >
              <span>Update Profile & Password</span>
              <span>→</span>
            </Link>
          </div>
        </div>

        {summary?.nextInvoice && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Next Scheduled Renewal Invoice</h3>
              <StatusBadge status="active" />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Subscription</span>
                <strong className="mono">{summary.nextInvoice.subscriptionNumber}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Billing Date</span>
                <strong>{formatDate(summary.nextInvoice.date)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Recurring Amount</span>
                <strong className="mono" style={{ fontSize: 18, color: 'var(--primary)' }}>
                  {formatPaise(summary.nextInvoice.amount)}
                </strong>
              </div>
              <Link to="/portal/subscriptions" className="btn btn-primary btn-sm">
                View Subscription Details
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
