import React, { useState, useEffect } from 'react';
import { apiRequest, ApiClientError } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { evaluatePasswordRules } from '../../utils/format';

export const ProfilePage: React.FC = () => {
  const { user, refreshUser, loginWithToken } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [contactName, setContactName] = useState(user?.customer?.contactName || '');
  const [phone, setPhone] = useState(user?.customer?.phone || '');
  const [taxId, setTaxId] = useState(user?.customer?.taxId || '');
  const [line1, setLine1] = useState(user?.customer?.billingAddress?.line1 || '');
  const [city, setCity] = useState(user?.customer?.billingAddress?.city || '');
  const [state, setState] = useState(user?.customer?.billingAddress?.state || '');
  const [postalCode, setPostalCode] = useState(user?.customer?.billingAddress?.postalCode || '');
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdErr, setPwdErr] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      if (user.customer) {
        setContactName(user.customer.contactName || '');
        setPhone(user.customer.phone || '');
        setTaxId(user.customer.taxId || '');
        setLine1(user.customer.billingAddress?.line1 || '');
        setCity(user.customer.billingAddress?.city || '');
        setState(user.customer.billingAddress?.state || '');
        setPostalCode(user.customer.billingAddress?.postalCode || '');
      }
    }
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setProfileErr(null);
    try {
      const payload: any = { name };
      if (user?.role === 'customer') {
        payload.contactName = contactName;
        payload.phone = phone;
        payload.taxId = taxId;
        payload.billingAddress = {
          line1,
          line2: '',
          city,
          state,
          postalCode,
          country: 'IN',
        };
      }
      await apiRequest('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await refreshUser();
      setProfileMsg('Profile updated successfully.');
    } catch (err: any) {
      setProfileErr(err.message || 'Failed to update profile.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    setPwdErr(null);
    try {
      const res = await apiRequest('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      loginWithToken(res.data.token, res.data.user);
      setCurrentPassword('');
      setNewPassword('');
      setPwdMsg('Password changed and token refreshed.');
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        const d = err.details?.map((x) => x.message).join(', ');
        setPwdErr(d || err.message);
      } else {
        setPwdErr('Failed to change password');
      }
    }
  };

  const rules = evaluatePasswordRules(newPassword);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Profile & Security</h1>
          <p className="page-subtitle">Manage your account details and password</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '14px' }}>
            Account Information
          </h3>
          {profileMsg && <div className="alert alert-success">{profileMsg}</div>}
          {profileErr && <div className="alert alert-error">{profileErr}</div>}

          <form onSubmit={handleSaveProfile}>
            <div className="form-group">
              <label className="form-label">Email (read-only)</label>
              <input
                type="email"
                className="form-input"
                disabled
                value={user?.email || ''}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input
                type="text"
                className="form-input"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {user?.role === 'customer' && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Contact Person</label>
                    <input
                      type="text"
                      className="form-input"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input
                      type="text"
                      className="form-input"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">GSTIN / Tax ID</label>
                  <input
                    type="text"
                    className="form-input mono"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Street Address</label>
                  <input
                    type="text"
                    className="form-input"
                    value={line1}
                    onChange={(e) => setLine1(e.target.value)}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">City</label>
                    <input
                      type="text"
                      className="form-input"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">State</label>
                    <input
                      type="text"
                      className="form-input"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">PIN Code</label>
                    <input
                      type="text"
                      className="form-input"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            <button type="submit" className="btn btn-primary">
              Save Changes
            </button>
          </form>
        </div>

        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '14px' }}>
            Change Password
          </h3>
          {pwdMsg && <div className="alert alert-success">{pwdMsg}</div>}
          {pwdErr && <div className="alert alert-error">{pwdErr}</div>}

          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label className="form-label">Current Password *</label>
              <input
                type="password"
                className="form-input"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">New Password *</label>
              <input
                type="password"
                className="form-input"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span style={{ color: rules.minLength ? 'var(--success)' : undefined }}>
                  9+ chars
                </span>{' '}
                •{' '}
                <span style={{ color: rules.hasUpper ? 'var(--success)' : undefined }}>
                  Uppercase
                </span>{' '}
                •{' '}
                <span style={{ color: rules.hasLower ? 'var(--success)' : undefined }}>
                  Lowercase
                </span>{' '}
                •{' '}
                <span style={{ color: rules.hasSpecial ? 'var(--success)' : undefined }}>
                  Special char
                </span>
              </div>
            </div>

            <button type="submit" className="btn btn-primary">
              Update Password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
