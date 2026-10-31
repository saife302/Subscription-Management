import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';
import { formatPaise, rupeesToPaise } from '../../utils/format';

export const TaxesDiscountsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [tab, setTab] = useState<'discounts' | 'taxes'>('discounts');
  const [discounts, setDiscounts] = useState<any[]>([]);
  const [taxes, setTaxes] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [stateFilter, setStateFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Discount Modal
  const [discModalOpen, setDiscModalOpen] = useState(false);
  const [discName, setDiscName] = useState('');
  const [discType, setDiscType] = useState<'percentage' | 'fixed'>('percentage');
  const [discValue, setDiscValue] = useState('10');
  const [discMinPurchaseRupees, setDiscMinPurchaseRupees] = useState('');
  const [discMinQty, setDiscMinQty] = useState('20');
  const [discStart, setDiscStart] = useState('2026-01-01');
  const [discEnd, setDiscEnd] = useState('2027-12-31');
  const [discUsageLimit, setDiscUsageLimit] = useState('50');
  const [discAppliesKind, setDiscAppliesKind] = useState<'products' | 'subscription'>('products');
  const [discProductIds, setDiscProductIds] = useState<string[]>([]);

  // Tax Modal
  const [taxModalOpen, setTaxModalOpen] = useState(false);
  const [taxName, setTaxName] = useState('GST 18%');
  const [taxType, setTaxType] = useState<'percentage' | 'fixed'>('percentage');
  const [taxRate, setTaxRate] = useState('18');
  const [taxAppliesKind, setTaxAppliesKind] = useState<'all' | 'productTypes'>('productTypes');
  const [taxProdTypes, setTaxProdTypes] = useState<string[]>(['service', 'addon']);

  const loadData = useCallback(async () => {
    try {
      const discQuery = stateFilter ? `?state=${stateFilter}&limit=100` : '?limit=100';
      const [dRes, tRes, pRes] = await Promise.all([
        apiRequest(`/discounts${discQuery}`),
        apiRequest('/taxes?limit=100'),
        apiRequest('/products?limit=100'),
      ]);
      setDiscounts(dRes.data || []);
      setTaxes(tRes.data || []);
      setProducts(pRes.data || []);
      if (pRes.data?.length > 0 && discProductIds.length === 0) {
        setDiscProductIds([pRes.data[0].id]);
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, [stateFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const value =
        discType === 'percentage'
          ? parseFloat(discValue)
          : rupeesToPaise(discValue);
      await apiRequest('/discounts', {
        method: 'POST',
        body: JSON.stringify({
          name: discName,
          type: discType,
          value,
          minPurchaseAmount: discMinPurchaseRupees
            ? rupeesToPaise(discMinPurchaseRupees)
            : null,
          minQuantity: discMinQty ? Number(discMinQty) : null,
          startDate: discStart,
          endDate: discEnd,
          usageLimit: discUsageLimit ? Number(discUsageLimit) : null,
          appliesTo: {
            kind: discAppliesKind,
            productIds: discAppliesKind === 'products' ? discProductIds : [],
          },
        }),
      });
      setDiscModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleStopDiscount = async (id: string) => {
    try {
      await apiRequest(`/discounts/${id}/stop`, { method: 'POST' });
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveTax = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/taxes', {
        method: 'POST',
        body: JSON.stringify({
          name: taxName,
          type: taxType,
          rate: taxType === 'percentage' ? parseFloat(taxRate) : rupeesToPaise(taxRate),
          appliesTo: {
            kind: taxAppliesKind,
            productTypes: taxAppliesKind === 'productTypes' ? taxProdTypes : [],
            productIds: [],
          },
          isActive: true,
        }),
      });
      setTaxModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Taxes & Discounts</h1>
          <p className="page-subtitle">
            Admin-configured discount rules and GST tax rules applied automatically by the pricing engine
          </p>
        </div>
        {isAdmin && (
          <div>
            {tab === 'discounts' ? (
              <button className="btn btn-primary" onClick={() => setDiscModalOpen(true)}>
                + New Discount Rule
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => setTaxModalOpen(true)}>
                + New Tax Rule
              </button>
            )}
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="tabs-bar">
        <button
          className={`tab-btn ${tab === 'discounts' ? 'active' : ''}`}
          onClick={() => setTab('discounts')}
        >
          Discount Rules <span className="tab-count">{discounts.length}</span>
        </button>
        <button
          className={`tab-btn ${tab === 'taxes' ? 'active' : ''}`}
          onClick={() => setTab('taxes')}
        >
          Tax Rules <span className="tab-count">{taxes.length}</span>
        </button>
      </div>

      {tab === 'discounts' && (
        <div className="card">
          <div className="filter-bar">
            <select
              className="form-select"
              style={{ maxWidth: '220px' }}
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
            >
              <option value="">All States</option>
              <option value="running">Running</option>
              <option value="scheduled">Scheduled</option>
              <option value="expired">Expired</option>
              <option value="exhausted">Exhausted</option>
              <option value="inactive">Inactive (Stopped)</option>
            </select>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Value</th>
                  <th>Scope</th>
                  <th>Conditions</th>
                  <th>Dates</th>
                  <th>Usage</th>
                  <th>Computed State</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {discounts.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    <td className="mono">
                      {d.type === 'percentage' ? `${d.value}%` : formatPaise(d.value)}
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>
                      {d.appliesTo?.kind === 'products'
                        ? `Products (${(d.appliesTo.productIds || []).length})`
                        : 'Whole Subscription'}
                    </td>
                    <td style={{ fontSize: '12px' }}>
                      {d.minQuantity ? `Min Qty ≥ ${d.minQuantity} ` : ''}
                      {d.minPurchaseAmount
                        ? `Min Purchase ≥ ${formatPaise(d.minPurchaseAmount)}`
                        : ''}
                      {!d.minQuantity && !d.minPurchaseAmount ? 'None' : ''}
                    </td>
                    <td style={{ fontSize: '12px' }}>
                      {d.startDate} → {d.endDate}
                    </td>
                    <td className="mono">
                      {d.usedCount} / {d.usageLimit ?? '∞'}
                    </td>
                    <td>
                      <StatusBadge status={d.state} />
                    </td>
                    {isAdmin && (
                      <td>
                        {d.isActive && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleStopDiscount(d.id)}
                          >
                            Stop
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'taxes' && (
        <div className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tax Name</th>
                  <th>Type</th>
                  <th>Rate</th>
                  <th>Applies To</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {taxes.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td style={{ textTransform: 'capitalize' }}>{t.type}</td>
                    <td className="mono">
                      {t.type === 'percentage' ? `${t.rate}%` : formatPaise(t.rate)}
                    </td>
                    <td>
                      {t.appliesTo?.kind === 'all'
                        ? 'All Products'
                        : t.appliesTo?.kind === 'productTypes'
                        ? `Product Types: ${(t.appliesTo.productTypes || []).join(', ')}`
                        : `Specific Products`}
                    </td>
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

      {/* Create Discount Modal */}
      <Modal
        open={discModalOpen}
        title="Create Discount Rule"
        onClose={() => setDiscModalOpen(false)}
      >
        <form onSubmit={handleSaveDiscount}>
          <div className="form-group">
            <label className="form-label">Discount Name *</label>
            <input
              type="text"
              className="form-input"
              required
              value={discName}
              onChange={(e) => setDiscName(e.target.value)}
              placeholder="Bulk seats 10%"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Type *</label>
              <select
                className="form-select"
                value={discType}
                onChange={(e) => setDiscType(e.target.value as any)}
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount (₹)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">
                {discType === 'percentage' ? 'Percentage (0-100) *' : 'Fixed Amount (₹) *'}
              </label>
              <input
                type="number"
                step="0.01"
                className="form-input mono"
                required
                value={discValue}
                onChange={(e) => setDiscValue(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Min Quantity (optional)</label>
              <input
                type="number"
                min={1}
                className="form-input mono"
                value={discMinQty}
                onChange={(e) => setDiscMinQty(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Min Purchase (₹, optional)</label>
              <input
                type="number"
                step="0.01"
                className="form-input mono"
                value={discMinPurchaseRupees}
                onChange={(e) => setDiscMinPurchaseRupees(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Usage Limit (invoices)</label>
              <input
                type="number"
                min={1}
                className="form-input mono"
                value={discUsageLimit}
                onChange={(e) => setDiscUsageLimit(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Start Date *</label>
              <input
                type="date"
                className="form-input"
                required
                value={discStart}
                onChange={(e) => setDiscStart(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">End Date *</label>
              <input
                type="date"
                className="form-input"
                required
                value={discEnd}
                onChange={(e) => setDiscEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Applies To *</label>
            <select
              className="form-select"
              value={discAppliesKind}
              onChange={(e) => setDiscAppliesKind(e.target.value as any)}
            >
              <option value="products">Specific Products (Line Discount)</option>
              <option value="subscription">Whole Subscription (Order Discount)</option>
            </select>
          </div>

          {discAppliesKind === 'products' && (
            <div className="form-group">
              <label className="form-label">Select Target Products</label>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {products.map((p) => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      checked={discProductIds.includes(p.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setDiscProductIds([...discProductIds, p.id]);
                        } else {
                          setDiscProductIds(discProductIds.filter((id) => id !== p.id));
                        }
                      }}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDiscModalOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create Discount
            </button>
          </div>
        </form>
      </Modal>

      {/* Create Tax Modal */}
      <Modal
        open={taxModalOpen}
        title="Create Tax Rule"
        onClose={() => setTaxModalOpen(false)}
      >
        <form onSubmit={handleSaveTax}>
          <div className="form-group">
            <label className="form-label">Tax Name *</label>
            <input
              type="text"
              className="form-input"
              required
              value={taxName}
              onChange={(e) => setTaxName(e.target.value)}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Type *</label>
              <select
                className="form-select"
                value={taxType}
                onChange={(e) => setTaxType(e.target.value as any)}
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed per Unit (₹)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Rate *</label>
              <input
                type="number"
                step="0.01"
                className="form-input mono"
                required
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Applies To *</label>
            <select
              className="form-select"
              value={taxAppliesKind}
              onChange={(e) => setTaxAppliesKind(e.target.value as any)}
            >
              <option value="all">All Products</option>
              <option value="productTypes">Specific Product Types</option>
            </select>
          </div>

          {taxAppliesKind === 'productTypes' && (
            <div className="form-group">
              <div style={{ display: 'flex', gap: '16px' }}>
                {['service', 'addon', 'physical'].map((pt) => (
                  <label key={pt} style={{ display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'capitalize' }}>
                    <input
                      type="checkbox"
                      checked={taxProdTypes.includes(pt)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setTaxProdTypes([...taxProdTypes, pt]);
                        } else {
                          setTaxProdTypes(taxProdTypes.filter((x) => x !== pt));
                        }
                      }}
                    />
                    {pt}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setTaxModalOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create Tax
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
