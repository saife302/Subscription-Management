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
          ? 'Quotation accepted. Your subscription is now confirmed.'
          : 'Quotation declined.'
      );
      loadData();
    } catch (err: any) {
      setError(err.message || 'Action failed');
    }
  };

  if (loading) return <div className="empty-state">Loading account overview...</div>;

  const pendingQuotations: any[] = Array.isArray(summary?.pendingQuotations)
    ? summary.pendingQuotations
    : [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Account Overview</h1>
          <p className="page-subtitle">
            Manage your active subscriptions, review quotations, and pay GST invoices
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
            <Link to="/portal/subscriptions">View subscriptions</Link>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Open Quotations</div>
          <div
            className="kpi-value"
            style={{ color: pendingQuotations.length > 0 ? 'var(--warning)' : undefined }}
          >
            {pendingQuotations.length}
          </div>
          <div className="kpi-sub">Awaiting approval</div>
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
          <div className="kpi-sub">
            {(summary?.outstandingAmount ?? 0) > 0 ? (
              <Link to="/portal/invoices">Pay open invoices ({summary?.overdueCount ?? 0} overdue)</Link>
            ) : (
              'All invoices paid'
            )}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Next Scheduled Renewal</div>
          <div className="kpi-value mono" style={{ fontSize: 18 }}>
            {summary?.nextInvoice ? formatPaise(summary.nextInvoice.amount) : 'None scheduled'}
          </div>
          <div className="kpi-sub">
            {summary?.nextInvoice
              ? `${summary.nextInvoice.subscriptionNumber} on ${formatDate(summary.nextInvoice.date)}`
              : 'No upcoming renewal'}
          </div>
        </div>
      </div>

      {pendingQuotations.length > 0 && (
        <div className="card" style={{ marginBottom: 24, borderColor: '#fde68a' }}>
          <div className="card-header" style={{ background: '#fffbeb', margin: '-20px -20px 16px', padding: '12px 20px', borderBottom: '1px solid #fde68a', borderRadius: '8px 8px 0 0' }}>
            <h3 className="card-title" style={{ color: '#b45309' }}>
              Quotations Requiring Approval
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
                          Decline
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
            <h3 className="card-title">Billing Shortcuts</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link
              to="/portal/invoices"
              className="btn btn-secondary"
              style={{ justifyContent: 'space-between' }}
            >
              <span>Pay Open Invoices &amp; Download Tax Receipts</span>
              <span>View</span>
            </Link>
            <Link
              to="/portal/subscriptions"
              className="btn btn-secondary"
              style={{ justifyContent: 'space-between' }}
            >
              <span>Review Active Subscriptions &amp; Quotations</span>
              <span>View</span>
            </Link>
            <Link
              to="/portal/profile"
              className="btn btn-secondary"
              style={{ justifyContent: 'space-between' }}
            >
              <span>Manage Billing Profile &amp; Password</span>
              <span>Edit</span>
            </Link>
          </div>
        </div>

        {summary?.nextInvoice && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Next Scheduled Billing</h3>
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
                <strong className="mono" style={{ fontSize: 18 }}>
                  {formatPaise(summary.nextInvoice.amount)}
                </strong>
              </div>
              <Link to="/portal/subscriptions" className="btn btn-secondary btn-sm">
                View Subscription Details
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
