import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, Package, Wallet, Users, Settings, LogOut, Clock, FileText, Wrench } from 'lucide-react';
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
    { path: '/clients', icon: <Users size={20} />, label: 'Mijozlar' },
    { path: '/settings', icon: <Settings size={20} />, label: 'Sozlamalar' },
  ];

  return (
    <aside style={{ width: '260px', minWidth: '260px', flexShrink: 0, backgroundColor: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
      <div style={{ padding: '32px 24px', fontSize: '1.75rem', fontWeight: 'bold', color: 'transparent', background: 'linear-gradient(135deg, var(--primary), #8b5cf6)', WebkitBackgroundClip: 'text' }}>
        AvtoXizmat
      </div>
      <nav style={{ flex: 1, padding: '0 12px' }}>
        {navItems.map(item => (
          <Link 
            key={item.path} 
            to={item.path}
            style={{
              display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', borderRadius: '12px',
              color: location.pathname === item.path ? 'var(--primary)' : 'var(--text-muted)',
              background: location.pathname === item.path ? 'linear-gradient(90deg, var(--primary-light), transparent)' : 'transparent',
              borderLeft: location.pathname === item.path ? '3px solid var(--primary)' : '3px solid transparent',
              textDecoration: 'none', fontWeight: 600, marginBottom: '6px', transition: 'all 0.2s'
            }}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
      <div style={{ padding: '24px' }}>
        <button 
          onClick={async () => {
            try {
              // Ignore failure if already logged out on server
              await api.post('auth/logout/');
            } catch (e) {}
            logout();
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '14px 18px',
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
            <div style={{ display: 'flex', height: '100vh', backgroundColor: 'var(--bg-color)', color: 'var(--text-main)' }}>
              <Sidebar />
              <main style={{ flex: 1, overflow: 'auto' }}>
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
