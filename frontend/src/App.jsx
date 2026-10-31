import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, Package, Wallet, Users, Settings, LogOut, Clock, FileText, Wrench, Building2 } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useAuthStore from './store';
import './index.css';

import POS from './pages/POS';
import Login from './pages/Login';
import Inventory from './pages/Inventory';
import Clients from './pages/Clients';
import CashFlow from './pages/CashFlow';
import Sales from './pages/Sales';
import Shifts from './pages/Shifts';
import WorkerTabs from './pages/WorkerTabs';
import OrganizationTabs from './pages/OrganizationTabs';

import Dashboard from './pages/Dashboard';
import SettingsPage from './pages/Settings';
import Debts from './pages/Debts';
const queryClient = new QueryClient();

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function Sidebar() {
  const location = useLocation();
  const logout = useAuthStore(state => state.logout);

  const navItems = [
    { path: '/', icon: <LayoutDashboard size={20} />, label: 'Boshqaruv paneli' },
    { path: '/pos', icon: <ShoppingBag size={20} />, label: 'Savdo nuqtasi' },
    { path: '/shifts', icon: <Clock size={20} />, label: 'Smenalar' },
    { path: '/inventory', icon: <Package size={20} />, label: 'Ombor' },
    { path: '/sales', icon: <ShoppingBag size={20} />, label: 'Sotuvlar tarixi' },
    { path: '/cashflow', icon: <Wallet size={20} />, label: 'Pul oqimi' },
    { path: '/debts', icon: <FileText size={20} />, label: 'Tashqi qarzlar' },
    { path: '/worker-tabs', icon: <Wrench size={20} />, label: 'Ustalar hisobi (Tabel)' },
    { path: '/organizations', icon: <Building2 size={20} />, label: 'Tashkilotlar (Fakturalar)' },
    { path: '/clients', icon: <Users size={20} />, label: 'Mijozlar' },
    { path: '/settings', icon: <Settings size={20} />, label: 'Sozlamalar' },
  ];

  return (
    <aside style={{ width: '260px', minWidth: '260px', maxWidth: '260px', flexShrink: 0, backgroundColor: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh', overflow: 'hidden', zIndex: 10 }}>
      <div style={{ padding: '20px 20px 14px', fontSize: '1.5rem', fontWeight: 'bold', color: 'transparent', background: 'linear-gradient(135deg, var(--primary), #8b5cf6)', WebkitBackgroundClip: 'text', flexShrink: 0 }}>
        AvtoXizmat
      </div>
      <nav style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '0 8px', scrollbarWidth: 'thin' }}>
        {navItems.map(item => (
          <Link 
            key={item.path} 
            to={item.path}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 12px', borderRadius: '10px', fontSize: '0.86rem', whiteSpace: 'nowrap',
              color: location.pathname === item.path ? 'var(--primary)' : 'var(--text-muted)',
              background: location.pathname === item.path ? 'linear-gradient(90deg, var(--primary-light), transparent)' : 'transparent',
              borderLeft: location.pathname === item.path ? '3px solid var(--primary)' : '3px solid transparent',
              textDecoration: 'none', fontWeight: 600, marginBottom: '3px', transition: 'all 0.15s'
            }}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button 
          onClick={async () => {
            try {
              // Ignore failure if already logged out on server
              await api.post('auth/logout/');
            } catch (e) {}
            logout();
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px', fontSize: '0.86rem',
            borderRadius: '12px', border: 'none', backgroundColor: 'var(--danger-light)',
            color: 'var(--danger)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
          }}
          onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--danger)' }
          onMouseOut={e => e.currentTarget.style.backgroundColor = 'var(--danger-light)' }
          className="btn-danger"
        >
          <LogOut size={20} /> Chiqish
        </button>
      </div>
    </aside>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/*" element={
          <ProtectedRoute>
            <div style={{ display: 'flex', height: '100vh', maxHeight: '100vh', overflow: 'hidden', backgroundColor: 'var(--bg-color)', color: 'var(--text-main)' }}>
              <Sidebar />
              <main style={{ flex: 1, height: '100vh', maxHeight: '100vh', overflowY: 'auto', overflowX: 'hidden' }}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/pos" element={<POS />} />
                  <Route path="/shifts" element={<Shifts />} />
                  <Route path="/inventory" element={<Inventory />} />
                  <Route path="/sales" element={<Sales />} />
                  <Route path="/cashflow" element={<CashFlow />} />
                  <Route path="/debts" element={<Debts />} />
                  <Route path="/worker-tabs" element={<WorkerTabs />} />
                  <Route path="/ustalar" element={<WorkerTabs />} />
                  <Route path="/organizations" element={<OrganizationTabs />} />
                  <Route path="/tashkilotlar" element={<OrganizationTabs />} />
                  <Route path="/clients" element={<Clients />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Routes>
              </main>
            </div>
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
    </QueryClientProvider>
  );
}

export default App;
