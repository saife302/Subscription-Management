import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest, ApiClientError } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';

export const CustomerLoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest('/auth/customer/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      loginWithToken(res.data.token, res.data.user);
      navigate('/portal');
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to sign in. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <div className="brand-mark">S</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '18px' }}>SubNex</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Customer Portal Sign In
            </div>
          </div>
        </div>

        <h2 style={{ margin: '0 0 6px', fontSize: '20px' }}>Welcome back</h2>
        <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: '13.5px' }}>
          Sign in to view your subscriptions, quotations, and invoices.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email address</label>
            <input
              type="email"
              className="form-input"
              required
              placeholder="billing@acme.test"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <label className="form-label">Password</label>
              <Link
                to="/forgot-password"
                style={{ fontSize: '12px', color: 'var(--primary)', textDecoration: 'none' }}
              >
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              className="form-input"
              required
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px' }}
            disabled={submitting}
          >
            {submitting ? 'Signing in...' : 'Sign in to Customer Portal'}
          </button>
        </form>

        <div
          style={{
            marginTop: '18px',
            paddingTop: '14px',
            borderTop: '1px solid var(--border)',
            fontSize: '12px',
            color: 'var(--text-secondary)',
          }}
        >
          <div style={{ marginBottom: '8px', fontWeight: 600 }}>Quick Demo Accounts:</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setEmail('billing@acme.test');
                setPassword('Customer@2026!');
              }}
            >
              Acme Ltd (billing@acme.test)
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setEmail('asha@kite.test');
                setPassword('Customer@2026!');
              }}
            >
              Kite Stores (asha@kite.test)
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: '18px',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '13px',
          }}
        >
          <span>
            New customer?{' '}
            <Link to="/signup" style={{ color: 'var(--primary)', fontWeight: 600 }}>
              Create an account
            </Link>
          </span>
          <Link to="/staff/login" style={{ color: 'var(--text-muted)' }}>
            Staff Console →
          </Link>
        </div>
      </div>
    </div>
  );
};
