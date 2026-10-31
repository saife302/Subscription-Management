import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';

// Layouts
import { StaffLayout } from './layouts/StaffLayout';
import { CustomerLayout } from './layouts/CustomerLayout';

// Auth Pages
import { CustomerLoginPage } from './pages/auth/CustomerLoginPage';
import { CustomerSignupPage } from './pages/auth/CustomerSignupPage';
import { StaffLoginPage } from './pages/auth/StaffLoginPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { ForceChangePasswordPage } from './pages/auth/ForceChangePasswordPage';
import { ProfilePage } from './pages/auth/ProfilePage';

// Admin Pages
import { UsersPage } from './pages/admin/UsersPage';
import { CatalogPage } from './pages/admin/CatalogPage';
import { TaxesDiscountsPage } from './pages/admin/TaxesDiscountsPage';

// Staff Pages
import { CustomersPage } from './pages/staff/CustomersPage';
import { SubscriptionsPage } from './pages/staff/SubscriptionsPage';
import { SubscriptionDetailPage } from './pages/staff/SubscriptionDetailPage';
import { InvoicesPage } from './pages/staff/InvoicesPage';
import { InvoiceDetailPage } from './pages/staff/InvoiceDetailPage';

// Finance Pages
import { DashboardPage } from './pages/finance/DashboardPage';
import { PaymentsPage } from './pages/finance/PaymentsPage';

// Customer Portal Pages
import { CustomerPortalDashboard } from './pages/customer/CustomerPortalDashboard';
import { CustomerSubscriptionsPage } from './pages/customer/CustomerSubscriptionsPage';
import { CustomerInvoicesPage } from './pages/customer/CustomerInvoicesPage';

const StaffGuard: React.FC<{ roles?: string[]; children: React.ReactNode }> = ({ roles, children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="empty-state">Loading SubNex...</div>;
  if (!user) return <Navigate to="/staff/login" replace />;
  if (user.role === 'customer') return <Navigate to="/portal" replace />;
  if (user.mustChangePassword) return <Navigate to="/staff/set-password" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/staff/dashboard" replace />;
  return <>{children}</>;
};

const CustomerGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="empty-state">Loading SubNex...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'customer') return <Navigate to="/staff/dashboard" replace />;
  return <>{children}</>;
};

const RootRedirect: React.FC = () => {
  const { user, loading } = useAuth();
  if (loading) return <div className="empty-state">Loading SubNex...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'customer') return <Navigate to="/portal" replace />;
  return <Navigate to="/staff/dashboard" replace />;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />

          {/* Customer Auth Routes */}
          <Route path="/login" element={<CustomerLoginPage />} />
          <Route path="/signup" element={<CustomerSignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage portal="customer" />} />
          <Route path="/reset-password" element={<ResetPasswordPage portal="customer" />} />

          {/* Staff Auth Routes */}
          <Route path="/staff/login" element={<StaffLoginPage />} />
          <Route path="/staff/forgot-password" element={<ForgotPasswordPage portal="staff" />} />
          <Route path="/staff/reset-password" element={<ResetPasswordPage portal="staff" />} />
          <Route path="/staff/set-password" element={<ForceChangePasswordPage />} />

          {/* Customer Portal Routes */}
          <Route
            path="/portal"
            element={
              <CustomerGuard>
                <CustomerLayout />
              </CustomerGuard>
            }
          >
            <Route index element={<CustomerPortalDashboard />} />
            <Route path="subscriptions" element={<CustomerSubscriptionsPage />} />
            <Route path="invoices" element={<CustomerInvoicesPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>

          {/* Staff Console Routes */}
          <Route
            path="/staff"
            element={
              <StaffGuard>
                <StaffLayout />
              </StaffGuard>
            }
          >
            <Route index element={<Navigate to="/staff/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="subscriptions" element={<SubscriptionsPage />} />
            <Route path="subscriptions/:id" element={<SubscriptionDetailPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="invoices/:id" element={<InvoiceDetailPage />} />
            <Route
              path="payments"
              element={
                <StaffGuard roles={['admin', 'finance']}>
                  <PaymentsPage />
                </StaffGuard>
              }
            />
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="taxes-discounts" element={<TaxesDiscountsPage />} />
            <Route
              path="users"
              element={
                <StaffGuard roles={['admin']}>
                  <UsersPage />
                </StaffGuard>
              }
            />
            <Route path="profile" element={<ProfilePage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
