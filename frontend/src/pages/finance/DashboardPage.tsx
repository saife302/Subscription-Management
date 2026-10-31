import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, downloadCsvWithAuth } from '../../services/api';
import { formatPaise } from '../../utils/format';
import { StatusBadge } from '../../components/StatusBadge';

export const DashboardPage: React.FC = () => {
  const [summary, setSummary] = useState<any | null>(null);
  const [revByMonth, setRevByMonth] = useState<any[]>([]);
  const [subsByPlan, setSubsByPlan] = useState<any[]>([]);
  const [aging, setAging] = useState<any[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<any[]>([]);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);

  const [plans, setPlans] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    const q = new URLSearchParams();
    if (fromDate) q.set('from', fromDate);
    if (toDate) q.set('to', toDate);
    if (planFilter) q.set('planId', planFilter);
    if (customerFilter) q.set('customerId', customerFilter);

    const qs = q.toString() ? `?${q.toString()}` : '';

    const [sumRes, revRes, planRes, ageRes, ovdRes, payRes] = await Promise.all([
      apiRequest(`/reports/summary${qs}`),
      apiRequest(`/reports/revenue-by-month${qs}`),
      apiRequest(`/reports/subscriptions-by-plan${qs}`),
      apiRequest(`/reports/aging${qs}`),
      apiRequest('/invoices?overdue=true&sort=dueDate&limit=8'),
      apiRequest('/payments?sort=-paymentDate&limit=5'),
    ]);

    setSummary(sumRes.data);
    if (!fromDate && sumRes.data?.range?.from) {
      setFromDate(sumRes.data.range.from);
    }
    if (!toDate && sumRes.data?.range?.to) {
      setToDate(sumRes.data.range.to);
    }
    setRevByMonth(revRes.data || []);
    setSubsByPlan(planRes.data || []);
    setAging(ageRes.data || []);
    setOverdueInvoices(ovdRes.data || []);
    setRecentPayments(payRes.data || []);
  }, [fromDate, toDate, planFilter, customerFilter]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    Promise.all([
      apiRequest('/plans?limit=100'),
      apiRequest('/customers?limit=100'),
    ])
      .then(([pl, cu]) => {
        setPlans(pl.data || []);
        setCustomers(cu.data || []);
      })
      .catch(() => {});
  }, []);

  const handleSendOverdueReminder = async (inv: any) => {
    try {
      await apiRequest(`/invoices/${inv.id}/send`, { method: 'POST' });
      setMsg(`Sent overdue reminder for ${inv.number} to ${inv.customer?.name}`);
    } catch (err: any) {
      setMsg(err.message);
    }
  };

  const maxRev = Math.max(
    1,
    ...revByMonth.map((m) => Math.max(m.invoiced || 0, m.collected || 0))
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">SubNex Financial Dashboard & Reports</h1>
          <p className="page-subtitle">
            Real-time MRR, revenue collection, accounts receivable aging, and CSV exports
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() =>
              downloadCsvWithAuth('/reports/export?type=invoices', 'subnex-invoices.csv')
            }
          >
            Export Invoices CSV
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() =>
              downloadCsvWithAuth('/reports/export?type=payments', 'subnex-payments.csv')
            }
          >
            Export Payments CSV
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() =>
              downloadCsvWithAuth(
                '/reports/export?type=subscriptions',
                'subnex-subscriptions.csv'
              )
            }
          >
            Export Subscriptions CSV
          </button>
        </div>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}

      {/* Shared Report Filters */}
      <div className="card" style={{ padding: '14px 20px' }}>
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '12.5px' }}>Filters:</div>
          <input
            type="date"
            className="form-input"
            style={{ maxWidth: '155px' }}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <span>to</span>
          <input
            type="date"
            className="form-input"
            style={{ maxWidth: '155px' }}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
          <select
            className="form-select"
            style={{ maxWidth: '200px' }}
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
          >
            <option value="">All Plans</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className="form-select"
            style={{ maxWidth: '220px' }}
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
          >
            <option value="">All Customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Number Tiles */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Active Subscriptions</div>
          <div className="kpi-value">{summary?.activeSubscriptions ?? '-'}</div>
          <div className="kpi-sub">
            +{summary?.newSubscriptions ?? 0} new • {summary?.closedSubscriptions ?? 0} closed in period
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Monthly Recurring Revenue (MRR)</div>
          <div className="kpi-value mono">{formatPaise(summary?.mrr)}</div>
          <div className="kpi-sub">Net recurring before GST</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Revenue Collected</div>
          <div className="kpi-value mono" style={{ color: 'var(--success)' }}>
            {formatPaise(summary?.revenueCollected)}
          </div>
          <div className="kpi-sub">
            Invoiced in range: <span className="mono">{formatPaise(summary?.invoicedAmount)}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Outstanding Receivable</div>
          <div className="kpi-value mono">{formatPaise(summary?.outstandingAmount)}</div>
          <div className="kpi-sub" style={{ color: 'var(--danger)', fontWeight: 600 }}>
            Overdue: {formatPaise(summary?.overdueAmount)} ({summary?.overdueCount ?? 0} invoices)
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: '20px',
        }}
      >
        {/* Revenue by Month */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '14px' }}>
            Invoiced vs Collected by Month
          </h3>
          {revByMonth.slice(-6).map((m) => (
            <div key={m.month} style={{ marginBottom: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  marginBottom: '4px',
                }}
              >
                <strong className="mono">{m.month}</strong>
                <span className="mono">
                  Invoiced: {formatPaise(m.invoiced)} • Collected:{' '}
                  <strong style={{ color: 'var(--success)' }}>
                    {formatPaise(m.collected)}
                  </strong>
                </span>
              </div>
              <div
                style={{
                  height: '8px',
                  background: 'var(--surface-muted)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  display: 'flex',
                  gap: '2px',
                }}
              >
                <div
                  style={{
                    width: `${Math.round(((m.invoiced || 0) / maxRev) * 100)}%`,
                    background: 'var(--primary)',
                  }}
                />
              </div>
              <div
                style={{
                  height: '6px',
                  background: 'var(--surface-muted)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  marginTop: '3px',
                }}
              >
                <div
                  style={{
                    width: `${Math.round(((m.collected || 0) / maxRev) * 100)}%`,
                    background: 'var(--success)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Subscriptions by Plan & AR Aging */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card" style={{ marginBottom: 0 }}>
            <h3 className="card-title" style={{ marginBottom: '12px' }}>
              Active Subscriptions & MRR by Plan
            </h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Active Count</th>
                  <th>MRR</th>
                </tr>
              </thead>
              <tbody>
                {subsByPlan.map((sp, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{sp.plan?.name}</td>
                    <td className="mono">{sp.count}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {formatPaise(sp.mrr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginBottom: 0 }}>
            <h3 className="card-title" style={{ marginBottom: '12px' }}>
              Accounts Receivable Aging Buckets
            </h3>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {aging.map((b) => (
                <div
                  key={b.bucket}
                  style={{
                    flex: '1 1 110px',
                    padding: '10px 12px',
                    background: 'var(--surface-muted)',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                    {b.bucket === 'current' ? 'Current (Not Due)' : `${b.bucket} Days Past Due`}
                  </div>
                  <div className="mono" style={{ fontSize: '15px', fontWeight: 700, marginTop: '4px' }}>
                    {formatPaise(b.amount)}
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    {b.count} invoices
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Overdue Invoices & Recent Payments */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
          gap: '20px',
          marginTop: '20px',
        }}
      >
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Overdue Invoices</h3>
            <Link to="/staff/invoices" className="btn btn-secondary btn-sm">
              View All
            </Link>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Due Date</th>
                  <th>Balance</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {overdueInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      <Link to={`/staff/invoices/${inv.id}`}>{inv.number}</Link>
                    </td>
                    <td>{inv.customer?.name}</td>
                    <td>
                      <span className="mono">{inv.dueDate}</span>{' '}
                      <StatusBadge status="overdue" label={`${inv.daysOverdue}d`} />
                    </td>
                    <td className="mono" style={{ fontWeight: 600, color: 'var(--danger)' }}>
                      {formatPaise(inv.balance)}
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleSendOverdueReminder(inv)}
                      >
                        Remind
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recent Payments</h3>
            <Link to="/staff/payments" className="btn btn-secondary btn-sm">
              All Payments
            </Link>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Method</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.paymentDate}</td>
                    <td className="mono">
                      <Link to={`/staff/invoices/${p.invoice?.id}`}>
                        {p.invoice?.number}
                      </Link>
                    </td>
                    <td>{p.customer?.name}</td>
                    <td style={{ textTransform: 'uppercase', fontSize: '12px' }}>
                      {p.method}
                    </td>
                    <td className="mono" style={{ fontWeight: 600, color: 'var(--success)' }}>
                      {formatPaise(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
