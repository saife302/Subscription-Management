import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';
import { formatPaise, rupeesToPaise, paiseToRupeesInput } from '../../utils/format';

export const CatalogPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canEditTemplates = user?.role === 'admin' || user?.role === 'staff';

  const [tab, setTab] = useState<'products' | 'plans' | 'templates'>('products');
  const [products, setProducts] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Product modal
  const [prodModalOpen, setProdModalOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<any | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodType, setProdType] = useState<'service' | 'addon' | 'physical'>('service');
  const [prodSalesRupees, setProdSalesRupees] = useState('4000');
  const [prodCostRupees, setProdCostRupees] = useState('900');
  const [prodNotes, setProdNotes] = useState('');
  const [prodVariants, setProdVariants] = useState<
    Array<{ id?: string; attribute: string; value: string; extraPriceRupees: string }>
  >([]);

  // Plan modal
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any | null>(null);
  const [planName, setPlanName] = useState('');
  const [planProductId, setPlanProductId] = useState('');
  const [planPriceRupees, setPlanPriceRupees] = useState('4000');
  const [planPeriod, setPlanPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('yearly');
  const [planMinQty, setPlanMinQty] = useState(1);
  const [planFrom, setPlanFrom] = useState('2026-01-01');
  const [planUntil, setPlanUntil] = useState('2027-12-31');
  const [planDesc, setPlanDesc] = useState('');
  const [ruleAutoClose, setRuleAutoClose] = useState(true);
  const [ruleClosable, setRuleClosable] = useState(true);
  const [rulePausable, setRulePausable] = useState(true);
  const [ruleRenewable, setRuleRenewable] = useState(true);

  // Template modal
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplPlanId, setTplPlanId] = useState('');
  const [tplValidityDays, setTplValidityDays] = useState(14);
  const [tplPaymentTerms, setTplPaymentTerms] = useState(30);
  const [tplNotes, setTplNotes] = useState('');
  const [tplLines, setTplLines] = useState<
    Array<{ productId: string; variantId: string; quantity: number }>
  >([]);

  const loadCatalog = useCallback(async () => {
    try {
      const [pRes, plRes, tRes] = await Promise.all([
        apiRequest('/products?limit=100'),
        apiRequest('/plans?limit=100'),
        apiRequest('/quotation-templates?limit=100'),
      ]);
      setProducts(pRes.data || []);
      setPlans(plRes.data || []);
      setTemplates(tRes.data || []);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const openNewProduct = () => {
    setEditingProd(null);
    setProdName('');
    setProdType('service');
    setProdSalesRupees('4000');
    setProdCostRupees('900');
    setProdNotes('');
    setProdVariants([{ attribute: 'Brand', value: 'Odoo', extraPriceRupees: '560' }]);
    setProdModalOpen(true);
  };

  const openEditProduct = (p: any) => {
    setEditingProd(p);
    setProdName(p.name);
    setProdType(p.type);
    setProdSalesRupees(paiseToRupeesInput(p.salesPrice));
    setProdCostRupees(paiseToRupeesInput(p.costPrice));
    setProdNotes(p.notes || '');
    setProdVariants(
      (p.variants || []).map((v: any) => ({
        id: v.id,
        attribute: v.attribute,
        value: v.value,
        extraPriceRupees: paiseToRupeesInput(v.extraPrice),
      }))
    );
    setProdModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        name: prodName,
        type: prodType,
        salesPrice: rupeesToPaise(prodSalesRupees),
        costPrice: rupeesToPaise(prodCostRupees),
        notes: prodNotes,
        variants: prodVariants
          .filter((v) => v.attribute.trim() && v.value.trim())
          .map((v) => ({
            ...(v.id ? { id: v.id } : {}),
            attribute: v.attribute.trim(),
            value: v.value.trim(),
            extraPrice: rupeesToPaise(v.extraPriceRupees),
          })),
      };
      if (editingProd) {
        await apiRequest(`/products/${editingProd.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setProdModalOpen(false);
      loadCatalog();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleArchiveProduct = async (id: string) => {
    try {
      await apiRequest(`/products/${id}`, { method: 'DELETE' });
      loadCatalog();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openNewPlan = () => {
    setEditingPlan(null);
    setPlanName('');
    setPlanProductId(products[0]?.id || '');
    setPlanPriceRupees('4000');
    setPlanPeriod('yearly');
    setPlanMinQty(10);
    setPlanFrom('2026-01-01');
    setPlanUntil('2027-12-31');
    setPlanDesc('');
    setRuleAutoClose(true);
    setRuleClosable(false);
    setRulePausable(false);
    setRuleRenewable(true);
    setPlanModalOpen(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        name: planName,
        productId: planProductId,
        price: rupeesToPaise(planPriceRupees),
        billingPeriod: planPeriod,
        minQuantity: Number(planMinQty),
        availableFrom: planFrom,
        availableUntil: planUntil || null,
        rules: {
          autoClose: ruleAutoClose,
          closable: ruleClosable,
          pausable: rulePausable,
          renewable: ruleRenewable,
        },
        description: planDesc,
      };
      if (editingPlan) {
        await apiRequest(`/plans/${editingPlan.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/plans', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setPlanModalOpen(false);
      loadCatalog();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openNewTemplate = () => {
    const firstPlan = plans[0];
    setTplName('');
    setTplPlanId(firstPlan?.id || '');
    setTplValidityDays(14);
    setTplPaymentTerms(30);
    setTplNotes('Prices exclude GST.');
    setTplLines(
      firstPlan
        ? [
            {
              productId: firstPlan.product?.id || products[0]?.id || '',
              variantId: '',
              quantity: firstPlan.minQuantity || 1,
            },
          ]
        : []
    );
    setTplModalOpen(true);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/quotation-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: tplName,
          planId: tplPlanId,
          validityDays: Number(tplValidityDays),
          paymentTermDays: Number(tplPaymentTerms),
          notes: tplNotes,
          lines: tplLines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId || null,
            quantity: Number(l.quantity),
          })),
        }),
      });
      setTplModalOpen(false);
      loadCatalog();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Catalog - Products, Plans & Templates</h1>
          <p className="page-subtitle">
            Recurring plans, product variants, and pre-built quotation templates
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {tab === 'products' && isAdmin && (
            <button className="btn btn-primary" onClick={openNewProduct}>
              + New Product
            </button>
          )}
          {tab === 'plans' && isAdmin && (
            <button className="btn btn-primary" onClick={openNewPlan}>
              + New Plan
            </button>
          )}
          {tab === 'templates' && canEditTemplates && (
            <button className="btn btn-primary" onClick={openNewTemplate}>
              + New Quotation Template
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="tabs-bar">
        <button
          className={`tab-btn ${tab === 'products' ? 'active' : ''}`}
          onClick={() => setTab('products')}
        >
          Products <span className="tab-count">{products.length}</span>
        </button>
        <button
          className={`tab-btn ${tab === 'plans' ? 'active' : ''}`}
          onClick={() => setTab('plans')}
        >
          Plans <span className="tab-count">{plans.length}</span>
        </button>
        <button
          className={`tab-btn ${tab === 'templates' ? 'active' : ''}`}
          onClick={() => setTab('templates')}
        >
          Quotation Templates <span className="tab-count">{templates.length}</span>
        </button>
      </div>

      {tab === 'products' && (
        <div className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Sales Price</th>
                  <th>Cost Price</th>
                  <th>Variants</th>
                  <th>Used in Plans</th>
                  <th>Status</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      {p.notes && (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {p.notes}
                        </div>
                      )}
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{p.type}</td>
                    <td className="mono">{formatPaise(p.salesPrice)}</td>
                    <td className="mono">{formatPaise(p.costPrice)}</td>
                    <td>
                      {(p.variants || []).length === 0 ? (
                        <span style={{ color: 'var(--text-muted)' }}>None</span>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {p.variants.map((v: any) => (
                            <span key={v.id} className="badge badge-info">
                              {v.attribute}: {v.value} (+{formatPaise(v.extraPrice)})
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>{p.usedInPlans}</td>
                    <td>
                      <StatusBadge status={p.isActive ? 'active' : 'inactive'} />
                    </td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEditProduct(p)}
                          >
                            Edit
                          </button>
                          {p.isActive && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleArchiveProduct(p.id)}
                            >
                              Archive
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'plans' && (
        <div className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Plan Name</th>
                  <th>Main Product</th>
                  <th>Billing Period</th>
                  <th>Price / Unit</th>
                  <th>Min Qty</th>
                  <th>Rules</th>
                  <th>Active Subs</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((pl) => (
                  <tr key={pl.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{pl.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {pl.availableFrom} → {pl.availableUntil || 'No end'}
                      </div>
                    </td>
                    <td>{pl.product?.name}</td>
                    <td style={{ textTransform: 'capitalize' }}>{pl.billingPeriod}</td>
                    <td className="mono">{formatPaise(pl.price)}</td>
                    <td className="mono">{pl.minQuantity}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {pl.rules?.pausable && <span className="badge badge-neutral">Pausable</span>}
                        {pl.rules?.renewable && <span className="badge badge-neutral">Renewable</span>}
                        {pl.rules?.closable && <span className="badge badge-neutral">Closable</span>}
                        {pl.rules?.autoClose && <span className="badge badge-neutral">AutoClose</span>}
                      </div>
                    </td>
                    <td>{pl.activeSubscriptions}</td>
                    <td>
                      <StatusBadge status={pl.isActive ? 'active' : 'inactive'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'templates' && (
        <div className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Template Name</th>
                  <th>Plan</th>
                  <th>Validity Days</th>
                  <th>Payment Terms</th>
                  <th>Template Lines</th>
                  <th>Used Count</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td>
                      {t.plan?.name} ({t.plan?.billingPeriod})
                    </td>
                    <td>{t.validityDays} days</td>
                    <td>{t.paymentTermDays} days</td>
                    <td>
                      {(t.lines || []).map((l: any, idx: number) => (
                        <div key={idx} style={{ fontSize: '12.5px' }}>
                          {l.quantity} × {l.productName}{' '}
                          {l.variantLabel ? `(${l.variantLabel})` : ''} @{' '}
                          <span className="mono">{formatPaise(l.unitPrice)}</span>
                        </div>
                      ))}
                    </td>
                    <td>{t.usedCount}</td>
                    <td>
                      <StatusBadge status={t.isActive ? 'active' : 'inactive'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Product Modal */}
      <Modal
        open={prodModalOpen}
        title={editingProd ? `Edit Product - ${editingProd.name}` : 'Create Product'}
        onClose={() => setProdModalOpen(false)}
      >
        <form onSubmit={handleSaveProduct}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Product Name *</label>
              <input
                type="text"
                className="form-input"
                required
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Type *</label>
              <select
                className="form-select"
                value={prodType}
                onChange={(e) => setProdType(e.target.value as any)}
              >
                <option value="service">Service</option>
                <option value="addon">Add-on</option>
                <option value="physical">Physical</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Sales Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                className="form-input mono"
                required
                value={prodSalesRupees}
                onChange={(e) => setProdSalesRupees(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Cost Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                className="form-input mono"
                required
                value={prodCostRupees}
                onChange={(e) => setProdCostRupees(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <input
              type="text"
              className="form-input"
              value={prodNotes}
              onChange={(e) => setProdNotes(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label className="form-label" style={{ margin: 0 }}>
                Variants (e.g. Brand: Odoo +₹560)
              </label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  setProdVariants([
                    ...prodVariants,
                    { attribute: 'Brand', value: '', extraPriceRupees: '0' },
                  ])
                }
              >
                + Add Variant
              </button>
            </div>
            {prodVariants.map((v, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Attribute (Brand)"
                  value={v.attribute}
                  onChange={(e) => {
                    const next = [...prodVariants];
                    next[idx].attribute = e.target.value;
                    setProdVariants(next);
                  }}
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Value (Odoo)"
                  value={v.value}
                  onChange={(e) => {
                    const next = [...prodVariants];
                    next[idx].value = e.target.value;
                    setProdVariants(next);
                  }}
                />
                <input
                  type="number"
                  step="0.01"
                  className="form-input mono"
                  placeholder="Extra ₹"
                  value={v.extraPriceRupees}
                  onChange={(e) => {
                    const next = [...prodVariants];
                    next[idx].extraPriceRupees = e.target.value;
                    setProdVariants(next);
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    setProdVariants(prodVariants.filter((_, i) => i !== idx))
                  }
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setProdModalOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Product
            </button>
          </div>
        </form>
      </Modal>

      {/* Plan Modal */}
      <Modal
        open={planModalOpen}
        title="Create Subscription Plan"
        onClose={() => setPlanModalOpen(false)}
      >
        <form onSubmit={handleSavePlan}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Plan Name *</label>
              <input
                type="text"
                className="form-input"
                required
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="Pro Yearly"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Main Product *</label>
              <select
                className="form-select"
                required
                value={planProductId}
                onChange={(e) => setPlanProductId(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Price per Unit (₹) *</label>
              <input
                type="number"
                step="0.01"
                className="form-input mono"
                required
                value={planPriceRupees}
                onChange={(e) => setPlanPriceRupees(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Billing Period *</label>
              <select
                className="form-select"
                value={planPeriod}
                onChange={(e) => setPlanPeriod(e.target.value as any)}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Min Quantity *</label>
              <input
                type="number"
                min={1}
                className="form-input mono"
                required
                value={planMinQty}
                onChange={(e) => setPlanMinQty(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Available From *</label>
              <input
                type="date"
                className="form-input"
                required
                value={planFrom}
                onChange={(e) => setPlanFrom(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Available Until</label>
              <input
                type="date"
                className="form-input"
                value={planUntil}
                onChange={(e) => setPlanUntil(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Plan Lifecycle Rules</label>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="checkbox"
                  checked={rulePausable}
                  onChange={(e) => setRulePausable(e.target.checked)}
                />
                Pausable
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="checkbox"
                  checked={ruleRenewable}
                  onChange={(e) => setRuleRenewable(e.target.checked)}
                />
                Renewable
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="checkbox"
                  checked={ruleClosable}
                  onChange={(e) => setRuleClosable(e.target.checked)}
                />
                Closable early
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="checkbox"
                  checked={ruleAutoClose}
                  onChange={(e) => setRuleAutoClose(e.target.checked)}
                />
                Auto-close on expiry
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPlanModalOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Plan
            </button>
          </div>
        </form>
      </Modal>

      {/* Quotation Template Modal */}
      <Modal
        open={tplModalOpen}
        title="Create Quotation Template"
        onClose={() => setTplModalOpen(false)}
      >
        <form onSubmit={handleSaveTemplate}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Template Name *</label>
              <input
                type="text"
                className="form-input"
                required
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                placeholder="Pro Yearly - Enterprise"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Plan *</label>
              <select
                className="form-select"
                value={tplPlanId}
                onChange={(e) => setTplPlanId(e.target.value)}
              >
                {plans.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name} ({pl.billingPeriod}, min {pl.minQuantity})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Validity Days *</label>
              <input
                type="number"
                min={1}
                className="form-input mono"
                value={tplValidityDays}
                onChange={(e) => setTplValidityDays(Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Terms (Days) *</label>
              <select
                className="form-select"
                value={tplPaymentTerms}
                onChange={(e) => setTplPaymentTerms(Number(e.target.value))}
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
                Template Lines
              </label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  setTplLines([
                    ...tplLines,
                    { productId: products[0]?.id || '', variantId: '', quantity: 1 },
                  ])
                }
              >
                + Add Line
              </button>
            </div>
            {tplLines.map((line, idx) => {
              const prod = products.find((p) => p.id === line.productId);
              return (
                <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <select
                    className="form-select"
                    value={line.productId}
                    onChange={(e) => {
                      const next = [...tplLines];
                      next[idx].productId = e.target.value;
                      next[idx].variantId = '';
                      setTplLines(next);
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
                    value={line.variantId}
                    onChange={(e) => {
                      const next = [...tplLines];
                      next[idx].variantId = e.target.value;
                      setTplLines(next);
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
                    value={line.quantity}
                    onChange={(e) => {
                      const next = [...tplLines];
                      next[idx].quantity = Number(e.target.value);
                      setTplLines(next);
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setTplLines(tplLines.filter((_, i) => i !== idx))}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setTplModalOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create Template
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
