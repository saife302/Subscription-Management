import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const StaffLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/staff/login');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">S</div>
          <div>
            <div className="brand-title">SubNex</div>
            <div className="brand-subtitle">Staff Console</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Operations</div>
          <NavLink
            to="/staff/dashboard"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span>📊</span> Dashboard & Reports
          </NavLink>
          <NavLink
            to="/staff/subscriptions"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span>🔄</span> Subscriptions
          </NavLink>
          <NavLink
            to="/staff/invoices"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span>🧾</span> Invoices & Billing
          </NavLink>
          <NavLink
            to="/staff/payments"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span>💳</span> Payments
          </NavLink>
          <NavLink
            to="/staff/customers"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span>🏢</span> Customers
          </NavLink>

          <div className="sidebar-section-label">Catalog & Config</div>
          <NavLink
            to="/staff/catalog"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span>📦</span> Products, Plans & Templates
          </NavLink>
          <NavLink
            to="/staff/taxes-discounts"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span>🏷️</span> Taxes & Discounts
          </NavLink>

          {user?.role === 'admin' && (
            <>
              <div className="sidebar-section-label">Administration</div>
              <NavLink
                to="/staff/users"
                className={({ isActive }) =>
                  `nav-link ${isActive ? 'active' : ''}`
                }
              >
                <span>👥</span> Users & CSV Import
              </NavLink>
            </>
          )}

          <div className="sidebar-section-label">Account</div>
          <NavLink
            to="/staff/profile"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span>⚙️</span> Profile & Password
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-pill">
            <div className="user-info">
              <div className="user-name">{user?.name}</div>
              <div className="user-role">
                {user?.role === 'finance'
                  ? 'Finance Lead'
                  : user?.role === 'staff'
                  ? 'Internal Staff'
                  : 'Admin'}
              </div>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleLogout}
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
            SubNex Subscription & Billing Management •{' '}
            <span className="mono" style={{ fontSize: '12px' }}>
              Asia/Kolkata (IST)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="badge badge-info">{user?.email}</span>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
