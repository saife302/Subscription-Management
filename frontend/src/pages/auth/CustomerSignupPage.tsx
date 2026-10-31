import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest, ApiClientError } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { evaluatePasswordRules } from '../../utils/format';

export const CustomerSignupPage: React.FC = () => {
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Array<{ field: string; message: string }>>([]);
  const [submitting, setSubmitting] = useState(false);

  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const rules = evaluatePasswordRules(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors([]);
    setSubmitting(true);

    try {
      const res = await apiRequest('/auth/customer/signup', {
        method: 'POST',
        body: JSON.stringify({ name, companyName, email, password }),
      });
      loginWithToken(res.data.token, res.data.user);
      navigate('/portal');
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        setFieldErrors(err.details || []);
      } else {
        setError('Unable to create account.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div className="brand-mark">SN</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '18px' }}>SubNex</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Customer Registration
            </div>
          </div>
        </div>

        <h2 style={{ margin: '0 0 6px', fontSize: '20px' }}>Create customer account</h2>
        <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', fontSize: '13px' }}>
          If our team already created a customer record with your email, your portal login will link to it automatically.
        </p>

        {error && (
          <div className="alert alert-error">
            <div>{error}</div>
            {fieldErrors.length > 0 && (
              <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                {fieldErrors.map((fe, idx) => (
                  <li key={idx}>
                    <strong>{fe.field}:</strong> {fe.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Your Name *</label>
            <input
              type="text"
              className="form-input"
              required
              placeholder="Asha Rao"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Company Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="Kite Stores"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Business Email *</label>
            <input
              type="email"
              className="form-input"
              required
              placeholder="asha@kite.test"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password *</label>
            <input
              type="password"
              className="form-input"
              required
              placeholder="Kite@2026!"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>Password requirements:</div>
              <div style={{ color: rules.minLength ? 'var(--success)' : 'var(--text-muted)' }}>
                {rules.minLength ? '✓' : '○'} More than 8 characters (9 or more)
              </div>
              <div style={{ color: rules.hasUpper ? 'var(--success)' : 'var(--text-muted)' }}>
                {rules.hasUpper ? '✓' : '○'} At least one uppercase letter (A-Z)
              </div>
              <div style={{ color: rules.hasLower ? 'var(--success)' : 'var(--text-muted)' }}>
                {rules.hasLower ? '✓' : '○'} At least one lowercase letter (a-z)
              </div>
              <div style={{ color: rules.hasSpecial ? 'var(--success)' : 'var(--text-muted)' }}>
                {rules.hasSpecial ? '✓' : '○'} At least one special character (!@#$...)
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={submitting}
          >
            {submitting ? 'Creating account...' : 'Sign up'}
          </button>
        </form>

        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};
