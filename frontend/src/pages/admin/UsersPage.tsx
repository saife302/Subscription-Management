import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest, downloadCsvWithAuth, ApiClientError } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { formatDate } from '../../utils/format';

export const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create user modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'staff' | 'finance' | 'admin'>('staff');
  const [tempPassword, setTempPassword] = useState('Welcome@2026!');

  // Reset password modal
  const [resetUser, setResetUser] = useState<any | null>(null);
  const [resetTempPwd, setResetTempPwd] = useState('Welcome@2026!');

  // CSV Import modal
  const [importOpen, setImportOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<any | null>(null);
  const [importing, setImporting] = useState(false);

  const loadUsers = useCallback(
    async (page = 1) => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        if (roleFilter) params.set('role', roleFilter);
        if (statusFilter) params.set('status', statusFilter);
        if (search) params.set('search', search);
        const res = await apiRequest(`/users?${params.toString()}`);
        setUsers(res.data || []);
        setMeta(res.meta || { page: 1, limit: 20, total: 0, totalPages: 1 });
      } catch (err: any) {
        setError(err.message);
      }
    },
    [roleFilter, statusFilter, search]
  );

  useEffect(() => {
    loadUsers(1);
  }, [loadUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          role: newRole,
          temporaryPassword: tempPassword,
        }),
      });
      setCreateOpen(false);
      setNewName('');
      setNewEmail('');
      setSuccessMsg(`Created ${newRole} account for ${newEmail}`);
      loadUsers(meta.page);
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        const details = err.details?.map((d) => `${d.field}: ${d.message}`).join(', ');
        setError(details || err.message);
      } else {
        setError('Failed to create user');
      }
    }
  };

  const handleToggleStatus = async (u: any) => {
    setError(null);
    try {
      const nextStatus = u.status === 'active' ? 'disabled' : 'active';
      await apiRequest(`/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      loadUsers(meta.page);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleChangeRole = async (u: any, role: string) => {
    setError(null);
    try {
      await apiRequest(`/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      loadUsers(meta.page);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser) return;
    setError(null);
    try {
      await apiRequest(`/users/${resetUser.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ temporaryPassword: resetTempPwd }),
      });
      setSuccessMsg(`Temporary password set for ${resetUser.email}`);
      setResetUser(null);
      loadUsers(meta.page);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handlePreviewCsv = async () => {
    if (!csvFile) return;
    setImporting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', csvFile);
      const res = await apiRequest('/users/import?dryRun=true', {
        method: 'POST',
        body: form,
      });
      setPreviewResult(res.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleExecuteCsvImport = async () => {
    if (!csvFile) return;
    setImporting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', csvFile);
      const res = await apiRequest('/users/import?dryRun=false', {
        method: 'POST',
        body: form,
      });
      setPreviewResult(res.data);
      if (res.data.created > 0) {
        setSuccessMsg(`Successfully imported ${res.data.created} users!`);
        setImportOpen(false);
        setCsvFile(null);
        setPreviewResult(null);
        loadUsers(1);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Users & Bulk CSV Import</h1>
          <p className="page-subtitle">
            Admin-only management of Staff, Finance Lead, Admin, and Customer logins
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={() =>
              downloadCsvWithAuth('/users/import/template', 'sample-users-template.csv')
            }
          >
            Sample CSV
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setPreviewResult(null);
              setCsvFile(null);
              setImportOpen(true);
            }}
          >
            Bulk Import (CSV)
          </button>
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            + New Staff / Admin User
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      <div className="card">
        <div className="filter-bar">
          <input
            type="text"
            className="form-input"
            style={{ maxWidth: '280px' }}
            placeholder="Search name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="form-select"
            style={{ maxWidth: '180px' }}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="staff">Internal Staff</option>
            <option value="finance">Finance Lead</option>
            <option value="customer">Customer</option>
          </select>
          <select
            className="form-select"
            style={{ maxWidth: '160px' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Temp Password?</th>
                <th>Created Via</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td className="mono">{u.email}</td>
                  <td>
                    {u.role !== 'customer' ? (
                      <select
                        className="form-select"
                        style={{ padding: '4px 8px', fontSize: '12px', width: 'auto' }}
                        value={u.role}
                        onChange={(e) => handleChangeRole(u, e.target.value)}
                      >
                        <option value="staff">Internal Staff</option>
                        <option value="finance">Finance Lead</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <StatusBadge status="customer" />
                    )}
                  </td>
                  <td>
                    <StatusBadge status={u.status} />
                  </td>
                  <td>
                    {u.mustChangePassword ? (
                      <StatusBadge status="warning" label="Must Change" />
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No</span>
                    )}
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{u.createdVia}</td>
                  <td>{formatDate(u.lastLoginAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleToggleStatus(u)}
                      >
                        {u.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setResetUser(u);
                          setResetTempPwd('Welcome@2026!');
                        }}
                      >
                        Reset Pwd
                      </button>
                    </div>
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
          onPageChange={(p) => loadUsers(p)}
        />
      </div>

      {/* Create Single Staff/Finance/Admin User Modal */}
      <Modal
        open={createOpen}
        title="Create Staff / Finance / Admin Account"
        onClose={() => setCreateOpen(false)}
      >
        <form onSubmit={handleCreateUser}>
          <div className="form-group">
            <label className="form-label">Full Name *</label>
            <input
              type="text"
              className="form-input"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Riya Sharma"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Work Email *</label>
            <input
              type="email"
              className="form-input"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="riya@company.com"
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Access Level (Role) *</label>
              <select
                className="form-select"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as any)}
              >
                <option value="staff">Internal Staff (staff)</option>
                <option value="finance">Finance Lead (finance)</option>
                <option value="admin">Admin (admin)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Temporary Password *</label>
              <input
                type="text"
                className="form-input mono"
                required
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
              />
            </div>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            The user will be required to change this temporary password on their first login.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create User
            </button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        open={Boolean(resetUser)}
        title={`Reset Password - ${resetUser?.name}`}
        onClose={() => setResetUser(null)}
      >
        <form onSubmit={handleResetPassword}>
          <div className="form-group">
            <label className="form-label">New Temporary Password *</label>
            <input
              type="text"
              className="form-input mono"
              required
              value={resetTempPwd}
              onChange={(e) => setResetTempPwd(e.target.value)}
            />
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Setting a temporary password immediately invalidates all active tokens for this user and forces a password change at next login.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setResetUser(null)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Set Temporary Password
            </button>
          </div>
        </form>
      </Modal>

      {/* Bulk CSV Import Modal */}
      <Modal
        open={importOpen}
        title="Bulk Import Staff Users (CSV)"
        maxWidth="820px"
        onClose={() => setImportOpen(false)}
      >
        <div className="alert alert-info">
          Upload a <code>.csv</code> file with columns:{' '}
          <code>name,email,temporary_password,access_level</code> (max 200 rows, 1 MB).
          All-or-nothing: if any row has an error, 0 users are created.
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
          <input
            type="file"
            accept=".csv,text/csv"
            className="form-input"
            onChange={(e) => {
              setCsvFile(e.target.files?.[0] || null);
              setPreviewResult(null);
            }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!csvFile || importing}
            onClick={handlePreviewCsv}
          >
            {importing ? 'Checking...' : '1. Preview (dryRun=true)'}
          </button>
        </div>

        {previewResult && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px',
                background: 'var(--surface-muted)',
                borderRadius: '8px',
                marginBottom: '12px',
              }}
            >
              <div>
                <strong>Total Rows:</strong> {previewResult.total} •{' '}
                <strong style={{ color: 'var(--success)' }}>Valid:</strong>{' '}
                {previewResult.valid} •{' '}
                <strong style={{ color: 'var(--danger)' }}>Invalid:</strong>{' '}
                {previewResult.invalid}
              </div>
              {previewResult.invalid === 0 && previewResult.total > 0 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={importing}
                  onClick={handleExecuteCsvImport}
                >
                  2. Create {previewResult.valid} Users (dryRun=false)
                </button>
              )}
            </div>

            <div className="table-wrap" style={{ maxHeight: '340px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Row #</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Mapped Role</th>
                    <th>Status</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {(previewResult.rows || []).map((r: any) => (
                    <tr key={r.row}>
                      <td className="mono">{r.row}</td>
                      <td>{r.name}</td>
                      <td className="mono">{r.email}</td>
                      <td>{r.role || '-'}</td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td>
                        {r.errors && r.errors.length > 0 ? (
                          <ul style={{ margin: 0, paddingLeft: '16px', color: 'var(--danger)', fontSize: '12px' }}>
                            {r.errors.map((er: any, i: number) => (
                              <li key={i}>
                                <strong>{er.field}:</strong> {er.message}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span style={{ color: 'var(--success)', fontSize: '12px' }}>✓ OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
