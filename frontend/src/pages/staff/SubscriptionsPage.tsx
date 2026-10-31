import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { formatPaise, getTodayIST, rupeesToPaise } from '../../utils/format';

export const SubscriptionsPage: React.FC = () => {
  const { user } = useAuth();
  const canCreate = user?.role === 'admin' || user?.role === 'staff';
  const navigate = useNavigate();

  const [subs, setSubs] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    statusCounts: {},
  });
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Catalog & customers for Quote Builder
  const [customers, setCustomers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);

  // Quote Builder Modal
  const [builderOpen, setBuilderOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [planId, setPlanId] = useState('');
  const [startDate, setStartDate] = useState(getTodayIST());
  const [paymentTermDays, setPaymentTermDays] = useState(30);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<
    Array<{
      productId: string;
      variantId: string;
      quantity: number;
      overrideRupees?: string;
    }>
  >([]);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  const loadSubscriptions = useCallback(
    async (page = 1) => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        if (statusFilter) params.set('status', statusFilter);
        if (search) params.set('search', search);
        if (planFilter) params.set('planId', planFilter);
        const res = await apiRequest(`/subscriptions?${params.toString()}`);
        setSubs(res.data || []);
        setMeta(
          res.meta || { page: 1, limit: 20, total: 0, totalPages: 1, statusCounts: {} }
        );
      } catch (err: any) {
        setError(err.message);
      }
    },
    [statusFilter, search, planFilter]
  );

  useEffect(() => {
    loadSubscriptions(1);
  }, [loadSubscriptions]);

  useEffect(() => {
    Promise.all([
      apiRequest('/customers?limit=100'),
      apiRequest('/plans?limit=100'),
      apiRequest('/products?limit=100'),
      apiRequest('/quotation-templates?limit=100'),
    ])
      .then(([cRes, plRes, prRes, tRes]) => {
        setCustomers(cRes.data || []);
        setPlans(plRes.data || []);
        setProducts(prRes.data || []);
        setTemplates(tRes.data || []);
      })
      .catch(() => {});
  }, []);

  // Run live preview whenever builder inputs change
  useEffect(() => {
    if (!builderOpen || !planId || lines.length === 0) return;
    const timer = setTimeout(async () => {
      setPreviewErr(null);
      try {
        const res = await apiRequest('/subscriptions/preview', {
          method: 'POST',
          body: JSON.stringify({
            customerId: customerId || undefined,
            planId,
            startDate,
            lines: lines.map((l) => ({
              productId: l.productId,
              variantId: l.variantId || null,
              quantity: Number(l.quantity) || 1,
              ...(l.overrideRupees && l.overrideRupees.trim() !== ''
                ? { unitPrice: rupeesToPaise(l.overrideRupees) }
                : {}),
            })),
          }),
        });
        setPreviewData(res.data);
      } catch (err: any) {
        setPreviewErr(err.message);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [builderOpen, customerId, planId, startDate, lines]);

  const openQuoteBuilder = () => {
    const firstCust = customers[0];
    const firstPlan = plans[0];
    setCustomerId(firstCust?.id || '');
    setTemplateId('');
    setPlanId(firstPlan?.id || '');
    setStartDate(getTodayIST());
    setPaymentTermDays(30);
    setNotes('');
    if (firstPlan) {
      setLines([
        {
          productId: firstPlan.product?.id || products[0]?.id || '',
          variantId: '',
          quantity: firstPlan.minQuantity || 1,
        },
      ]);
    }
    setBuilderOpen(true);
  };

  const handleSelectTemplate = (tplId: string) => {
    setTemplateId(tplId);
    const tpl = templates.find((t) => t.id === tplId);
    if (tpl) {
      setPlanId(tpl.plan?.id || planId);
      setPaymentTermDays(tpl.paymentTermDays ?? 30);
      setNotes(tpl.notes || '');
      setLines(
        (tpl.lines || []).map((l: any) => ({
          productId: l.productId,
          variantId: l.variantId || '',
          quantity: l.quantity,
        }))
      );
    }
  };

  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    setPreviewErr(null);
    try {
      const res = await apiRequest('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          templateId: templateId || undefined,
          planId,
          startDate,
          paymentTermDays: Number(paymentTermDays),
          notes,
          lines: lines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId || null,
            quantity: Number(l.quantity),
            ...(l.overrideRupees && l.overrideRupees.trim() !== ''
              ? { unitPrice: rupeesToPaise(l.overrideRupees) }
              : {}),
          })),
        }),
      });
      setBuilderOpen(false);
      navigate(`/staff/subscriptions/${res.data.id}`);
    } catch (err: any) {
      setPreviewErr(err.message);
    }
  };

  const counts = meta.statusCounts || {};
  const totalAll = Object.values(counts).reduce(
    (a: number, b: any) => a + Number(b || 0),
    0
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Subscriptions & Quotations</h1>
          <p className="page-subtitle">
            Draft → Quotation → Confirmed → Active → Paused / Closed lifecycle
          </p>
        </div>
        {canCreate && (
          <button className="btn btn-primary" onClick={openQuoteBuilder}>
            + New Subscription / Quotation
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="tabs-bar">
          {[
            { key: '', label: 'All', count: totalAll },
            { key: 'draft', label: 'Draft', count: counts.draft || 0 },
            { key: 'quotation', label: 'Quotation', count: counts.quotation || 0 },
            { key: 'confirmed', label: 'Confirmed', count: counts.confirmed || 0 },
            { key: 'active', label: 'Active', count: counts.active || 0 },
            { key: 'paused', label: 'Paused', count: counts.paused || 0 },
            { key: 'closed', label: 'Closed', count: counts.closed || 0 },
          ].map((t) => (
            <button
              key={t.key}
              className={`tab-btn ${statusFilter === t.key ? 'active' : ''}`}
              onClick={() => setStatusFilter(t.key)}
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
            placeholder="Search SUB/2026/... or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="form-select"
            style={{ maxWidth: '220px' }}
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
          >
            <option value="">All Plans</option>
            {plans.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.name} ({pl.billingPeriod})
              </option>
            ))}
          </select>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Customer</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Start Date</th>
                <th>Expiry Date</th>
                <th>Next Invoice</th>
                <th>Recurring Total</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>
                    <Link
                      to={`/staff/subscriptions/${s.id}`}
                      style={{ color: 'var(--primary)', textDecoration: 'none' }}
                    >
                      {s.number}
                    </Link>
                  </td>
                  <td style={{ fontWeight: 500 }}>{s.customer?.name}</td>
                  <td>
                    {s.plan?.name}{' '}
                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      ({s.plan?.billingPeriod})
                    </span>
                  </td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="mono">{s.startDate}</td>
                  <td className="mono">{s.expiryDate}</td>
                  <td className="mono">{s.nextInvoiceDate || '—'}</td>
                  <td className="mono" style={{ fontWeight: 600 }}>
                    {formatPaise(s.recurringTotal)}
                  </td>
                  <td>
                    <Link
                      to={`/staff/subscriptions/${s.id}`}
                      className="btn btn-secondary btn-sm"
                    >
                      View →
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
          onPageChange={(p) => loadSubscriptions(p)}
        />
      </div>

      {/* Quote Builder Modal with Live Preview */}
      <Modal
        open={builderOpen}
        title="Quote Builder — Create Subscription Draft"
        maxWidth="840px"
        onClose={() => setBuilderOpen(false)}
      >
        {previewErr && <div className="alert alert-error">{previewErr}</div>}

        <form onSubmit={handleCreateSubscription}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Customer *</label>
              <select
                className="form-select"
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Start from Quotation Template</label>
              <select
                className="form-select"
                value={templateId}
                onChange={(e) => handleSelectTemplate(e.target.value)}
              >
                <option value="">— Build from Scratch —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Plan *</label>
              <select
                className="form-select"
                required
                value={planId}
                onChange={(e) => {
                  const nextPlanId = e.target.value;
                  setPlanId(nextPlanId);
                  const pl = plans.find((x) => x.id === nextPlanId);
                  if (pl && lines.length === 0) {
                    setLines([
                      {
                        productId: pl.product?.id || products[0]?.id || '',
                        variantId: '',
                        quantity: pl.minQuantity || 1,
                      },
                    ]);
                  }
                }}
              >
                {plans.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name} ({pl.billingPeriod}, min qty: {pl.minQuantity})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Start Date *</label>
              <input
                type="date"
                className="form-input"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Payment Terms *</label>
              <select
                className="form-select"
                value={paymentTermDays}
                onChange={(e) => setPaymentTermDays(Number(e.target.value))}
              >
                <option value={0}>Immediate (0 days)</option>
                <option value={15}>15 days</option>
                <option value={30}>30 days</option>
                <option value={45}>45 days</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label className="form-label" style={{ margin: 0 }}>
                Subscription Lines
              </label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  setLines([
                    ...lines,
                    { productId: products[0]?.id || '', variantId: '', quantity: 1 },
                  ])
                }
              >
                + Add Product / Add-on Line
              </button>
            </div>

            {lines.map((line, idx) => {
              const prod = products.find((p) => p.id === line.productId);
              return (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1.5fr 90px 130px 40px',
                    gap: '8px',
                    marginBottom: '8px',
                    alignItems: 'center',
                  }}
                >
                  <select
                    className="form-select"
                    value={line.productId}
                    onChange={(e) => {
                      const next = [...lines];
                      next[idx].productId = e.target.value;
                      next[idx].variantId = '';
                      setLines(next);
                    }}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.type})
                      </option>
                    ))}
                  </select>

                  <select
                    className="form-select"
                    value={line.variantId}
                    onChange={(e) => {
                      const next = [...lines];
                      next[idx].variantId = e.target.value;
                      setLines(next);
                    }}
                  >
                    <option value="">Standard / No Variant</option>
                    {(prod?.variants || []).map((v: any) => (
                      <option key={v.id} value={v.id}>
                        {v.attribute}: {v.value} (+{formatPaise(v.extraPrice)})
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min={1}
                    className="form-input mono"
                    placeholder="Qty"
                    value={line.quantity}
                    onChange={(e) => {
                      const next = [...lines];
                      next[idx].quantity = Number(e.target.value);
                      setLines(next);
                    }}
                  />

                  <input
                    type="number"
                    step="0.01"
                    className="form-input mono"
                    placeholder="Override ₹ (opt)"
                    value={line.overrideRupees || ''}
                    onChange={(e) => {
                      const next = [...lines];
                      next[idx].overrideRupees = e.target.value;
                      setLines(next);
                    }}
                  />

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={lines.length <= 1}
                    onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          {/* Live Pricing Engine Preview */}
          {previewData && (
            <div
              style={{
                background: 'var(--surface-muted)',
                borderRadius: '8px',
                padding: '14px',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px' }}>
                Live Pricing Engine Preview (/subscriptions/preview)
              </div>
              <table className="data-table" style={{ background: '#fff' }}>
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Qty × Unit</th>
                    <th>Subtotal</th>
                    <th>Discount</th>
                    <th>Tax</th>
                    <th>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(previewData.lines || []).map((pl: any, i: number) => (
                    <tr key={i}>
                      <td>
                        <strong>{pl.productName}</strong>{' '}
                        {pl.variantLabel ? `• ${pl.variantLabel}` : ''}
                      </td>
                      <td className="mono">
                        {pl.quantity} × {formatPaise(pl.unitPrice)}
                      </td>
                      <td className="mono">{formatPaise(pl.subtotal)}</td>
                      <td className="mono" style={{ color: 'var(--success)' }}>
                        {pl.discount
                          ? `-${formatPaise(pl.discount.amount)} (${pl.discount.name})`
                          : pl.orderDiscountShare > 0
                          ? `-${formatPaise(pl.orderDiscountShare)} (Order share)`
                          : '—'}
                      </td>
                      <td className="mono">{formatPaise(pl.taxAmount)}</td>
                      <td className="mono" style={{ fontWeight: 600 }}>
                        {formatPaise(pl.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '20px',
                  marginTop: '10px',
                  fontSize: '13px',
                }}
              >
                <span>
                  Untaxed: <strong className="mono">{formatPaise(previewData.totals?.untaxedAmount)}</strong>
                </span>
                <span style={{ color: 'var(--success)' }}>
                  Discounts: <strong className="mono">-{formatPaise(previewData.totals?.discountTotal)}</strong>
                </span>
                <span>
                  GST Taxes: <strong className="mono">{formatPaise(previewData.totals?.taxTotal)}</strong>
                </span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--primary)' }}>
                  Total: <span className="mono">{formatPaise(previewData.totals?.total)}</span>
                </span>
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Notes / Quotation Terms</label>
            <input
              type="text"
              className="form-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setBuilderOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create Draft Subscription
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
