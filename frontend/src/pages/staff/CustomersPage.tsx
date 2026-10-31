import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { formatPaise } from '../../utils/format';

export const CustomersPage: React.FC = () => {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'staff';

  const [customers, setCustomers] = useState<any[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [hasOverdue, setHasOverdue] = useState('');
  const [hasActiveSub, setHasActiveSub] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCust, setEditingCust] = useState<any | null>(null);
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [taxId, setTaxId] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [notes, setNotes] = useState('');

  const loadCustomers = useCallback(
    async (page = 1) => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        if (search) params.set('search', search);
        if (hasOverdue === 'true') params.set('hasOverdue', 'true');
        if (hasActiveSub) params.set('hasActiveSubscription', hasActiveSub);
        const res = await apiRequest(`/customers?${params.toString()}`);
        setCustomers(res.data || []);
        setMeta(res.meta || { page: 1, limit: 20, total: 0, totalPages: 1 });
      } catch (err: any) {
        setError(err.message);
      }
    },
    [search, hasOverdue, hasActiveSub]
  );

  useEffect(() => {
    loadCustomers(1);
  }, [loadCustomers]);

  const openCreate = () => {
    setEditingCust(null);
    setName('');
    setContactName('');
    setEmail('');
    setPhone('');
    setTaxId('');
    setLine1('');
    setCity('');
    setState('');
    setPostalCode('');
    setNotes('');
    setModalOpen(true);
  };

  const openEdit = (c: any) => {
    setEditingCust(c);
    setName(c.name || '');
    setContactName(c.contactName || '');
    setEmail(c.email || '');
    setPhone(c.phone || '');
    setTaxId(c.taxId || '');
    setLine1(c.billingAddress?.line1 || '');
    setCity(c.billingAddress?.city || '');
    setState(c.billingAddress?.state || '');
    setPostalCode(c.billingAddress?.postalCode || '');
    setNotes(c.notes || '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        name,
        contactName,
        email,
        phone,
        taxId,
        notes,
        billingAddress: {
          line1,
          line2: '',
          city,
          state,
          postalCode,
          country: 'IN',
        },
      };
      if (editingCust) {
        await apiRequest(`/customers/${editingCust.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/customers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setModalOpen(false);
      loadCustomers(meta.page);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleArchive = async (id: string) => {
    setError(null);
    try {
      await apiRequest(`/customers/${id}`, { method: 'DELETE' });
      loadCustomers(meta.page);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">
            Businesses being billed, portal login status, and real-time billing stats
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openCreate}>
            + New Customer
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="filter-bar">
          <input
            type="text"
            className="form-input"
            style={{ maxWidth: '280px' }}
            placeholder="Search company or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="form-select"
            style={{ maxWidth: '200px' }}
            value={hasActiveSub}
            onChange={(e) => setHasActiveSub(e.target.value)}
          >
            <option value="">All Subscription States</option>
            <option value="true">Has Active Subscription</option>
            <option value="false">No Active Subscription</option>
          </select>
          <select
            className="form-select"
            style={{ maxWidth: '180px' }}
            value={hasOverdue}
            onChange={(e) => setHasOverdue(e.target.value)}
          >
            <option value="">All Balances</option>
            <option value="true">Has Overdue Invoices</option>
          </select>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer / Contact</th>
                <th>Email & Phone</th>
                <th>City / GSTIN</th>
                <th>Portal Login</th>
                <th>Active Subs</th>
                <th>Outstanding</th>
                <th>Overdue</th>
                <th>Paid to Date</th>
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    {c.contactName && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {c.contactName}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="mono" style={{ fontSize: '12.5px' }}>
                      {c.email}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {c.phone || '-'}
                    </div>
                  </td>
                  <td>
                    <div>{c.billingAddress?.city || '-'}</div>
                    <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {c.taxId || ''}
                    </div>
                  </td>
                  <td>
                    <StatusBadge
                      status={c.portalStatus}
                      label={c.portalStatus === 'none' ? 'No Login Yet' : c.portalStatus}
                    />
                  </td>
                  <td className="mono">{c.stats?.activeSubscriptions ?? 0}</td>
                  <td className="mono">{formatPaise(c.stats?.outstandingAmount)}</td>
                  <td
                    className="mono"
                    style={{
                      color:
                        (c.stats?.overdueAmount || 0) > 0
                          ? 'var(--danger)'
                          : 'var(--text-secondary)',
                      fontWeight: (c.stats?.overdueAmount || 0) > 0 ? 600 : 400,
                    }}
                  >
                    {formatPaise(c.stats?.overdueAmount)}
                  </td>
                  <td className="mono">{formatPaise(c.stats?.paidToDate)}</td>
                  {canEdit && (
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => openEdit(c)}
                        >
                          Edit
                        </button>
                        {c.isActive && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleArchive(c.id)}
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

        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          onPageChange={(p) => loadCustomers(p)}
        />
      </div>

      <Modal
        open={modalOpen}
        title={editingCust ? `Edit Customer - ${editingCust.name}` : 'Create Customer'}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSave}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Company / Customer Name *</label>
              <input
                type="text"
                className="form-input"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Ltd"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Contact Person</label>
              <input
                type="text"
                className="form-input"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Vikram Iyer"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input
                type="email"
                className="form-input"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="billing@acme.com"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input
                type="text"
                className="form-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98450 00000"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">GSTIN / Tax ID</label>
              <input
                type="text"
                className="form-input mono"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="29ABCDE1234F1Z5"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Street Address</label>
              <input
                type="text"
                className="form-input"
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
                placeholder="12 MG Road"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">City</label>
              <input
                type="text"
                className="form-input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Bengaluru"
              />
            </div>
            <div className="form-group">
              <label className="form-label">State</label>
              <input
                type="text"
                className="form-input"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="Karnataka"
              />
            </div>
            <div className="form-group">
              <label className="form-label">PIN Code</label>
              <input
                type="text"
                className="form-input"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="560001"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
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
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Customer
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
