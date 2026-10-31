import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, ApiClientError } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { evaluatePasswordRules } from '../../utils/format';

export const ForceChangePasswordPage: React.FC = () => {
  const { user, loginWithToken, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const rules = evaluatePasswordRules(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      loginWithToken(res.data.token, res.data.user);
      if (res.data.user.role === 'customer') {
        navigate('/portal');
      } else {
        navigate('/staff/dashboard');
      }
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        const detailMsg = err.details?.map((d) => d.message).join(', ');
        setError(detailMsg || err.message);
      } else {
        setError('Failed to update password');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div className="brand-mark">S</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '18px' }}>SubNex</div>
            <div style={{ fontSize: '12px', color: 'var(--warning)' }}>
              Action Required: Temporary Password
            </div>
          </div>
        </div>

        <h2 style={{ margin: '0 0 6px', fontSize: '20px' }}>Set your password</h2>
        <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', fontSize: '13.5px' }}>
          Hi <strong>{user?.name}</strong>, your account was created with a temporary password. You must set a permanent password before continuing.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Current (Temporary) Password *</label>
            <input
              type="password"
              className="form-input"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">New Permanent Password *</label>
            <input
              type="password"
              className="form-input"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <div
              style={{
                marginTop: '8px',
                padding: '10px',
                background: 'var(--surface-muted)',
                borderRadius: '6px',
                fontSize: '12px',
              }}
            >
              <div style={{ color: rules.minLength ? 'var(--success)' : 'var(--text-muted)' }}>
                {rules.minLength ? '✓' : '○'} 9+ characters
              </div>
              <div style={{ color: rules.hasUpper ? 'var(--success)' : 'var(--text-muted)' }}>
                {rules.hasUpper ? '✓' : '○'} Uppercase letter
              </div>
              <div style={{ color: rules.hasLower ? 'var(--success)' : 'var(--text-muted)' }}>
                {rules.hasLower ? '✓' : '○'} Lowercase letter
              </div>
              <div style={{ color: rules.hasSpecial ? 'var(--success)' : 'var(--text-muted)' }}>
                {rules.hasSpecial ? '✓' : '○'} Special character
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={submitting}
          >
            {submitting ? 'Saving...' : 'Save Password & Continue'}
          </button>
        </form>

        <div style={{ marginTop: '14px', textAlign: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              logout();
              navigate('/staff/login');
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};
