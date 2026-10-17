import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  CreditCard, Plus, Trash2, Edit2, Check, X, Users, 
  Settings as SettingsIcon, Moon, Sun, Printer, RefreshCw, 
  Send, ShieldCheck, Tag, HelpCircle, CheckCircle, Wrench,
  DollarSign, TrendingUp, Coins, ArrowRightLeft, Eye, EyeOff, Briefcase, Key
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';

function PrinterConfigCard({ printer, availablePrinters, onSave, onTest, isTesting, isSaving, onRefreshPrinters, isRefreshing }) {
  const [form, setForm] = useState({ ...printer });
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setForm({ ...printer });
    setIsDirty(false);
  }, [printer]);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const getMeta = () => {
    if (form.printer_type === 'CASHIER_CHEQUE') {
      return {
        title: "Kassir Cheki Printeri",
        subtitle: "Mijoz uchun to'liq narx va to'lov hisob-kitobi bilan chek",
        badge: "Narx bilan",
        badgeColor: "#2ecc71",
        icon: <CreditCard size={20} style={{ color: '#2ecc71' }} />
      };
    }
    if (form.printer_type === 'WORKER_CHEQUE') {
      return {
        title: "Ishchi Cheki Printeri",
        subtitle: "Ustaxona / Sklad uchun avto raqami va buyurtma ro'yxati (NARXSIZ)",
        badge: "Narxsiz (Ustaxona)",
        badgeColor: "#3498db",
        icon: <Wrench size={20} style={{ color: '#3498db' }} />
      };
    }
    return {
      title: "Chiziqli Belgi (Barcode) Printeri",
      subtitle: "Mahsulotlar uchun dinamik miqdorda etiketkalar chop etish",
      badge: "Barcode / Etiketka",
      badgeColor: "#e67e22",
      icon: <Tag size={20} style={{ color: '#e67e22' }} />
    };
  };

  const meta = getMeta();

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: '16px',
      padding: '24px',
      marginBottom: '24px',
      backgroundColor: form.is_enabled ? 'var(--bg-card)' : 'var(--surface-hover)',
      transition: 'all 0.2s',
      boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ 
            width: '42px', height: '42px', borderRadius: '10px', 
            backgroundColor: 'var(--surface-hover)', display: 'flex', 
            alignItems: 'center', justifyContent: 'center' 
          }}>
            {meta.icon}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{meta.title}</h3>
              <span style={{ 
                fontSize: '0.75rem', fontWeight: 600, padding: '3px 10px', 
                borderRadius: '12px', backgroundColor: `${meta.badgeColor}20`, 
                color: meta.badgeColor 
              }}>
                {meta.badge}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {meta.subtitle}
            </p>
          </div>
        </div>

        {/* Enabled Toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
          <input 
            type="checkbox" 
            checked={form.is_enabled} 
            onChange={e => handleChange('is_enabled', e.target.checked)}
            style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary)' }}
          />
          <span style={{ fontSize: '0.9rem', fontWeight: 500, color: form.is_enabled ? 'var(--text-main)' : 'var(--text-muted)' }}>
            {form.is_enabled ? "Faol" : "O'chiq"}
          </span>
        </label>
      </div>

      {/* Settings Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        
        {/* Connection Type */}
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: '0.85rem' }}>Ulanish turi</label>
          <select 
            value={form.connection_type} 
            onChange={e => handleChange('connection_type', e.target.value)}
            className="input-field"
          >
            <option value="WINDOWS">Windows Spooler (USB / Driver)</option>
            <option value="NETWORK">Tarmoq (TCP/IP Port 9100)</option>
            <option value="DISABLED">O'chirilgan (Disabled)</option>
          </select>
        </div>

        {/* Windows Printer Selection */}
        {form.connection_type === 'WINDOWS' && (
          <div className="input-group" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '0.85rem', margin: 0 }}>Windows Printeri</label>
              <button 
                type="button" 
                onClick={onRefreshPrinters} 
                disabled={isRefreshing}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: 0 }}
                title="Printerlar ro'yxatini yangilash"
              >
                <RefreshCw size={12} className={isRefreshing ? 'spin-icon' : ''} /> Yangilash
              </button>
            </div>
            <select 
              value={form.printer_name} 
              onChange={e => handleChange('printer_name', e.target.value)}
              className="input-field"
            >
              <option value="">-- Printerni tanlang --</option>
              {availablePrinters?.map(pName => (
                <option key={pName} value={pName}>{pName}</option>
              ))}
              {form.printer_name && !availablePrinters?.includes(form.printer_name) && (
                <option value={form.printer_name}>{form.printer_name} (qo'lda kiritilgan)</option>
              )}
            </select>
          </div>
        )}

        {/* Network IP & Port */}
        {form.connection_type === 'NETWORK' && (
          <>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '0.85rem' }}>Printer IP manzili</label>
              <input 
                type="text" 
                value={form.ip_address || ''} 
                onChange={e => handleChange('ip_address', e.target.value)}
                placeholder="192.168.1.100"
                className="input-field"
              />
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '0.85rem' }}>Port (Default 9100)</label>
              <input 
                type="number" 
                value={form.port || 9100} 
                onChange={e => handleChange('port', parseInt(e.target.value) || 9100)}
                placeholder="9100"
                className="input-field"
              />
            </div>
          </>
        )}

        {/* Cheque specific options (Paper Width & Auto-print) */}
        {(form.printer_type === 'CASHIER_CHEQUE' || form.printer_type === 'WORKER_CHEQUE') && (
          <>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '0.85rem' }}>Qog'oz o'lchami</label>
              <select 
                value={form.paper_width} 
                onChange={e => handleChange('paper_width', e.target.value)}
                className="input-field"
              >
                <option value="80MM">80 mm (Katta termal chek)</option>
                <option value="58MM">58 mm (Kichik termal chek)</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', paddingTop: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input 
                  type="checkbox" 
                  checked={form.auto_print} 
                  onChange={e => handleChange('auto_print', e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                />
                <span>Sotuv yakunlanganda avtomatik chop etish</span>
              </label>
            </div>
          </>
        )}

        {/* Barcode specific options */}
        {form.printer_type === 'BARCODE' && (
          <>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '0.85rem' }}>Protokol / Komanda turi</label>
              <select 
                value={form.command_type} 
                onChange={e => handleChange('command_type', e.target.value)}
                className="input-field"
              >
                <option value="TSPL">TSPL (Xprinter, TSC, Godex etiketka printerlari)</option>
                <option value="ESCPOS">ESC/POS (Termal chek printeri orqali)</option>
                <option value="RAW_TEXT">Matn (Plain text)</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                <label style={{ fontSize: '0.85rem' }}>Kengligi (mm)</label>
                <input 
                  type="number" 
                  value={form.label_width || 50} 
                  onChange={e => handleChange('label_width', parseInt(e.target.value) || 50)}
                  className="input-field"
                />
              </div>
              <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                <label style={{ fontSize: '0.85rem' }}>Balandligi (mm)</label>
                <input 
                  type="number" 
                  value={form.label_height || 30} 
                  onChange={e => handleChange('label_height', parseInt(e.target.value) || 30)}
                  className="input-field"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Action Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        <button 
          type="button" 
          className="btn btn-secondary"
          onClick={() => onTest(form.printer_type)}
          disabled={isTesting || !form.is_enabled || form.connection_type === 'DISABLED'}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', padding: '8px 16px' }}
        >
          <Printer size={16} />
          {isTesting ? "Test yuborilmoqda..." : "Test chop etish"}
        </button>

        <div style={{ display: 'flex', gap: '8px' }}>
          {isDirty && (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', alignSelf: 'center', marginRight: '8px' }}>
              O'zgarishlar saqlanmagan
            </span>
          )}
          <button 
            type="button" 
            className="btn btn-primary"
            onClick={() => onSave(form.id, form)}
            disabled={isSaving || !isDirty}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', padding: '8px 20px' }}
          >
            <Check size={16} />
            {isSaving ? "Saqlanmoqda..." : "Saqlash"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('payment_methods');
  
  // Payment Method States
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [methodName, setMethodName] = useState('');
  const [editName, setEditName] = useState('');

  // User States & Helper Functions
  const initialUserForm = { 
    username: '', 
    phone_number: '', 
    first_name: '', 
    last_name: '', 
    job: '', 
    password: '', 
    role: 'WORKER' 
  };

  const generateRandomPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pass = '';
    for (let i = 0; i < 8; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  const generateUsername = (phone = '', firstName = '') => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 7) {
      return `u_${digits.slice(-9)}`;
    }
    const clean = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean) {
      return `${clean}_${Math.floor(100 + Math.random() * 900)}`;
    }
    return `user_${Math.floor(1000 + Math.random() * 9000)}`;
  };

  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [userForm, setUserForm] = useState(initialUserForm);
  const [usernameCustomized, setUsernameCustomized] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleOpenAddUser = () => {
    setEditingUserId(null);
    setUsernameCustomized(false);
    setShowPassword(false);
    const autoUser = generateUsername();
    const autoPass = generateRandomPassword();
    setUserForm({
      username: autoUser,
      phone_number: '',
      first_name: '',
      last_name: '',
      job: '',
      password: autoPass,
      role: 'WORKER'
    });
    setIsAddingUser(true);
  };

  const handleEditUser = (u) => {
    setIsAddingUser(false);
    setEditingUserId(u.id);
    setShowPassword(false);
    setUserForm({
      username: u.username || '',
      phone_number: u.phone_number || '',
      first_name: u.first_name || '',
      last_name: u.last_name || '',
      job: u.job || '',
      password: '',
      role: u.role || 'WORKER'
    });
  };

  const handlePhoneChange = (val) => {
    setUserForm(prev => {
      const updated = { ...prev, phone_number: val };
      if (!usernameCustomized && !editingUserId) {
        updated.username = generateUsername(val, prev.first_name);
      }
      return updated;
    });
  };

  const handleFirstNameChange = (val) => {
    setUserForm(prev => {
      const updated = { ...prev, first_name: val };
      if (!usernameCustomized && !editingUserId && !prev.phone_number) {
        updated.username = generateUsername('', val);
      }
      return updated;
    });
  };

  const handleRegenerateUsername = () => {
    const newU = generateUsername(userForm.phone_number, userForm.first_name);
    setUserForm(prev => ({ ...prev, username: newU }));
  };

  const handleRegeneratePassword = () => {
    const newP = generateRandomPassword();
    setUserForm(prev => ({ ...prev, password: newP }));
  };
  
  // Currency States
  const { data: currencyData, isLoading: currencyLoading } = useQuery({
    queryKey: ['currency-settings'],
    queryFn: async () => {
      const res = await api.get('currency-settings/current/');
      return res.data;
    }
  });

  const [newRateInput, setNewRateInput] = useState('');
  useEffect(() => {
    if (currencyData?.rate_in_uzs) {
      setNewRateInput(String(parseFloat(currencyData.rate_in_uzs)));
    }
  }, [currencyData]);

  const updateCurrencyMutation = useMutation({
    mutationFn: (rate) => api.post('currency-settings/set-rate/', { rate }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['currency-settings'] });
      queryClient.invalidateQueries({ queryKey: ['currency-current'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventories'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stats'] });
      toast.success(res.data?.detail || "Valyuta kursi muvaffaqiyatli saqlandi va barcha mahsulotlar yangilandi!");
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || "Valyuta kursini saqlashda xatolik");
    }
  });

  // Theme State
  const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');

  // Queries
  const { data: methods, isLoading: methodsLoading } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => {
      const res = await api.get('payment-methods/?page_size=100');
      return res.data?.results || (Array.isArray(res.data) ? res.data : []);
    }
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('users/?page_size=100');
      return res.data?.results || (Array.isArray(res.data) ? res.data : []);
    }
  });

  // Printer Queries & Mutations
  const { data: printers, isLoading: printersLoading } = useQuery({
    queryKey: ['printers'],
    queryFn: async () => {
      const res = await api.get('printers/');
      return res.data.results || res.data;
    }
  });

  const { 
    data: availablePrinters, 
    refetch: refetchPrinters, 
    isFetching: isFetchingPrinters 
  } = useQuery({
    queryKey: ['available-printers'],
    queryFn: async () => {
      const res = await api.get('printers/available-printers/');
      return res.data.printers || [];
    }
  });

  const updatePrinterMutation = useMutation({
    mutationFn: ({ id, payload }) => api.patch(`printers/${id}/`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printers'] });
      toast.success('Printer sozlamalari saqlandi!');
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Printer sozlamalarini saqlashda xatolik');
    }
  });

  const [testingType, setTestingType] = useState(null);
  const testPrintMutation = useMutation({
    mutationFn: (printer_type) => api.post('printers/test-print/', { printer_type }),
    onSuccess: (res) => {
      toast.success(res.data.detail || 'Test muvaffaqiyatli chop etildi');
      setTestingType(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Test chop etishda xatolik yuz berdi');
      setTestingType(null);
    }
  });

  const handleTestPrint = (printer_type) => {
    setTestingType(printer_type);
    testPrintMutation.mutate(printer_type);
  };

  // Payment Method Mutations
  const createMethodMutation = useMutation({
    mutationFn: (name) => api.post('payment-methods/', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      toast.success('To\'lov usuli qo\'shildi');
      setIsAdding(false);
      setMethodName('');
    },
    onError: () => toast.error('To\'lov usulini qo\'shishda xatolik')
  });

  const updateMethodMutation = useMutation({
    mutationFn: ({ id, name }) => api.put(`payment-methods/${id}/`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      toast.success('To\'lov usuli yangilandi');
      setEditingId(null);
    },
    onError: () => toast.error('Yangilashda xatolik')
  });

  const deleteMethodMutation = useMutation({
    mutationFn: (id) => api.delete(`payment-methods/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      toast.success('To\'lov usuli o\'chirildi');
    },
    onError: () => toast.error('O\'chirishda xatolik')
  });

  // User Mutations
  const createUserMutation = useMutation({
    mutationFn: (payload) => api.post('users/', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Foydalanuvchi muvaffaqiyatli yaratildi');
      setIsAddingUser(false);
      setUserForm(initialUserForm);
    },
    onError: (err) => {
      const msg = err.response?.data?.username?.[0] || err.response?.data?.phone_number?.[0] || 'Foydalanuvchini yaratishda xatolik';
      toast.error(msg);
    }
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, payload }) => api.patch(`users/${id}/`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Foydalanuvchi muvaffaqiyatli yangilandi');
      setEditingUserId(null);
      setUserForm(initialUserForm);
    },
    onError: (err) => {
      const msg = err.response?.data?.username?.[0] || err.response?.data?.phone_number?.[0] || 'Foydalanuvchini yangilashda xatolik';
      toast.error(msg);
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id) => api.delete(`users/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Foydalanuvchi muvaffaqiyatli o\'chirildi');
    },
    onError: () => toast.error('Foydalanuvchini o\'chirishda xatolik')
  });

  const toggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    setIsDark(!isDark);
  };

  return (
    <div style={{ padding: '32px', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', color: 'var(--primary)', marginBottom: '8px' }}>Sozlamalar</h1>
          <p style={{ color: 'var(--text-muted)' }}>Dastur sozlamalari, printerlar va ma'lumotlarni boshqarish.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {[
          { id: 'payment_methods', label: 'To\'lov usullari', icon: <CreditCard size={18} /> },
          { id: 'currency', label: 'Valyuta kursi (USD)', icon: <DollarSign size={18} /> },
          { id: 'users', label: 'Xodimlar va foydalanuvchilar', icon: <Users size={18} /> },
          { id: 'printers', label: 'Printerlar (Chek & Barcode)', icon: <Printer size={18} /> },
          { id: 'preferences', label: 'Afzalliklar', icon: <SettingsIcon size={18} /> },
        ].map(tab => (
          <button 
            key={tab.id} 
            onClick={() => setActiveTab(tab.id)} 
            style={{ 
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px 24px', backgroundColor: 'transparent', border: 'none', 
              borderBottom: activeTab === tab.id ? '3px solid var(--primary)' : '3px solid transparent', 
              color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)', 
              fontWeight: 600, fontSize: '1rem', cursor: 'pointer', transition: 'all 0.2s',
              whiteSpace: 'nowrap'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ maxWidth: '900px' }}>
        
        {/* PAYMENT METHODS TAB */}
        {activeTab === 'payment_methods' && (
          <div>
            <div className="flex-between mb-4">
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CreditCard style={{ color: 'var(--primary)' }} /> To'lov usullari
              </h2>
              <button className="btn btn-primary" onClick={() => setIsAdding(true)}>
                <Plus size={18} /> Usul qo'shish
              </button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>Savdo nuqtasi uchun mavjud to'lov usullarini sozlash.</p>

            {isAdding && (
              <form onSubmit={(e) => { e.preventDefault(); if(methodName.trim()) createMethodMutation.mutate(methodName.trim()); }} style={{ display: 'flex', gap: '12px', marginBottom: '16px', background: 'var(--surface-hover)', padding: '16px', borderRadius: '12px' }}>
                <input autoFocus type="text" className="input-field" placeholder="M-n, Naqd pul, Plastik karta, Click..." value={methodName} onChange={(e) => setMethodName(e.target.value)} style={{ flex: 1, marginBottom: 0 }} />
                <button type="submit" className="btn btn-success" style={{ background: '#2ecc71', color: 'white' }}>Saqlash</button>
                <button type="button" className="btn btn-secondary" onClick={() => { setIsAdding(false); setMethodName(''); }}>Bekor qilish</button>
              </form>
            )}

            {methodsLoading ? <p>Yuklanmoqda...</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {methods?.map(method => (
                  <div key={method.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', border: '1px solid var(--border)', borderRadius: '12px', backgroundColor: 'var(--bg-color)' }}>
                    {editingId === method.id ? (
                      <div style={{ display: 'flex', gap: '12px', flex: 1, marginRight: '16px' }}>
                        <input autoFocus type="text" className="input-field" value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && updateMethodMutation.mutate({ id: method.id, name: editName.trim() })} style={{ marginBottom: 0 }} />
                        <button className="btn-icon" style={{ color: '#2ecc71' }} onClick={() => updateMethodMutation.mutate({ id: method.id, name: editName.trim() })}><Check size={20} /></button>
                        <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => setEditingId(null)}><X size={20} /></button>
                      </div>
                    ) : (
                      <>
                        <span style={{ fontWeight: 500 }}>{method.name}</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn-icon" onClick={() => { setEditingId(method.id); setEditName(method.name); }}><Edit2 size={18} /></button>
                          <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => { if(window.confirm('Ishonchingiz komilmi?')) deleteMethodMutation.mutate(method.id) }}><Trash2 size={18} /></button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {methods?.length === 0 && !isAdding && <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>To'lov usullari sozlanmagan.</p>}
              </div>
            )}
          </div>
        )}

        {/* CURRENCY SETTINGS TAB */}
        {activeTab === 'currency' && (
          <div>
            <div className="flex-between mb-4">
              <div>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <DollarSign style={{ color: 'var(--primary)' }} /> Valyuta kursi sozlamalari (USD / UZS)
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
                  Mahsulotlar va tovar kirimi uchun AQSH dollari kursi. Kurs o'zgarganda barcha mahsulotlarning so'mdagi narxi darhol qayta hisoblanadi.
                </p>
              </div>
            </div>

            {/* Current Rate Banner */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '16px',
              padding: '24px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '14px',
                  backgroundColor: 'var(--primary)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.35)'
                }}>
                  <DollarSign size={32} />
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                    Hozirgi faol kurs (USD)
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '2px' }}>
                    1 USD = <span style={{ color: 'var(--primary)' }}>{currencyLoading ? '...' : parseFloat(currencyData?.rate_in_uzs || 12500).toLocaleString()}</span> UZS
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <CheckCircle size={14} /> Barcha mahsulotlar real vaqtda sinxronlangan
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--surface)', padding: '12px 18px', borderRadius: '12px', border: '1px solid var(--border)', textAlign: 'right' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>Valyuta kodi</span>
                <strong style={{ fontSize: '1.1rem', color: 'var(--text-main)' }}>USD ($)</strong>
              </div>
            </div>

            {/* Set Rate Form */}
            <div style={{
              backgroundColor: 'var(--surface)',
              borderRadius: '16px',
              border: '1px solid var(--border)',
              padding: '24px',
              marginBottom: '24px'
            }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={20} style={{ color: 'var(--primary)' }} /> Yangi kursni belgilash
              </h3>

              <div className="input-group" style={{ marginBottom: '16px' }}>
                <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>1 AQSH Dollari (USD) qiymati (so'mda):</label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', flex: '1 1 240px' }}>
                    <input 
                      type="number"
                      step="1"
                      className="input-field" 
                      placeholder="M-n. 12500"
                      value={newRateInput}
                      onChange={(e) => setNewRateInput(e.target.value)}
                      style={{ fontSize: '1.2rem', fontWeight: 600, paddingRight: '70px', marginBottom: 0 }}
                    />
                    <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 600 }}>
                      UZS
                    </span>
                  </div>

                  <button 
                    type="button" 
                    className="btn btn-primary"
                    disabled={updateCurrencyMutation.isPending || !newRateInput || parseFloat(newRateInput) <= 0}
                    onClick={() => {
                      const val = parseFloat(newRateInput);
                      if (!val || val <= 0) {
                        toast.error("Iltimos, to'g'ri kurs qiymatini kiriting");
                        return;
                      }
                      if (window.confirm(`Haqiqatan ham USD kursini 1 USD = ${val.toLocaleString()} UZS ga o'zgartirmoqchimisiz? Tizimdagi barcha mahsulotlarning narxi ushbu kurs bo'yicha qayta hisoblanadi.`)) {
                        updateCurrencyMutation.mutate(val);
                      }
                    }}
                    style={{ padding: '12px 24px', fontSize: '1rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Check size={18} />
                    {updateCurrencyMutation.isPending ? "Yangilanmoqda..." : "Kursni saqlash va yangilash"}
                  </button>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
                  Tezkor tanlovlar (Ommabop kurslar):
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[12500, 12600, 12700, 12800, 12900, 13000, 13200].map(ratePreset => (
                    <button
                      key={ratePreset}
                      type="button"
                      onClick={() => setNewRateInput(String(ratePreset))}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '20px',
                        border: String(ratePreset) === String(newRateInput) ? '1px solid var(--primary)' : '1px solid var(--border)',
                        backgroundColor: String(ratePreset) === String(newRateInput) ? 'rgba(59, 130, 246, 0.15)' : 'var(--surface-hover)',
                        color: String(ratePreset) === String(newRateInput) ? 'var(--primary)' : 'var(--text-main)',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      {ratePreset.toLocaleString()} UZS
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Calculation Preview */}
            <div style={{
              backgroundColor: 'var(--surface-hover)',
              borderRadius: '14px',
              padding: '20px',
              border: '1px solid var(--border)'
            }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Coins size={16} /> Yangi kurs bo'yicha hisob-kitob namunasi:
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                {[1, 5, 10, 50, 100].map(usdAmount => {
                  const rateVal = parseFloat(newRateInput) || parseFloat(currencyData?.rate_in_uzs) || 12500;
                  const uzsVal = usdAmount * rateVal;
                  return (
                    <div key={usdAmount} style={{
                      backgroundColor: 'var(--surface)',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      border: '1px solid var(--border)'
                    }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>${usdAmount} USD =</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '2px' }}>
                        {uzsVal.toLocaleString()} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)' }}>so'm</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Note alert */}
            <div style={{
              marginTop: '20px',
              padding: '14px 18px',
              borderRadius: '12px',
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              display: 'flex',
              gap: '12px',
              alignItems: 'center'
            }}>
              <HelpCircle size={20} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.4 }}>
                <strong>Qanday ishlaydi?</strong> Tizimdagi har bir mahsulot o'zining USD qiymatini saqlab turadi. Kursni o'zgartirganingizda, barcha mahsulotlarning so'mdagi tan narxi va sotuv narxi shu zahoti yangilanadi. Tovarlar kirimi va yangi mahsulot qo'shganda ham narxni USD da kiritishingiz mumkin.
              </div>
            </div>
          </div>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <div>
            <div className="flex-between mb-4">
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users style={{ color: 'var(--primary)' }} /> Xodimlar va foydalanuvchilar
              </h2>
              <button className="btn btn-primary" onClick={handleOpenAddUser}>
                <Plus size={18} /> Foydalanuvchi qo'shish
              </button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>Xodimlar hisoblari va kirish huquqlarini boshqarish.</p>

            {(isAddingUser || editingUserId) && (
              <form onSubmit={(e) => { 
                e.preventDefault(); 
                const payload = { ...userForm };
                if (!payload.password) delete payload.password;
                
                if (editingUserId) {
                  updateUserMutation.mutate({ id: editingUserId, payload });
                } else {
                  createUserMutation.mutate(payload); 
                }
              }} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px', background: 'var(--surface-hover)', padding: '24px', borderRadius: '12px' }}>
                <h3 style={{ margin: '0 0 8px 0' }}>{editingUserId ? 'Foydalanuvchini tahrirlash' : 'Yangi foydalanuvchi qo\'shish'}</h3>
                
                {/* First Name & Last Name */}
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Ism</label>
                    <input type="text" className="input-field" required value={userForm.first_name} onChange={e => handleFirstNameChange(e.target.value)} placeholder="Ismi" />
                  </div>
                  <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Familiya</label>
                    <input type="text" className="input-field" required value={userForm.last_name} onChange={e => setUserForm({...userForm, last_name: e.target.value})} placeholder="Familiyasi" />
                  </div>
                </div>

                {/* Phone & Username */}
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Telefon raqami (Asosiy login raqami)</label>
                    <input type="text" className="input-field" required value={userForm.phone_number} onChange={e => handlePhoneChange(e.target.value)} placeholder="+998901234567" />
                  </div>
                  <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ margin: 0 }}>Foydalanuvchi nomi (Username)</label>
                      <button 
                        type="button" 
                        onClick={handleRegenerateUsername}
                        style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
                        title="Yangi username yaratish"
                      >
                        <RefreshCw size={12} /> Avto-yaratish
                      </button>
                    </div>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={userForm.username} 
                      onChange={e => {
                        setUsernameCustomized(true);
                        setUserForm({...userForm, username: e.target.value});
                      }} 
                      placeholder="foydalanuvchi_nomi" 
                    />
                  </div>
                </div>

                {/* Password & Job */}
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ margin: 0 }}>Maxfiy so'z {editingUserId && '(O\'zgartirmaslik uchun bo\'sh qoldiring)'}</label>
                      {!editingUserId && (
                        <button 
                          type="button" 
                          onClick={handleRegeneratePassword}
                          style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
                          title="Yangi parol yaratish"
                        >
                          <RefreshCw size={12} /> Yangi parol
                        </button>
                      )}
                    </div>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input 
                        type={showPassword ? "text" : "password"} 
                        className="input-field" 
                        required={!editingUserId} 
                        value={userForm.password} 
                        onChange={e => setUserForm({...userForm, password: e.target.value})} 
                        placeholder={editingUserId ? "O'zgartirmaslik uchun bo'sh qoldiring" : "Maxfiy so'z"}
                        style={{ paddingRight: '40px' }}
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)}
                        style={{ position: 'absolute', right: '10px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex' }}
                        title={showPassword ? "Yashirish" : "Ko'rsatish"}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  
                  <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Kasbi / Vazifasi (Job)</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={userForm.job || ''} 
                      onChange={e => setUserForm({...userForm, job: e.target.value})} 
                      placeholder="Masalan: Usta, Moy almashtiruvchi, Menejer..." 
                    />
                  </div>
                </div>

                {/* Role */}
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Lavozimi (Tizimdagi huquqi)</label>
                  <select className="input-field" value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})}>
                    <option value="ADMIN">Ma'mur (Admin)</option>
                    <option value="MANAGER">Boshqaruvchi (Manager)</option>
                    <option value="CASHIER">G'aznachi (Cashier)</option>
                    <option value="WORKER">Ishchi (Worker)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => { setIsAddingUser(false); setEditingUserId(null); setUserForm(initialUserForm); }}>Bekor qilish</button>
                  <button type="submit" className="btn btn-primary" disabled={createUserMutation.isPending || updateUserMutation.isPending}>Foydalanuvchini saqlash</button>
                </div>
              </form>
            )}

            {usersLoading ? <p>Yuklanmoqda...</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ backgroundColor: 'var(--surface-hover)' }}>
                  <tr>
                    <th style={{ padding: '12px 14px' }}>Ism va familiya</th>
                    <th style={{ padding: '12px 14px' }}>Login (Username)</th>
                    <th style={{ padding: '12px 14px' }}>Telefon</th>
                    <th style={{ padding: '12px 14px' }}>Kasbi / Vazifasi</th>
                    <th style={{ padding: '12px 14px' }}>Lavozimi</th>
                    <th style={{ textAlign: 'right', padding: '12px 14px' }}>Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {users?.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ fontWeight: 500, padding: '12px 14px' }}>{u.first_name} {u.last_name}</td>
                      <td style={{ color: 'var(--primary)', fontWeight: 600, padding: '12px 14px' }}>{u.username || '-'}</td>
                      <td style={{ color: 'var(--text-muted)', padding: '12px 14px' }}>{u.phone_number || '-'}</td>
                      <td style={{ padding: '12px 14px' }}>
                        {u.job ? (
                          <span style={{ background: 'var(--surface-hover)', border: '1px solid var(--border)', padding: '3px 8px', borderRadius: '6px', fontSize: '0.85rem' }}>
                            {u.job}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}><span className="badge badge-primary">{u.role}</span></td>
                      <td style={{ textAlign: 'right', padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button className="btn-icon" onClick={() => handleEditUser(u)} title="Tahrirlash"><Edit2 size={16} /></button>
                          <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => { if(window.confirm('Ishonchingiz komilmi?')) deleteUserMutation.mutate(u.id); }} title="O'chirish"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* PRINTERS TAB */}
        {activeTab === 'printers' && (
          <div>
            <div className="flex-between mb-4">
              <div>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Printer style={{ color: 'var(--primary)' }} /> Printerlar sozlamasi
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
                  Serverdan to'g'ridan-to'g'ri chop etish uchun chek va barcode printerlarini sozlang.
                </p>
              </div>
              <button 
                className="btn btn-secondary" 
                onClick={() => refetchPrinters()}
                disabled={isFetchingPrinters}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
              >
                <RefreshCw size={14} className={isFetchingPrinters ? 'spin-icon' : ''} />
                Printerni tekshirish
              </button>
            </div>

            {/* Quick Helper Notice */}
            <div style={{
              backgroundColor: 'rgba(52, 152, 219, 0.08)',
              border: '1px solid rgba(52, 152, 219, 0.2)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start'
            }}>
              <HelpCircle size={20} style={{ color: '#3498db', marginTop: '2px', flexShrink: 0 }} />
              <div style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>
                <strong>To'g'ridan-to'g'ri chop etish haqida:</strong>
                <ul style={{ margin: '6px 0 0 0', paddingLeft: '20px' }}>
                  <li><strong>Kassir cheki:</strong> Mijozga taqdim etiladi, to'liq narx va jami summa bilan.</li>
                  <li><strong>Ishchi cheki:</strong> Ustaxona mexaniklariga beriladi, faqat avtomobil ma'lumoti va ishlar ro'yxati (<strong>narxlarsiz</strong>).</li>
                  <li><strong>Chiziqli belgi (Barcode):</strong> Mahsulotga yopishtirish uchun dinamik miqdorda etiketkalar chop etadi.</li>
                </ul>
              </div>
            </div>

            {printersLoading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Printer sozlamalari yuklanmoqda...
              </div>
            ) : (
              <div>
                {printers?.map(printer => (
                  <PrinterConfigCard 
                    key={printer.id}
                    printer={printer}
                    availablePrinters={availablePrinters || []}
                    onSave={(id, payload) => updatePrinterMutation.mutate({ id, payload })}
                    onTest={handleTestPrint}
                    isTesting={testingType === printer.printer_type}
                    isSaving={updatePrinterMutation.isPending}
                    onRefreshPrinters={() => refetchPrinters()}
                    isRefreshing={isFetchingPrinters}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* PREFERENCES TAB */}
        {activeTab === 'preferences' && (
          <div>
            <div className="flex-between mb-4">
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <SettingsIcon style={{ color: 'var(--primary)' }} /> Afzalliklar
              </h2>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px', border: '1px solid var(--border)', borderRadius: '12px', backgroundColor: 'var(--bg-color)' }}>
              <div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem' }}>Qorong'i rejim</h3>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Yorug' va qorong'i mavzuni o'zgartirish.</p>
              </div>
              <button 
                onClick={toggleTheme} 
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', 
                  borderRadius: '30px', border: 'none', cursor: 'pointer', fontWeight: 'bold',
                  backgroundColor: isDark ? '#374151' : '#f3f4f6', 
                  color: isDark ? '#fff' : '#111827',
                  transition: 'all 0.3s'
                }}
              >
                {isDark ? <Moon size={18} /> : <Sun size={18} />}
                {isDark ? 'Qorong\'i rejim yoqilgan' : 'Yorug\' rejim yoqilgan'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
