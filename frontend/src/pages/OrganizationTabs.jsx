import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Building2, Users, Calendar, DollarSign, Plus, CheckCircle2, 
  AlertCircle, Car, ChevronLeft, ChevronRight, Wallet, RefreshCw, 
  FileSpreadsheet, ArrowDownRight, Settings, Clock, AlertTriangle, 
  X, ShoppingBag, Package, Eye, ChevronDown, ChevronUp, FileText, 
  CreditCard, Edit3, ArrowRight, Check, Search
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import useAuthStore from '../store';
import StatHelpTooltip from '../components/StatHelpTooltip';

const formatMoney = (amount) => {
  return Number(amount || 0).toLocaleString('uz-UZ') + " so'm";
};

const getCurrentYearMonth = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

export default function OrganizationTabs() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  // Period / Filters
  const [selectedMonth, setSelectedMonth] = useState(getCurrentYearMonth());
  const [selectedOrgId, setSelectedOrgId] = useState('all');
  const [activeSubTab, setActiveSubTab] = useState('unpaid_invoices'); // 'unpaid_invoices' | 'all_sales' | 'transactions'
  const [tabSearch, setTabSearch] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [expandedSaleIds, setExpandedSaleIds] = useState({});

  // Modals
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState({
    client_id: '',
    sale_id: null,
    sale_info: null,
    amount: '',
    payment_method: 'BANK_TRANSFER',
    note: ''
  });

  const [showBulkPayModal, setShowBulkPayModal] = useState(false);
  const [bulkPayForm, setBulkPayForm] = useState({
    client_id: '',
    amount: '',
    payment_method: 'BANK_TRANSFER',
    note: ''
  });

  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositForm, setDepositForm] = useState({
    client_id: '',
    amount: '',
    payment_method: 'BANK_TRANSFER',
    note: ''
  });

  const [showEditOrgModal, setShowEditOrgModal] = useState(false);
  const [editOrgForm, setEditOrgForm] = useState({
    client_id: '',
    name: '',
    phone_number: '',
    inn: '',
    account_number: ''
  });

  const [showNewOrgModal, setShowNewOrgModal] = useState(false);
  const [newOrgForm, setNewOrgForm] = useState({
    name: '',
    phone_number: '',
    inn: '',
    account_number: ''
  });

  // Queries
  const { data: allOrgsData, isLoading: isAllLoading, refetch: refetchAll } = useQuery({
    queryKey: ['organization-tabs', selectedMonth],
    queryFn: async () => {
      const res = await api.get(`organization-tabs/?month=${selectedMonth}`);
      return res.data;
    },
    refetchInterval: 15000
  });

  const { data: singleOrgData, isLoading: isSingleLoading, refetch: refetchSingle } = useQuery({
    queryKey: ['organization-tab', selectedOrgId, selectedMonth],
    queryFn: async () => {
      const res = await api.get(`organization-tabs/${selectedOrgId}/?month=${selectedMonth}`);
      return res.data;
    },
    enabled: selectedOrgId !== 'all' && !!selectedOrgId,
    refetchInterval: 15000
  });

  const organizationsList = useMemo(() => {
    return allOrgsData?.organizations || [];
  }, [allOrgsData]);

  const currentOrgObj = useMemo(() => {
    if (selectedOrgId === 'all') return null;
    return organizationsList.find(o => String(o.id) === String(selectedOrgId)) || null;
  }, [organizationsList, selectedOrgId]);

  // Overall KPI sums across all organizations
  const allOrgsKPIs = useMemo(() => {
    let billed = 0;
    let paid = 0;
    let debt = 0;
    let deposits = 0;
    let lockedCommissions = 0;
    let openInvoices = 0;

    organizationsList.forEach(o => {
      billed += Number(o.total_billed || 0);
      paid += Number(o.total_paid || 0);
      debt += Number(o.total_debt || 0);
      deposits += Number(o.credit_deposit_balance || 0);
      lockedCommissions += Number(o.locked_worker_commissions || 0);
      openInvoices += Number(o.open_sales_count || 0);
    });

    return { billed, paid, debt, deposits, lockedCommissions, openInvoices };
  }, [organizationsList]);

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month - 2, 1);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${y}-${m}`);
  };

  const handleNextMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month, 1);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${y}-${m}`);
  };

  // Toggle sale items expansion
  const toggleSaleExpand = (saleId) => {
    setExpandedSaleIds(prev => ({
      ...prev,
      [saleId]: !prev[saleId]
    }));
  };

  // Cache Invalidation Helper
  const invalidateAllRelatedQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['organization-tabs'] });
    queryClient.invalidateQueries({ queryKey: ['organization-tab'] });
    queryClient.invalidateQueries({ queryKey: ['worker-tabs'] });
    queryClient.invalidateQueries({ queryKey: ['worker-tab'] });
    queryClient.invalidateQueries({ queryKey: ['sales'] });
    queryClient.invalidateQueries({ queryKey: ['debts'] });
    queryClient.invalidateQueries({ queryKey: ['cashflow'] });
    queryClient.invalidateQueries({ queryKey: ['shifts'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  };

  // Mutations
  const payDebtMutation = useMutation({
    mutationFn: async (payload) => {
      return api.post('organization-tabs/pay-debt/', payload);
    },
    onSuccess: (res) => {
      toast.success(res.data?.detail || "To'lov muvaffaqiyatli qabul qilindi!");
      setShowPayModal(false);
      setShowBulkPayModal(false);
      invalidateAllRelatedQueries();
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "To'lovni amalga oshirishda xatolik yuz berdi");
    }
  });

  const addDepositMutation = useMutation({
    mutationFn: async (payload) => {
      return api.post('organization-tabs/add-deposit/', payload);
    },
    onSuccess: (res) => {
      toast.success(res.data?.detail || "Depozit muvaffaqiyatli qo'shildi!");
      setShowDepositModal(false);
      invalidateAllRelatedQueries();
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Depozit qo'shishda xatolik yuz berdi");
    }
  });

  const updateOrgMutation = useMutation({
    mutationFn: async (payload) => {
      return api.patch('organization-tabs/update-details/', payload);
    },
    onSuccess: () => {
      toast.success("Tashkilot ma'lumotlari yangilandi!");
      setShowEditOrgModal(false);
      invalidateAllRelatedQueries();
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Ma'lumotlarni saqlashda xatolik");
    }
  });

  const createOrgMutation = useMutation({
    mutationFn: async (payload) => {
      return api.post('clients/', { ...payload, is_company: true });
    },
    onSuccess: (res) => {
      toast.success("Yangi tashkilot ro'yxatdan o'tkazildi!");
      setShowNewOrgModal(false);
      setNewOrgForm({ name: '', phone_number: '', inn: '', account_number: '' });
      invalidateAllRelatedQueries();
      if (res.data?.id) {
        setSelectedOrgId(res.data.id);
      }
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Tashkilot qo'shishda xatolik yuz berdi");
    }
  });

  // Action Triggers
  const handleOpenPaySpecificInvoice = (sale) => {
    const orgId = selectedOrgId !== 'all' ? selectedOrgId : (sale.client_id || '');
    setPayForm({
      client_id: orgId,
      sale_id: sale.id,
      sale_info: sale,
      amount: sale.debt_amount || '',
      payment_method: 'BANK_TRANSFER',
      note: `Faktura #${sale.id} (${sale.car_plate || ''}) uchun to'lov`
    });
    setShowPayModal(true);
  };

  const handleOpenBulkPay = (targetOrgId = null) => {
    const orgId = targetOrgId || (selectedOrgId !== 'all' ? selectedOrgId : '');
    const foundOrg = organizationsList.find(o => String(o.id) === String(orgId));
    setBulkPayForm({
      client_id: orgId,
      amount: foundOrg?.total_debt || '',
      payment_method: 'BANK_TRANSFER',
      note: "Umumiy qarz so'ndirish (FIFO)"
    });
    setShowBulkPayModal(true);
  };

  const handleOpenAddDeposit = (targetOrgId = null) => {
    const orgId = targetOrgId || (selectedOrgId !== 'all' ? selectedOrgId : '');
    setDepositForm({
      client_id: orgId,
      amount: '',
      payment_method: 'BANK_TRANSFER',
      note: "Avans / Depozit to'lovi"
    });
    setShowDepositModal(true);
  };

  const handleOpenEditOrg = (org) => {
    setEditOrgForm({
      client_id: org.id,
      name: org.name || '',
      phone_number: org.phone_number || '',
      inn: org.inn || '',
      account_number: org.account_number || ''
    });
    setShowEditOrgModal(true);
  };

  const handleApplyDeposit = (org) => {
    const deposit = Number(org.credit_deposit_balance || 0);
    const debt = Number(org.total_debt || 0);
    if (deposit <= 0) {
      toast.error("Tashkilotda depozit mavjud emas");
      return;
    }
    if (debt <= 0) {
      toast.error("Tashkilotda to'lanishi kerak bo'lgan ochiq qarz yo'q");
      return;
    }
    const applyAmount = Math.min(deposit, debt);
    if (window.confirm(`Mavjud depozitdan ${formatMoney(applyAmount)} miqdorida qarzni so'ndirishni tasdiqlaysizmi? Kassa tortmasiga ta'sir qilmaydi.`)) {
      payDebtMutation.mutate({
        client_id: org.id,
        amount: applyAmount,
        payment_method: 'DEPOSIT_USE',
        note: "Mavjud depozitdan qarz so'ndirildi"
      });
    }
  };

  // Filtered Lists in Single View
  const filteredUnpaidSales = useMemo(() => {
    if (!singleOrgData?.unpaid_sales) return [];
    if (!tableSearch.trim()) return singleOrgData.unpaid_sales;
    const q = tableSearch.toLowerCase();
    return singleOrgData.unpaid_sales.filter(s => 
      s.car_plate?.toLowerCase().includes(q) ||
      s.car_type?.toLowerCase().includes(q) ||
      s.services_summary?.toLowerCase().includes(q) ||
      s.items_summary?.toLowerCase().includes(q) ||
      String(s.sale_id).includes(q)
    );
  }, [singleOrgData?.unpaid_sales, tableSearch]);

  const filteredAllSales = useMemo(() => {
    if (!singleOrgData?.all_sales) return [];
    if (!tableSearch.trim()) return singleOrgData.all_sales;
    const q = tableSearch.toLowerCase();
    return singleOrgData.all_sales.filter(s => 
      s.car_plate?.toLowerCase().includes(q) ||
      s.car_type?.toLowerCase().includes(q) ||
      s.services_summary?.toLowerCase().includes(q) ||
      s.items_summary?.toLowerCase().includes(q) ||
      s.status_display?.toLowerCase().includes(q) ||
      String(s.sale_id).includes(q)
    );
  }, [singleOrgData?.all_sales, tableSearch]);

  const filteredTransactions = useMemo(() => {
    if (!singleOrgData?.transactions) return [];
    if (!tableSearch.trim()) return singleOrgData.transactions;
    const q = tableSearch.toLowerCase();
    return singleOrgData.transactions.filter(t => 
      t.note?.toLowerCase().includes(q) ||
      t.transaction_type_display?.toLowerCase().includes(q) ||
      t.payment_method_display?.toLowerCase().includes(q) ||
      t.created_by_name?.toLowerCase().includes(q) ||
      t.car_plate?.toLowerCase().includes(q) ||
      String(t.sale_id).includes(q)
    );
  }, [singleOrgData?.transactions, tableSearch]);

  // Filtered Orgs List in All View and Tab Switcher
  const filteredOrgsList = useMemo(() => {
    if (!organizationsList) return [];
    if (!tabSearch.trim()) return organizationsList;
    const q = tabSearch.toLowerCase();
    return organizationsList.filter(o => 
      o.name?.toLowerCase().includes(q) ||
      o.phone_number?.toLowerCase().includes(q) ||
      o.inn?.toLowerCase().includes(q) ||
      o.account_number?.toLowerCase().includes(q)
    );
  }, [organizationsList, tabSearch]);

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1600px', margin: '0 auto' }}>
      
      {/* 1. TOP HEADER & CONTROLS */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '20px'
      }}>
        <div>
          <h1 style={{
            fontSize: '1.75rem',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            margin: 0,
            color: 'var(--text-main)'
          }}>
            <Building2 size={28} color="var(--primary)" />
            <span>Tashkilotlar va Korporativ Mijozlar</span>
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Fakturalar, korporativ qarzlar, to'lovlar va ustalarning muzlatilgan komissiyalari
          </p>
        </div>

        {/* Header Right: Month Navigator + Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Month Selector */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '4px 6px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <button
              onClick={handlePrevMonth}
              title="Oldingi oy"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-main)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center'
              }}
              onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
              onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <ChevronLeft size={18} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px' }}>
              <Calendar size={16} color="var(--primary)" />
              <input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  color: 'var(--text-main)',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              />
            </div>

            <button
              onClick={handleNextMonth}
              title="Keyingi oy"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-main)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center'
              }}
              onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
              onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <ChevronRight size={18} />
            </button>

            {selectedMonth !== getCurrentYearMonth() && (
              <button
                onClick={() => setSelectedMonth(getCurrentYearMonth())}
                style={{
                  marginLeft: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--primary-light)',
                  color: 'var(--primary)',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Joriy oy
              </button>
            )}
          </div>

          {/* Quick Buttons */}
          <button
            onClick={() => handleOpenBulkPay()}
            className="btn"
            style={{
              padding: '0 16px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.88rem',
              backgroundColor: '#10b981',
              color: '#fff',
              fontWeight: 700,
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
            }}
          >
            <ArrowDownRight size={16} />
            <span>+ Qarz so'ndirish (FIFO)</span>
          </button>

          <button
            onClick={() => handleOpenAddDeposit()}
            className="btn btn-secondary"
            style={{
              padding: '0 14px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.85rem'
            }}
          >
            <Wallet size={16} color="#3b82f6" />
            <span>Depozit / Avans kiritish</span>
          </button>

          <button
            onClick={() => setShowNewOrgModal(true)}
            className="btn btn-primary"
            style={{
              padding: '0 14px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.85rem'
            }}
          >
            <Plus size={16} />
            <span>Yangi tashkilot</span>
          </button>

          <button
            onClick={() => {
              refetchAll();
              if (selectedOrgId !== 'all') refetchSingle();
              toast.success("Ma'lumotlar yangilandi");
            }}
            className="btn btn-secondary"
            title="Yangilash"
            style={{ width: '40px', height: '40px', padding: 0 }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* 2. EXCEL-STYLE TABS (Organizations switcher) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        overflowX: 'auto',
        paddingBottom: '12px',
        marginBottom: '20px',
        borderBottom: '1px solid var(--border)',
        scrollbarWidth: 'thin'
      }}>
        {/* All Organizations Tab */}
        <button
          onClick={() => setSelectedOrgId('all')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '12px',
            border: selectedOrgId === 'all' ? '1px solid var(--primary)' : '1px solid var(--border)',
            backgroundColor: selectedOrgId === 'all' ? 'var(--primary)' : 'var(--surface)',
            color: selectedOrgId === 'all' ? '#ffffff' : 'var(--text-main)',
            fontWeight: 700,
            fontSize: '0.88rem',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxShadow: selectedOrgId === 'all' ? '0 4px 14px rgba(99, 102, 241, 0.3)' : 'var(--shadow-sm)',
            transition: 'all 0.2s ease',
            flexShrink: 0
          }}
        >
          <FileSpreadsheet size={16} />
          <span>📊 Barcha tashkilotlar</span>
          <span style={{
            fontSize: '0.75rem',
            padding: '2px 8px',
            borderRadius: '10px',
            backgroundColor: selectedOrgId === 'all' ? 'rgba(255,255,255,0.25)' : 'var(--surface-hover)',
            color: selectedOrgId === 'all' ? '#ffffff' : 'var(--text-muted)'
          }}>
            {tabSearch ? `${filteredOrgsList.length}/${organizationsList.length}` : organizationsList.length}
          </span>
        </button>

        {/* Tab Search Input */}
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          minWidth: '170px',
          maxWidth: '220px',
          flexShrink: 0
        }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Tashkilot izlash..."
            value={tabSearch}
            onChange={e => setTabSearch(e.target.value)}
            style={{
              width: '100%',
              height: '38px',
              padding: '0 28px 0 32px',
              borderRadius: '12px',
              border: tabSearch ? '1px solid var(--primary)' : '1px solid var(--border)',
              backgroundColor: 'var(--surface)',
              color: 'var(--text-main)',
              fontSize: '0.82rem',
              outline: 'none',
              transition: 'all 0.2s'
            }}
          />
          {tabSearch && (
            <button
              onClick={() => setTabSearch('')}
              style={{
                position: 'absolute',
                right: '8px',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Tozalash"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Individual Organization Tabs */}
        {filteredOrgsList.map(org => {
          const isSelected = String(selectedOrgId) === String(org.id);
          const hasDebt = org.total_debt > 0;
          const hasLocked = org.locked_worker_commissions > 0;

          return (
            <button
              key={org.id}
              onClick={() => setSelectedOrgId(org.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '12px',
                border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                backgroundColor: 'var(--surface)',
                color: isSelected ? 'var(--primary)' : 'var(--text-main)',
                fontWeight: isSelected ? 700 : 600,
                fontSize: '0.86rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: isSelected ? '0 0 0 2px rgba(99, 102, 241, 0.2)' : 'var(--shadow-sm)',
                transition: 'all 0.2s ease',
                flexShrink: 0
              }}
            >
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                backgroundColor: isSelected ? 'var(--primary-light)' : 'var(--surface-hover)',
                color: isSelected ? 'var(--primary)' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 700
              }}>
                {org.name ? org.name.charAt(0).toUpperCase() : 'T'}
              </div>

              <span>{org.name}</span>

              {/* Debt Pill */}
              {hasDebt ? (
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  color: 'var(--danger)'
                }}>
                  -{(org.total_debt / 1000).toFixed(0)}k
                </span>
              ) : org.credit_deposit_balance > 0 ? (
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  color: '#10b981'
                }}>
                  +{(org.credit_deposit_balance / 1000).toFixed(0)}k
                </span>
              ) : (
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--surface-hover)',
                  color: 'var(--text-muted)'
                }}>
                  0
                </span>
              )}

              {/* Locked Worker Commission Indicator */}
              {hasLocked && (
                <span 
                  title={`Ustalarning muzlatilgan haqi: ${formatMoney(org.locked_worker_commissions)}`}
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: '#f59e0b',
                    display: 'inline-block'
                  }}
                />
              )}
            </button>
          );
        })}

        {filteredOrgsList.length === 0 && (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0 12px', whiteSpace: 'nowrap' }}>
            Tashkilot topilmadi
          </span>
        )}
      </div>

      {/* 3. MAIN CONTENT: CONDITIONAL (ALL VIEW vs SINGLE DETAIL VIEW) */}
      {selectedOrgId === 'all' ? (
        /* ======================== ALL ORGANIZATIONS COMPARISON VIEW ======================== */
        <div>
          {/* Top KPI Summary Cards */}
          <div className="org-kpi-grid">
            {/* 1. Total Billed */}
            <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--primary)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Jami hisoblangan fakturalar</span>
                <StatHelpTooltip
                  title="Jami fakturalar"
                  meaning="Barcha korporativ tashkilotlar uchun ko'rsatilgan xizmatlar va ehtiyot qismlarning umumiy qiymati."
                  formula="Σ (Barcha tashkilotlar Sale.total_amount)"
                />
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-main)' }}>
                {formatMoney(allOrgsKPIs.billed)}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {organizationsList.length} ta tashkilot bo'yicha
              </div>
            </div>

            {/* 2. Total Paid */}
            <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>To'langan summa</span>
                <StatHelpTooltip
                  title="To'langan summa"
                  meaning="Tashkilotlar tomonidan to'lab berilgan umumiy summa."
                  formula="Σ (Barcha tashkilotlar Sale.paid_amount)"
                />
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#10b981' }}>
                {formatMoney(allOrgsKPIs.paid)}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Hisob raqam, naqd yoki karta orqali
              </div>
            </div>

            {/* 3. Total Debt */}
            <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--danger)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Jami joriy qarz</span>
                <StatHelpTooltip
                  title="Joriy tashkilotlar qarzi"
                  meaning="Tashkilotlarning to'lanmagan ochiq fakturalari bo'yicha qolgan umumiy qarzdorlik."
                  formula="Jami hisoblangan - Jami to'langan"
                />
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: allOrgsKPIs.debt > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                {formatMoney(allOrgsKPIs.debt)}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {allOrgsKPIs.openInvoices} ta ochiq faktura bo'yicha
              </div>
            </div>

            {/* 4. Deposits Balance */}
            <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Mavjud depozitlar / Avanslar</span>
                <StatHelpTooltip
                  title="Tashkilotlar depozit balansi"
                  meaning="Tashkilotlar oldindan ortiqcha to'lagan yoki avans sifatida o'tkazib qo'ygan pul zaxiralari."
                  formula="Σ Client.credit_deposit_balance"
                />
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#3b82f6' }}>
                {formatMoney(allOrgsKPIs.deposits)}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Kelajakdagi fakturalarga yo'naltirish mumkin
              </div>
            </div>

            {/* 5. Locked Worker Commissions */}
            <div className="card" style={{
              padding: '16px 20px',
              borderLeft: '4px solid #f59e0b',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08), transparent)'
            }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Muzlatilgan usta haqlari</span>
                <StatHelpTooltip
                  title="Muzlatilgan usta ulushi"
                  meaning="Tashkilotlar hali pulini to'lamaganligi sababli ustalarga berilmay turgan xizmat haqi komissiyalari. Tashkilot fakturasini to'laganda avtomatik ravishda ustalarning to'lanadigan oyligiga ochiladi."
                  formula="Σ (Usta xizmati × (1 - to'langan_nisbati))"
                />
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#d97706' }}>
                {formatMoney(allOrgsKPIs.lockedCommissions)}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Qarz to'langanda ochiladi
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="card" style={{ padding: '14px 18px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ position: 'relative', width: '380px', maxWidth: '100%' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder="Tashkilot nomi, STIR (INN), telefon yoki hisob raqam bo'yicha izlash..."
                  value={tabSearch}
                  onChange={e => setTabSearch(e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 32px 0 36px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                />
                {tabSearch && (
                  <button
                    onClick={() => setTabSearch('')}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title="Tozalash"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Ko'rsatilmoqda: <b>{filteredOrgsList.length}</b> / {organizationsList.length} ta tashkilot
              </div>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-hover)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Tashkilot nomi</th>
                    <th style={{ padding: '12px 14px', fontWeight: 700 }}>STIR (INN) / Telefon</th>
                    <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>Jami hisoblangan</th>
                    <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>To'langan</th>
                    <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>Joriy qarz</th>
                    <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>Depozit balansi</th>
                    <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>Muzlatilgan usta haqi</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrgsList.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        {tabSearch ? `"${tabSearch}" bo'yicha tashkilot topilmadi.` : "Tashkilotlar topilmadi."}
                      </td>
                    </tr>
                  ) : (
                    filteredOrgsList.map(org => {
                      const hasDebt = org.total_debt > 0;
                      return (
                        <tr 
                          key={org.id}
                          onClick={() => setSelectedOrgId(org.id)}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease'
                          }}
                          onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
                          onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--primary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Building2 size={16} />
                              <span>{org.name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>
                            <div>{org.inn ? `STIR: ${org.inn}` : '—'}</div>
                            <div style={{ fontSize: '0.74rem' }}>{org.phone_number || ''}</div>
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600 }}>
                            {formatMoney(org.total_billed)}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                            {formatMoney(org.total_paid)}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: hasDebt ? 'var(--danger)' : 'var(--text-muted)' }}>
                            {hasDebt ? formatMoney(org.total_debt) : '0'}
                            {org.open_sales_count > 0 && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                {org.open_sales_count} ta faktura
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: org.credit_deposit_balance > 0 ? '#3b82f6' : 'var(--text-muted)' }}>
                            {org.credit_deposit_balance > 0 ? formatMoney(org.credit_deposit_balance) : '—'}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: org.locked_worker_commissions > 0 ? '#d97706' : 'var(--text-muted)' }}>
                            {org.locked_worker_commissions > 0 ? formatMoney(org.locked_worker_commissions) : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              {hasDebt && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenBulkPay(org.id)}
                                  className="btn"
                                  style={{
                                    height: '28px',
                                    padding: '0 10px',
                                    fontSize: '0.74rem',
                                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                    color: '#10b981',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                    borderRadius: '6px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                  title="FIFO orqali qarz so'ndirish"
                                >
                                  To'lash
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setSelectedOrgId(org.id)}
                                className="btn btn-secondary"
                                style={{
                                  height: '28px',
                                  padding: '0 10px',
                                  fontSize: '0.74rem',
                                  borderRadius: '6px'
                                }}
                              >
                                Ochish
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ======================== SINGLE ORGANIZATION DETAIL VIEW ======================== */
        <div>
          {/* Organization Profile Banner */}
          <div className="card" style={{
            padding: '18px 24px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '12px',
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                fontWeight: 800
              }}>
                {singleOrgData?.organization?.name ? singleOrgData.organization.name.charAt(0).toUpperCase() : 'T'}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    {singleOrgData?.organization?.name || currentOrgObj?.name}
                  </h2>
                  <span style={{
                    fontSize: '0.75rem',
                    padding: '2px 8px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(99, 102, 241, 0.12)',
                    color: 'var(--primary)',
                    fontWeight: 700
                  }}>
                    Korporativ mijoz
                  </span>
                </div>

                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                  <span>STIR (INN): <b>{singleOrgData?.organization?.inn || currentOrgObj?.inn || 'Kiritilmagan'}</b></span>
                  <span>Tel: <b>{singleOrgData?.organization?.phone_number || currentOrgObj?.phone_number || '—'}</b></span>
                  <span>Hisob raqam: <b>{singleOrgData?.organization?.account_number || currentOrgObj?.account_number || '—'}</b></span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => currentOrgObj && handleOpenEditOrg(currentOrgObj)}
                className="btn btn-secondary"
                style={{ height: '36px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Edit3 size={15} /> Rekvizitlarni tahrirlash
              </button>

              <button
                onClick={() => handleOpenAddDeposit(selectedOrgId)}
                className="btn btn-secondary"
                style={{ height: '36px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Wallet size={15} color="#3b82f6" /> + Depozit kiritish
              </button>

              <button
                onClick={() => handleOpenBulkPay(selectedOrgId)}
                className="btn"
                style={{
                  height: '36px',
                  fontSize: '0.84rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#10b981',
                  color: '#fff',
                  fontWeight: 700,
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0 14px'
                }}
              >
                <ArrowDownRight size={16} /> Qarz so'ndirish (FIFO)
              </button>
            </div>
          </div>

          {/* KPI 5-Card Grid for Single Organization */}
          {(() => {
            const sum = singleOrgData?.summary || {};
            const orgDebt = Number(sum.total_debt || 0);
            const orgDeposit = Number(sum.credit_deposit_balance || 0);
            const lockedComms = Number(sum.locked_worker_commissions || 0);

            return (
              <div className="org-kpi-grid">
                {/* 1. Total Billed */}
                <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--primary)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '160px' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px' }}>
                      Jami xarid va xizmatlar
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-main)' }}>
                      {formatMoney(sum.total_billed)}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Jami {sum.total_sales_count || 0} ta faktura
                    </div>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FileText size={12} /> Barcha davr bo'yicha
                  </div>
                </div>

                {/* 2. Total Paid */}
                <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '160px' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px' }}>
                      To'langan summa
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#10b981' }}>
                      {formatMoney(sum.total_paid)}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      So'ndirilgan summa
                    </div>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={12} /> Bank va kassa orqali
                  </div>
                </div>

                {/* 3. Current Debt */}
                <div className="card" style={{
                  padding: '16px 20px',
                  borderLeft: '4px solid var(--danger)',
                  background: orgDebt > 0 ? 'rgba(239, 68, 68, 0.05)' : 'var(--surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '160px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
                      Joriy qarzdorlik
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: orgDebt > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                      {formatMoney(orgDebt)}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {sum.open_sales_count || 0} ta ochiq faktura
                    </div>
                  </div>
                  {orgDebt > 0 ? (
                    <button
                      type="button"
                      onClick={() => handleOpenBulkPay(selectedOrgId)}
                      className="btn"
                      style={{
                        height: '28px',
                        fontSize: '0.74rem',
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        color: 'var(--danger)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '6px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                    >
                      <ArrowDownRight size={13} /> Qarzni to'lash (FIFO)
                    </button>
                  ) : (
                    <div style={{ fontSize: '0.74rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={12} /> Barcha fakturalar to'langan
                    </div>
                  )}
                </div>

                {/* 4. Deposits Balance */}
                <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #3b82f6', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '160px' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px' }}>
                      Oldindan to'lov / Depozit
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: orgDeposit > 0 ? '#3b82f6' : 'var(--text-muted)' }}>
                      {formatMoney(orgDeposit)}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Kompaniyaning erkin avans qoldig'i
                    </div>
                  </div>
                  {orgDeposit > 0 && orgDebt > 0 ? (
                    <button
                      type="button"
                      onClick={() => handleApplyDeposit(currentOrgObj || singleOrgData?.organization)}
                      className="btn"
                      style={{
                        height: '28px',
                        fontSize: '0.74rem',
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        color: '#3b82f6',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '6px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                    >
                      Depozitdan qarzni yopish
                    </button>
                  ) : (
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Wallet size={12} /> Avans balansi
                    </div>
                  )}
                </div>

                {/* 5. Locked Worker Commissions (Highlight) */}
                <div className="card" style={{
                  padding: '16px 20px',
                  borderLeft: '4px solid #f59e0b',
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(99, 102, 241, 0.05))',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '160px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Muzlatilgan usta ulushi</span>
                      <StatHelpTooltip
                        title="Ustalarning muzlatilgan komissiyasi"
                        meaning="Tashkilot to'lamagan ochiq fakturalardagi ustalarning ish haqlari. Tashkilot qarzni to'lashi bilan bu summa avtomatik tarzda tegishli ustalarning 'Darhol to'lanadigan oylik' balansiga o'tadi."
                        formula="Σ (Xizmat summasi × Fakturaning to'lanmagan foizi)"
                        align="right"
                      />
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#d97706' }}>
                      {formatMoney(lockedComms)}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Qarz to'langanda ustalarga ochiladi
                    </div>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#d97706', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} /> Tashkilot to'lovini kutmoqda
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Sub-Tabs Selector & Search Bar */}
          <div className="card" style={{ padding: '14px 18px', marginBottom: '16px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px'
            }}>
              {/* Sub-Tab Navigation */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setActiveSubTab('unpaid_invoices')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: activeSubTab === 'unpaid_invoices' ? 'var(--primary)' : 'var(--surface-hover)',
                    color: activeSubTab === 'unpaid_invoices' ? '#fff' : 'var(--text-main)',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <AlertTriangle size={16} />
                  <span>Ochiq qarzlar / Fakturalar</span>
                  <span style={{
                    fontSize: '0.72rem',
                    padding: '1px 7px',
                    borderRadius: '10px',
                    backgroundColor: activeSubTab === 'unpaid_invoices' ? 'rgba(255,255,255,0.25)' : 'var(--surface)',
                    color: activeSubTab === 'unpaid_invoices' ? '#fff' : 'var(--danger)',
                    fontWeight: 700
                  }}>
                    {singleOrgData?.unpaid_sales?.length || 0}
                  </span>
                </button>

                <button
                  onClick={() => setActiveSubTab('all_sales')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: activeSubTab === 'all_sales' ? 'var(--primary)' : 'var(--surface-hover)',
                    color: activeSubTab === 'all_sales' ? '#fff' : 'var(--text-main)',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <ShoppingBag size={16} />
                  <span>Barcha xaridlar va xizmatlar</span>
                  <span style={{
                    fontSize: '0.72rem',
                    padding: '1px 7px',
                    borderRadius: '10px',
                    backgroundColor: activeSubTab === 'all_sales' ? 'rgba(255,255,255,0.25)' : 'var(--surface)',
                    color: activeSubTab === 'all_sales' ? '#fff' : 'var(--text-muted)'
                  }}>
                    {singleOrgData?.all_sales?.length || 0}
                  </span>
                </button>

                <button
                  onClick={() => setActiveSubTab('transactions')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: activeSubTab === 'transactions' ? 'var(--primary)' : 'var(--surface-hover)',
                    color: activeSubTab === 'transactions' ? '#fff' : 'var(--text-main)',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <CreditCard size={16} />
                  <span>To'lovlar tarixi (Ledger)</span>
                  <span style={{
                    fontSize: '0.72rem',
                    padding: '1px 7px',
                    borderRadius: '10px',
                    backgroundColor: activeSubTab === 'transactions' ? 'rgba(255,255,255,0.25)' : 'var(--surface)',
                    color: activeSubTab === 'transactions' ? '#fff' : 'var(--text-muted)'
                  }}>
                    {singleOrgData?.transactions?.length || 0}
                  </span>
                </button>
              </div>

              {/* Search Bar */}
              <input
                type="text"
                placeholder="Faktura, avto raqam, xizmat yoki usta bo'yicha izlash..."
                value={tableSearch}
                onChange={e => setTableSearch(e.target.value)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--text-main)',
                  width: '320px',
                  maxWidth: '100%',
                  fontSize: '0.84rem'
                }}
              />
            </div>
          </div>

          {/* SUBTAB 1: UNPAID INVOICES / OPEN DEBTS */}
          {activeSubTab === 'unpaid_invoices' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{
                padding: '12px 18px',
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.82rem',
                color: '#d97706',
                fontWeight: 600
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={16} />
                  <span>Fakturalar to'langanda, unga biriktirilgan ustalarning ish haqlari avtomatik ravishda ochiladi (FIFO tartibida).</span>
                </div>
                {Number(singleOrgData?.summary?.total_debt || 0) > 0 && (
                  <button
                    onClick={() => handleOpenBulkPay(selectedOrgId)}
                    className="btn"
                    style={{
                      height: '28px',
                      padding: '0 12px',
                      fontSize: '0.78rem',
                      backgroundColor: '#10b981',
                      color: '#fff',
                      fontWeight: 700,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    Umumiy qarzni so'ndirish (FIFO)
                  </button>
                )}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--surface-hover)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 700 }}>Faktura & Sana</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Avtomobil</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Ustalar va Xizmatlar</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Ehtiyot qismlar</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>Jami</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>To'langan</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>Qoldiq qarz</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>Muzlatilgan usta haqi</th>
                      <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>To'lov</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUnpaidSales.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          <CheckCircle2 size={32} color="#10b981" style={{ margin: '0 auto 8px', display: 'block' }} />
                          Bu tashkilotning to'lanmagan ochiq qarzlari yo'q!
                        </td>
                      </tr>
                    ) : (
                      filteredUnpaidSales.map(sale => (
                        <tr key={sale.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: 700, color: 'var(--primary)' }}>Faktura #{sale.id}</div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                              {new Date(sale.datetime).toLocaleString('uz-UZ', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>

                          <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Car size={14} /> {sale.car_plate || '—'}
                            </div>
                            {sale.car_type && (
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{sale.car_type}</div>
                            )}
                          </td>

                          <td style={{ padding: '12px 14px', verticalAlign: 'top', maxWidth: '240px' }}>
                            {sale.services && sale.services.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                {sale.services.map(svc => (
                                  <div key={svc.id} style={{ fontSize: '0.76rem', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                    <span style={{ fontWeight: 600 }}>{svc.service_name} ({svc.worker_name})</span>
                                    <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatMoney(svc.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Faqat tovar</span>
                            )}
                          </td>

                          <td style={{ padding: '12px 14px', verticalAlign: 'top', fontSize: '0.76rem', color: 'var(--text-muted)', maxWidth: '200px' }}>
                            {sale.items_summary}
                          </td>

                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, verticalAlign: 'top' }}>
                            {formatMoney(sale.total_amount)}
                          </td>

                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#10b981', verticalAlign: 'top' }}>
                            {sale.paid_amount > 0 ? formatMoney(sale.paid_amount) : '—'}
                          </td>

                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--danger)', verticalAlign: 'top' }}>
                            {formatMoney(sale.debt_amount)}
                          </td>

                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#d97706', verticalAlign: 'top' }}>
                            {sale.locked_worker_commission > 0 ? formatMoney(sale.locked_worker_commission) : '0'}
                          </td>

                          <td style={{ padding: '12px 16px', textAlign: 'center', verticalAlign: 'top' }}>
                            <button
                              type="button"
                              onClick={() => handleOpenPaySpecificInvoice(sale)}
                              className="btn"
                              style={{
                                height: '28px',
                                padding: '0 10px',
                                fontSize: '0.74rem',
                                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                color: '#10b981',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                borderRadius: '6px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              <DollarSign size={13} /> To'lov
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUBTAB 2: ALL SALES HISTORY */}
          {activeSubTab === 'all_sales' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--surface-hover)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ width: '36px', padding: '12px 8px', textAlign: 'center' }}></th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Faktura & Sana</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Avtomobil</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Xizmatlar & Ustalar</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Ehtiyot qismlar</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>Jami</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>To'langan</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>Qarz</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'center' }}>Holat</th>
                      <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Amal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAllSales.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          Xaridlar va xizmatlar tarixi topilmadi
                        </td>
                      </tr>
                    ) : (
                      filteredAllSales.map(sale => {
                        const isExpanded = !!expandedSaleIds[sale.id];
                        return (
                          <React.Fragment key={sale.id}>
                            <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border)', backgroundColor: isExpanded ? 'var(--surface-hover)' : 'transparent' }}>
                              <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => toggleSaleExpand(sale.id)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                                >
                                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                              </td>

                              <td style={{ padding: '12px 14px' }}>
                                <div style={{ fontWeight: 700, color: 'var(--primary)' }}>Faktura #{sale.id}</div>
                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                  {new Date(sale.datetime).toLocaleString('uz-UZ', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </td>

                              <td style={{ padding: '12px 14px' }}>
                                <div style={{ fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Car size={14} /> {sale.car_plate || '—'}
                                </div>
                                {sale.car_type && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{sale.car_type}</div>}
                              </td>

                              <td style={{ padding: '12px 14px', maxWidth: '220px', fontSize: '0.76rem' }}>
                                {sale.services_summary}
                              </td>

                              <td style={{ padding: '12px 14px', maxWidth: '200px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                {sale.items_summary}
                              </td>

                              <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600 }}>
                                {formatMoney(sale.total_amount)}
                              </td>

                              <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                                {formatMoney(sale.paid_amount)}
                              </td>

                              <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: sale.debt_amount > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                                {sale.debt_amount > 0 ? formatMoney(sale.debt_amount) : '0'}
                              </td>

                              <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                <span style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: '8px',
                                  backgroundColor: sale.status === 'PAID' 
                                    ? 'rgba(16, 185, 129, 0.12)' 
                                    : sale.status === 'PARTIAL' 
                                      ? 'rgba(245, 158, 11, 0.15)' 
                                      : 'rgba(239, 68, 68, 0.12)',
                                  color: sale.status === 'PAID' 
                                    ? '#10b981' 
                                    : sale.status === 'PARTIAL' 
                                      ? '#d97706' 
                                      : 'var(--danger)'
                                }}>
                                  {sale.status_display}
                                </span>
                              </td>

                              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                {sale.debt_amount > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenPaySpecificInvoice(sale)}
                                    className="btn"
                                    style={{
                                      height: '26px',
                                      padding: '0 8px',
                                      fontSize: '0.72rem',
                                      backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                      color: '#10b981',
                                      border: '1px solid rgba(16, 185, 129, 0.3)',
                                      borderRadius: '6px',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    To'lash
                                  </button>
                                ) : (
                                  <Check size={16} color="#10b981" style={{ margin: '0 auto' }} />
                                )}
                              </td>
                            </tr>

                            {/* Expandable row showing individual items & services breakdown */}
                            {isExpanded && (
                              <tr style={{ backgroundColor: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                                <td colSpan={10} style={{ padding: '12px 24px 16px 48px' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                                    {/* Services Breakdown */}
                                    <div>
                                      <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '6px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Users size={14} color="var(--primary)" />
                                        <span>Xizmatlar va Ustalar komissiyasi</span>
                                      </div>
                                      {sale.services && sale.services.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                          {sale.services.map(svc => (
                                            <div key={svc.id} style={{
                                              backgroundColor: 'var(--surface)',
                                              padding: '8px 12px',
                                              borderRadius: '8px',
                                              border: '1px solid var(--border)',
                                              fontSize: '0.78rem'
                                            }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                                                <span>{svc.service_name}</span>
                                                <span>{formatMoney(svc.amount)}</span>
                                              </div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '3px' }}>
                                                <span>Usta: <b>{svc.worker_name}</b></span>
                                                <span>
                                                  Ochilgan: <b style={{ color: '#10b981' }}>{formatMoney(svc.realized_amount)}</b> / Muzlatilgan: <b style={{ color: '#d97706' }}>{formatMoney(svc.pending_amount)}</b>
                                                </span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Xizmatlar mavjud emas</div>
                                      )}
                                    </div>

                                    {/* Products Breakdown */}
                                    <div>
                                      <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '6px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Package size={14} color="#3b82f6" />
                                        <span>Ehtiyot qismlar va Mahsulotlar</span>
                                      </div>
                                      {sale.items && sale.items.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                          {sale.items.map(itm => (
                                            <div key={itm.id} style={{
                                              backgroundColor: 'var(--surface)',
                                              padding: '8px 12px',
                                              borderRadius: '8px',
                                              border: '1px solid var(--border)',
                                              fontSize: '0.78rem',
                                              display: 'flex',
                                              justifyContent: 'space-between',
                                              alignItems: 'center'
                                            }}>
                                              <div>
                                                <div style={{ fontWeight: 600 }}>{itm.product_name}</div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                  {itm.quantity} {itm.unit_name} × {formatMoney(itm.price)}
                                                </div>
                                              </div>
                                              <div style={{ fontWeight: 700 }}>{formatMoney(itm.total)}</div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Ehtiyot qismlar ishlatilmagan</div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUBTAB 3: PAYMENT LEDGER / TRANSACTIONS HISTORY */}
          {activeSubTab === 'transactions' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--surface-hover)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 700 }}>Sana & Vaqt</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Amal turi</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>To'lov usuli</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>Summa</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Bog'langan faktura / Avto</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Izoh</th>
                      <th style={{ padding: '12px 16px', fontWeight: 700 }}>Qabul qildi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          To'lovlar tarixi mavjud emas
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map(tx => (
                        <tr key={tx.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600 }}>
                              {new Date(tx.created_at).toLocaleString('uz-UZ', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>

                          <td style={{ padding: '12px 14px' }}>
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '8px',
                              backgroundColor: tx.transaction_type === 'DEPOSIT' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                              color: tx.transaction_type === 'DEPOSIT' ? '#3b82f6' : '#10b981'
                            }}>
                              {tx.transaction_type_display}
                            </span>
                          </td>

                          <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                            {tx.payment_method_display}
                          </td>

                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#10b981', fontSize: '0.92rem' }}>
                            +{formatMoney(tx.amount)}
                          </td>

                          <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>
                            {tx.sale_id ? (
                              <span>Faktura #{tx.sale_id} {tx.car_plate ? `(${tx.car_plate})` : ''}</span>
                            ) : (
                              <span style={{ fontStyle: 'italic' }}>Umumiy qarz (FIFO)</span>
                            )}
                          </td>

                          <td style={{ padding: '12px 14px', color: 'var(--text-muted)', maxWidth: '240px' }}>
                            {tx.note || '—'}
                          </td>

                          <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                            {tx.created_by_name || 'Tizim'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================== MODALS ======================== */}

      {/* 1. PAY SPECIFIC INVOICE MODAL */}
      {showPayModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className="card" style={{ width: '480px', maxWidth: '100%', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <DollarSign size={20} color="#10b981" />
                <span>Faktura to'lovini qabul qilish</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowPayModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {payForm.sale_info && (
              <div style={{
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: 'var(--surface-hover)',
                marginBottom: '16px',
                fontSize: '0.84rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>Faktura #{payForm.sale_info.id} ({payForm.sale_info.car_plate || 'Avto'})</span>
                  <span style={{ color: 'var(--danger)' }}>Qarz: {formatMoney(payForm.sale_info.debt_amount)}</span>
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Jami summa: {formatMoney(payForm.sale_info.total_amount)} • To'langan: {formatMoney(payForm.sale_info.paid_amount)}
                </div>
              </div>
            )}

            <form onSubmit={(e) => {
              e.preventDefault();
              payDebtMutation.mutate({
                client_id: payForm.client_id,
                sale_id: payForm.sale_id,
                amount: payForm.amount,
                payment_method: payForm.payment_method,
                note: payForm.note
              });
            }}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  To'lov summasi (so'm)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="Summani kiriting..."
                  value={payForm.amount}
                  onChange={e => setPayForm({ ...payForm, amount: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.95rem',
                    fontWeight: 700
                  }}
                />
                {payForm.sale_info && (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setPayForm({ ...payForm, amount: payForm.sale_info.debt_amount })}
                      style={{
                        fontSize: '0.74rem',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--surface-hover)',
                        cursor: 'pointer'
                      }}
                    >
                      To'liq qoldiq ({formatMoney(payForm.sale_info.debt_amount)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayForm({ ...payForm, amount: Math.round(Number(payForm.sale_info.debt_amount) / 2) })}
                      style={{
                        fontSize: '0.74rem',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--surface-hover)',
                        cursor: 'pointer'
                      }}
                    >
                      50% ({formatMoney(Math.round(Number(payForm.sale_info.debt_amount) / 2))})
                    </button>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  To'lov usuli
                </label>
                <select
                  value={payForm.payment_method}
                  onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.88rem'
                  }}
                >
                  <option value="BANK_TRANSFER">Bank o'tkazmasi (Perechisleniye)</option>
                  <option value="CASH">Naqd pul (Smenadagi kassaga kirim)</option>
                  <option value="CARD">Plastik karta (Humo / Uzcard)</option>
                  {Number(currentOrgObj?.credit_deposit_balance || singleOrgData?.organization?.credit_deposit_balance || 0) > 0 && (
                    <option value="DEPOSIT_USE">
                      Mavjud depozitdan yechish (Qoldiq: {formatMoney(currentOrgObj?.credit_deposit_balance || singleOrgData?.organization?.credit_deposit_balance)})
                    </option>
                  )}
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Izoh (To'lov topshirig'i raqami yoki eslatma)
                </label>
                <input
                  type="text"
                  placeholder="Masalan: To'lov topshirig'i #418"
                  value={payForm.note}
                  onChange={e => setPayForm({ ...payForm, note: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="btn btn-secondary"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={payDebtMutation.isPending}
                  className="btn btn-primary"
                  style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                >
                  {payDebtMutation.isPending ? "To'lanmoqda..." : "To'lovni tasdiqlash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. BULK FIFO PAYMENT MODAL */}
      {showBulkPayModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className="card" style={{ width: '500px', maxWidth: '100%', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ArrowDownRight size={20} color="#10b981" />
                <span>Umumiy qarzni so'ndirish (FIFO)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowBulkPayModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: '16px' }}>
              To'lov avtomatik ravishda tashkilotning eng eski ochiq fakturalaridan boshlab ketma-ket so'ndiriladi (FIFO). Agar to'lov summasi jami qarzdan oshib ketsa, qoldiq avans sifatida tashkilot depozitiga o'tkaziladi.
            </p>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (!bulkPayForm.client_id) {
                toast.error("Tashkilot tanlanishi shart");
                return;
              }
              payDebtMutation.mutate({
                client_id: bulkPayForm.client_id,
                sale_id: null,
                amount: bulkPayForm.amount,
                payment_method: bulkPayForm.payment_method,
                note: bulkPayForm.note
              });
            }}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Tashkilot
                </label>
                <select
                  required
                  value={bulkPayForm.client_id}
                  onChange={e => {
                    const selId = e.target.value;
                    const fOrg = organizationsList.find(o => String(o.id) === String(selId));
                    setBulkPayForm({
                      ...bulkPayForm,
                      client_id: selId,
                      amount: fOrg?.total_debt || ''
                    });
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.88rem'
                  }}
                >
                  <option value="">-- Tashkilotni tanlang --</option>
                  {organizationsList.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.name} (Qarz: {formatMoney(o.total_debt)})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  To'lov summasi (so'm)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="Summani kiriting..."
                  value={bulkPayForm.amount}
                  onChange={e => setBulkPayForm({ ...bulkPayForm, amount: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.95rem',
                    fontWeight: 700
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  To'lov usuli
                </label>
                <select
                  value={bulkPayForm.payment_method}
                  onChange={e => setBulkPayForm({ ...bulkPayForm, payment_method: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.88rem'
                  }}
                >
                  <option value="BANK_TRANSFER">Bank o'tkazmasi (Perechisleniye)</option>
                  <option value="CASH">Naqd pul (Smena kassa tortmasiga kirim)</option>
                  <option value="CARD">Plastik karta (Humo / Uzcard)</option>
                  <option value="DEPOSIT_USE">Mavjud depozitdan so'ndirish</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Izoh
                </label>
                <input
                  type="text"
                  placeholder="Masalan: 2026-yil oktyabr oyi bo'yicha to'liq hisob-kitob"
                  value={bulkPayForm.note}
                  onChange={e => setBulkPayForm({ ...bulkPayForm, note: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowBulkPayModal(false)}
                  className="btn btn-secondary"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={payDebtMutation.isPending}
                  className="btn btn-primary"
                  style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                >
                  {payDebtMutation.isPending ? "So'ndirilmoqda..." : "Qarzni so'ndirish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. ADD DEPOSIT MODAL */}
      {showDepositModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className="card" style={{ width: '480px', maxWidth: '100%', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wallet size={20} color="#3b82f6" />
                <span>Oldindan to'lov / Depozit kiritish</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowDepositModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (!depositForm.client_id) {
                toast.error("Tashkilot tanlanishi shart");
                return;
              }
              addDepositMutation.mutate({
                client_id: depositForm.client_id,
                amount: depositForm.amount,
                payment_method: depositForm.payment_method,
                note: depositForm.note
              });
            }}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Tashkilot
                </label>
                <select
                  required
                  value={depositForm.client_id}
                  onChange={e => setDepositForm({ ...depositForm, client_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.88rem'
                  }}
                >
                  <option value="">-- Tashkilotni tanlang --</option>
                  {organizationsList.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.name} (Mavjud depozit: {formatMoney(o.credit_deposit_balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Depozit summasi (so'm)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="Summani kiriting..."
                  value={depositForm.amount}
                  onChange={e => setDepositForm({ ...depositForm, amount: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.95rem',
                    fontWeight: 700
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  To'lov usuli
                </label>
                <select
                  value={depositForm.payment_method}
                  onChange={e => setDepositForm({ ...depositForm, payment_method: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.88rem'
                  }}
                >
                  <option value="BANK_TRANSFER">Bank o'tkazmasi (Perechisleniye)</option>
                  <option value="CASH">Naqd pul (Kassaga kirim)</option>
                  <option value="CARD">Plastik karta</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Izoh
                </label>
                <input
                  type="text"
                  placeholder="Masalan: Shartnoma asosida oldindan 100% avans"
                  value={depositForm.note}
                  onChange={e => setDepositForm({ ...depositForm, note: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowDepositModal(false)}
                  className="btn btn-secondary"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={addDepositMutation.isPending}
                  className="btn btn-primary"
                  style={{ backgroundColor: '#3b82f6', borderColor: '#3b82f6' }}
                >
                  {addDepositMutation.isPending ? "Qo'shilmoqda..." : "Depozitga kiritish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. EDIT ORGANIZATION REQUISITES MODAL */}
      {showEditOrgModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className="card" style={{ width: '480px', maxWidth: '100%', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit3 size={20} color="var(--primary)" />
                <span>Tashkilot rekvizitlarini tahrirlash</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowEditOrgModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              updateOrgMutation.mutate(editOrgForm);
            }}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Tashkilot nomi
                </label>
                <input
                  type="text"
                  required
                  value={editOrgForm.name}
                  onChange={e => setEditOrgForm({ ...editOrgForm, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  STIR (INN)
                </label>
                <input
                  type="text"
                  placeholder="Masalan: 301234567"
                  value={editOrgForm.inn}
                  onChange={e => setEditOrgForm({ ...editOrgForm, inn: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Telefon raqam
                </label>
                <input
                  type="text"
                  placeholder="+998 71 200 00 00"
                  value={editOrgForm.phone_number}
                  onChange={e => setEditOrgForm({ ...editOrgForm, phone_number: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Hisob raqam (Bank account)
                </label>
                <input
                  type="text"
                  placeholder="20208000..."
                  value={editOrgForm.account_number}
                  onChange={e => setEditOrgForm({ ...editOrgForm, account_number: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowEditOrgModal(false)}
                  className="btn btn-secondary"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={updateOrgMutation.isPending}
                  className="btn btn-primary"
                >
                  {updateOrgMutation.isPending ? "Saqlanmoqda..." : "Saqlash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. NEW ORGANIZATION MODAL */}
      {showNewOrgModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className="card" style={{ width: '480px', maxWidth: '100%', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building2 size={20} color="var(--primary)" />
                <span>Yangi tashkilot qo'shish</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewOrgModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              createOrgMutation.mutate(newOrgForm);
            }}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Tashkilot nomi *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: Toshkent Trans Service MCHJ"
                  value={newOrgForm.name}
                  onChange={e => setNewOrgForm({ ...newOrgForm, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  STIR (INN)
                </label>
                <input
                  type="text"
                  placeholder="Masalan: 301234567"
                  value={newOrgForm.inn}
                  onChange={e => setNewOrgForm({ ...newOrgForm, inn: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Telefon raqam
                </label>
                <input
                  type="text"
                  placeholder="+998 71 200 00 00"
                  value={newOrgForm.phone_number}
                  onChange={e => setNewOrgForm({ ...newOrgForm, phone_number: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Hisob raqam (Bank account)
                </label>
                <input
                  type="text"
                  placeholder="20208000..."
                  value={newOrgForm.account_number}
                  onChange={e => setNewOrgForm({ ...newOrgForm, account_number: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowNewOrgModal(false)}
                  className="btn btn-secondary"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={createOrgMutation.isPending}
                  className="btn btn-primary"
                >
                  {createOrgMutation.isPending ? "Qo'shilmoqda..." : "Tashkilotni saqlash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

