import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../services/api';

export const ForgotPasswordPage: React.FC<{ portal: 'customer' | 'staff' }> = ({
  portal,
}) => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setDevResetUrl(null);
    try {
      const res = await apiRequest('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email, portal }),
      });
      setSent(true);
      if (res.data?.devResetUrl) {
        setDevResetUrl(res.data.devResetUrl);
      }
    } catch (_) {
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  const backLoginPath = portal === 'staff' ? '/staff/login' : '/login';

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div className="brand-mark">S</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '18px' }}>SubNex</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {portal === 'staff' ? 'Staff Password Recovery' : 'Customer Password Recovery'}
            </div>
          </div>
        </div>

        <h2 style={{ margin: '0 0 6px', fontSize: '20px' }}>Forgot your password?</h2>
        <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', fontSize: '13.5px' }}>
          Enter your email address and we will send a 30-minute reset link via Brevo.
        </p>

        {sent && (
          <div className="alert alert-success">
            <div>
              If an active {portal} account exists for <strong>{email}</strong>, a password reset link has been sent.
            </div>
            {devResetUrl && (
              <div style={{ marginTop: '8px', wordBreak: 'break-all' }}>
                <strong>Dev Mode Reset Link:</strong>{' '}
                <a href={devResetUrl} style={{ color: 'var(--primary)' }}>
                  {devResetUrl}
                </a>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email address</label>
            <input
              type="email"
              className="form-input"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={portal === 'staff' ? 'meera@brightloop.test' : 'asha@kite.test'}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={submitting}
          >
            {submitting ? 'Sending reset link...' : 'Send reset link'}
          </button>
        </form>

        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px' }}>
          <Link to={backLoginPath} style={{ color: 'var(--primary)', fontWeight: 600 }}>
            ← Back to Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};
