import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const CustomerLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="customer-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="brand-mark">S</div>
            <div>
              <div className="brand-title">SubNex</div>
              <div className="brand-subtitle">Customer Portal</div>
            </div>
          </div>

          <nav className="customer-nav">
            <NavLink
              to="/portal"
              end
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              Overview
            </NavLink>
            <NavLink
              to="/portal/subscriptions"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              My Subscriptions
            </NavLink>
            <NavLink
              to="/portal/invoices"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              My Invoices
            </NavLink>
            <NavLink
              to="/portal/profile"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              Profile & Security
            </NavLink>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>{user?.name}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              {user?.customer?.name || user?.email}
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="page-content" style={{ flex: 1 }}>
        <Outlet />
      </main>
    </div>
  );
};
