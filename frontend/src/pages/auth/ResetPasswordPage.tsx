import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest, ApiClientError } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { evaluatePasswordRules } from '../../utils/format';

export const ResetPasswordPage: React.FC<{ portal: 'customer' | 'staff' }> = ({
  portal,
}) => {
  const [searchParams] = useSearchParams();
  const [token, setTokenInput] = useState(searchParams.get('token') || '');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const rules = evaluatePasswordRules(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      const loggedUser = res.data.user;
      loginWithToken(res.data.token, loggedUser);
      if (loggedUser.role === 'customer') {
        navigate('/portal');
      } else {
        navigate('/staff/dashboard');
      }
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Invalid or expired reset link.');
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
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Set New Password
            </div>
          </div>
        </div>

        <h2 style={{ margin: '0 0 6px', fontSize: '20px' }}>Choose a new password</h2>
        <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', fontSize: '13.5px' }}>
          Setting a new password will sign you in and invalidate any older tokens.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {!searchParams.get('token') && (
            <div className="form-group">
              <label className="form-label">Reset Token</label>
              <input
                type="text"
                className="form-input mono"
                required
                value={token}
                onChange={(e) => setTokenInput(e.target.value)}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">New Password *</label>
            <input
              type="password"
              className="form-input"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New@Pass2026!"
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
            {submitting ? 'Updating password...' : 'Set new password'}
          </button>
        </form>

        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px' }}>
          <Link
            to={portal === 'staff' ? '/staff/login' : '/login'}
            style={{ color: 'var(--primary)', fontWeight: 600 }}
          >
            ← Back to Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};
