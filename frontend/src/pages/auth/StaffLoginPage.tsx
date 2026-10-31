import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest, ApiClientError } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';

export const StaffLoginPage: React.FC = () => {
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
      const res = await apiRequest('/auth/staff/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const loggedUser = res.data.user;
      loginWithToken(res.data.token, loggedUser);
      if (loggedUser.mustChangePassword) {
        navigate('/staff/set-password');
      } else {
        navigate('/staff/dashboard');
      }
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
          <div className="brand-mark">SN</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px' }}>SubNex</div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
              Internal Workspace
            </div>
          </div>
        </div>

        <h2 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 600 }}>Staff sign in</h2>
        <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: '13px' }}>
          Sign in with your Administrator, Operations Staff, or Finance Lead credentials.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Work email</label>
            <input
              type="email"
              className="form-input"
              required
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <label className="form-label">Password</label>
              <Link
                to="/staff/forgot-password"
                style={{ fontSize: '12px', color: 'var(--accent)', textDecoration: 'none' }}
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
            {submitting ? 'Signing in...' : 'Sign in'}
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
          <div style={{ marginBottom: '8px', fontWeight: 600 }}>Demo Workspace Accounts:</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setEmail('admin@brightloop.test');
                setPassword('Admin@2026!');
              }}
            >
              Admin (Arjun)
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setEmail('riya@brightloop.test');
                setPassword('Staff@2026!');
              }}
            >
              Staff (Riya)
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setEmail('meera@brightloop.test');
                setPassword('Finance@2026!');
              }}
            >
              Finance (Meera)
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: '18px',
            textAlign: 'right',
            fontSize: '12.5px',
          }}
        >
          <Link to="/login" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
            Customer Portal Login
          </Link>
        </div>
      </div>
    </div>
  );
};
