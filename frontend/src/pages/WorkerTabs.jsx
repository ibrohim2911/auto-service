import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Wrench, Users, Calendar, DollarSign, Plus, Trash2, CheckCircle2, 
  AlertCircle, Building2, Car, ChevronLeft, ChevronRight, 
  Wallet, RefreshCw, FileSpreadsheet, ArrowUpRight, ArrowDownRight,
  Filter, Settings, Check, Clock, AlertTriangle, Layers, X, ShoppingBag, Package, Eye
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import useAuthStore from '../store';
import SearchableSelect from '../components/SearchableSelect';
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

export default function WorkerTabs() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  // Period / Filters
  const [selectedMonth, setSelectedMonth] = useState(getCurrentYearMonth());
  const [selectedWorkerId, setSelectedWorkerId] = useState('all');
  const [activeSubTab, setActiveSubTab] = useState('jobs'); // 'jobs' | 'deductions'
  const [clientFilter, setClientFilter] = useState('');
  const [isCompanyFilter, setIsCompanyFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [tableSearch, setTableSearch] = useState('');

  // Modals
  const [showToolFeeModal, setShowToolFeeModal] = useState(false);
  const [toolFeeForm, setToolFeeForm] = useState({
    worker_id: '',
    period_month: getCurrentYearMonth(),
    amount: '',
    note: ''
  });

  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    worker: '',
    amount: '',
    payment_method: 'CASH',
    note: ''
  });

  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutForm, setPayoutForm] = useState({
    worker: '',
    amount: '',
    payment_method: 'CASH',
    note: '',
    basis: 'payable_now'
  });

  const [showWorkerPaymentModal, setShowWorkerPaymentModal] = useState(false);
  const [workerPaymentForm, setWorkerPaymentForm] = useState({
    worker: '',
    amount: '',
    payment_method: 'CASH',
    note: '',
    period_month: getCurrentYearMonth()
  });

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configForm, setConfigForm] = useState({
    worker_id: '',
    worker_name: '',
    monthly_tool_fee: ''
  });

  const [payingGoodsSale, setPayingGoodsSale] = useState(null);
  const [goodsPaymentForm, setGoodsPaymentForm] = useState({
    amount: '',
    payment_method: '',
    note: ''
  });

  // Queries
  const { data: allWorkersData, isLoading: isAllLoading, refetch: refetchAll } = useQuery({
    queryKey: ['worker-tabs', selectedMonth],
    queryFn: async () => {
      const res = await api.get(`worker-tabs/?month=${selectedMonth}`);
      return res.data;
    }
  });

  const { data: singleWorkerData, isLoading: isSingleLoading, refetch: refetchSingle } = useQuery({
    queryKey: ['worker-tab', selectedWorkerId, selectedMonth, clientFilter, isCompanyFilter, paymentStatusFilter],
    queryFn: async () => {
      let url = `worker-tabs/${selectedWorkerId}/?month=${selectedMonth}`;
      if (clientFilter) url += `&client=${clientFilter}`;
      if (isCompanyFilter !== '') url += `&is_company=${isCompanyFilter}`;
      if (paymentStatusFilter) url += `&payment_status=${paymentStatusFilter}`;
      const res = await api.get(url);
      return res.data;
    },
    enabled: selectedWorkerId !== 'all' && !!selectedWorkerId
  });

  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const res = await api.get('clients/?page_size=300');
      return res.data?.results || (Array.isArray(res.data) ? res.data : []);
    }
  });

  const { data: paymentMethodsData } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => {
      const res = await api.get('payment-methods/?page_size=100');
      return res.data?.results || (Array.isArray(res.data) ? res.data : []);
    }
  });

  const { data: currentShiftData } = useQuery({
    queryKey: ['shifts', 'current'],
    queryFn: async () => {
      const res = await api.get('shifts/current/');
      return res.data;
    }
  });
  const activeShift = currentShiftData?.active ? currentShiftData.shift : null;

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

  const workersList = allWorkersData?.workers || [];
  const currentWorkerObj = workersList.find(w => String(w.id) === String(selectedWorkerId));

  // Mutations
  const chargeToolFeeMutation = useMutation({
    mutationFn: async (payload) => {
      return api.post('worker-tabs/charge-monthly-tool-fee/', payload);
    },
    onSuccess: (res) => {
      toast.success(res.data.detail || "Podyomnik to'lovi muvaffaqiyatli hisoblandi!");
      setShowToolFeeModal(false);
      queryClient.invalidateQueries({ queryKey: ['worker-tabs'] });
      queryClient.invalidateQueries({ queryKey: ['worker-tab'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Podyomnik to'lovini hisoblashda xatolik");
    }
  });

  const createTransactionMutation = useMutation({
    mutationFn: async (payload) => {
      return api.post('worker-transactions/', payload);
    },
    onSuccess: () => {
      toast.success("Tranzaksiya muvaffaqiyatli saqlandi!");
      setShowAdvanceModal(false);
      setShowPayoutModal(false);
      setShowWorkerPaymentModal(false);
      queryClient.invalidateQueries({ queryKey: ['worker-tabs'] });
      queryClient.invalidateQueries({ queryKey: ['worker-tab'] });
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Tranzaksiyani saqlashda xatolik");
    }
  });

  const deleteTransactionMutation = useMutation({
    mutationFn: async (id) => {
      return api.delete(`worker-transactions/${id}/`);
    },
    onSuccess: () => {
      toast.success("Tranzaksiya o'chirildi!");
      queryClient.invalidateQueries({ queryKey: ['worker-tabs'] });
      queryClient.invalidateQueries({ queryKey: ['worker-tab'] });
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: () => {
      toast.error("Tranzaksiyani o'chirishda xatolik");
    }
  });

  const updateWorkerToolFeeMutation = useMutation({
    mutationFn: async ({ worker_id, monthly_tool_fee }) => {
      return api.patch(`users/${worker_id}/`, { monthly_tool_fee });
    },
    onSuccess: () => {
      toast.success("Usta uchun doimiy podyomnik to'lovi yangilandi!");
      setShowConfigModal(false);
      queryClient.invalidateQueries({ queryKey: ['worker-tabs'] });
      queryClient.invalidateQueries({ queryKey: ['worker-tab'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => {
      toast.error("Ma'lumotni yangilashda xatolik");
    }
  });

  const payGoodsDebtMutation = useMutation({
    mutationFn: async ({ saleId, payload }) => {
      return api.post(`sales/${saleId}/pay-debt/`, payload);
    },
    onSuccess: (res) => {
      toast.success(res.data?.detail || "Tovar qarzi muvaffaqiyatli to'landi!");
      setPayingGoodsSale(null);
      queryClient.invalidateQueries({ queryKey: ['worker-tabs'] });
      queryClient.invalidateQueries({ queryKey: ['worker-tab'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Tovar qarzini to'lashda xatolik yuz berdi");
    }
  });

  // Filtered Services List (in detail view)
  const filteredServices = useMemo(() => {
    if (!singleWorkerData?.services) return [];
    if (!tableSearch.trim()) return singleWorkerData.services;
    const q = tableSearch.toLowerCase();
    return singleWorkerData.services.filter(s => 
      s.client_name?.toLowerCase().includes(q) ||
      s.car_plate?.toLowerCase().includes(q) ||
      s.car_type?.toLowerCase().includes(q) ||
      s.service_name?.toLowerCase().includes(q) ||
      s.products_summary?.toLowerCase().includes(q)
    );
  }, [singleWorkerData?.services, tableSearch]);

  // Filtered Transactions List (in detail view)
  const filteredTransactions = useMemo(() => {
    if (!singleWorkerData?.transactions) return [];
    if (!tableSearch.trim()) return singleWorkerData.transactions;
    const q = tableSearch.toLowerCase();
    return singleWorkerData.transactions.filter(t => 
      t.note?.toLowerCase().includes(q) ||
      t.transaction_type_display?.toLowerCase().includes(q) ||
      t.payment_method_display?.toLowerCase().includes(q)
    );
  }, [singleWorkerData?.transactions, tableSearch]);

  // Filtered Goods / Spare Parts Sales List (in detail view)
  const filteredGoodsSales = useMemo(() => {
    if (!singleWorkerData?.goods_sales) return [];
    if (!tableSearch.trim()) return singleWorkerData.goods_sales;
    const q = tableSearch.toLowerCase();
    return singleWorkerData.goods_sales.filter(s => 
      s.car_plate?.toLowerCase().includes(q) ||
      s.items_summary?.toLowerCase().includes(q) ||
      String(s.sale_id).includes(q) ||
      s.status_display?.toLowerCase().includes(q)
    );
  }, [singleWorkerData?.goods_sales, tableSearch]);

  // Quick Open Modal Handlers
  const handleOpenToolFee = (workerId = null) => {
    const targetId = workerId || (selectedWorkerId !== 'all' ? selectedWorkerId : '');
    const foundWorker = workersList.find(w => String(w.id) === String(targetId));
    setToolFeeForm({
      worker_id: targetId,
      period_month: selectedMonth,
      amount: foundWorker?.monthly_tool_fee || '',
      note: `${selectedMonth} oyi uchun podyomnik va asbob-uskuna to'lovi`
    });
    setShowToolFeeModal(true);
  };

  const handleOpenAdvance = (workerId = null) => {
    const targetId = workerId || (selectedWorkerId !== 'all' ? selectedWorkerId : '');
    setAdvanceForm({
      worker: targetId,
      amount: '',
      payment_method: 'CASH',
      note: 'Avans'
    });
    setShowAdvanceModal(true);
  };

  const handleOpenPayout = (workerId = null) => {
    const targetId = workerId || (selectedWorkerId !== 'all' ? selectedWorkerId : '');
    const foundWorker = workersList.find(w => String(w.id) === String(targetId));
    const payable = foundWorker ? Math.max(0, foundWorker.net_balance_payable_now) : '';
    setPayoutForm({
      worker: targetId,
      amount: payable > 0 ? payable : '',
      payment_method: 'CASH',
      note: `${selectedMonth} oyi bo'yicha hisob-kitob (Oylik to'lov)`,
      basis: 'payable_now'
    });
    setShowPayoutModal(true);
  };

  const handleOpenWorkerPayment = (workerId = null) => {
    const targetId = workerId || (selectedWorkerId !== 'all' ? selectedWorkerId : '');
    const foundWorker = workersList.find(w => String(w.id) === String(targetId));
    const payable = foundWorker ? foundWorker.net_balance_payable_now : 0;
    const debtAmount = payable < 0 ? Math.abs(payable) : '';
    setWorkerPaymentForm({
      worker: targetId,
      amount: debtAmount > 0 ? debtAmount : '',
      payment_method: 'CASH',
      period_month: selectedMonth,
      note: `Qarz / Podyomnik to'lovi yopish (${selectedMonth})`
    });
    setShowWorkerPaymentModal(true);
  };

  const handleOpenConfig = (worker) => {
    setConfigForm({
      worker_id: worker.id,
      worker_name: worker.name,
      monthly_tool_fee: worker.monthly_tool_fee || 0
    });
    setShowConfigModal(true);
  };

  const handlePayToolFee = (workerId = null, feeAmount = null) => {
    const targetId = workerId || (selectedWorkerId !== 'all' ? selectedWorkerId : '');
    const foundWorker = workersList.find(w => String(w.id) === String(targetId));
    const amount = feeAmount !== null ? feeAmount : (foundWorker ? foundWorker.total_tool_fees : (singleWorkerData?.summary?.total_tool_fees || ''));
    setWorkerPaymentForm({
      worker: targetId,
      amount: amount > 0 ? amount : '',
      payment_method: 'CASH',
      period_month: selectedMonth,
      note: `Podyomnik to'lovi uchun to'lov (${selectedMonth})`
    });
    setShowWorkerPaymentModal(true);
  };

  const handlePayWorkerDebt = (workerId = null, debtAmount = null) => {
    const targetId = workerId || (selectedWorkerId !== 'all' ? selectedWorkerId : '');
    const foundWorker = workersList.find(w => String(w.id) === String(targetId));
    const amount = debtAmount !== null ? debtAmount : (foundWorker ? foundWorker.total_worker_debts : (singleWorkerData?.summary?.total_worker_debts || ''));
    setWorkerPaymentForm({
      worker: targetId,
      amount: amount > 0 ? amount : '',
      payment_method: 'CASH',
      period_month: selectedMonth,
      note: `Usta qarzi / Avansni yopish (${selectedMonth})`
    });
    setShowWorkerPaymentModal(true);
  };

  const handleOpenPayGoodsDebt = (sale) => {
    setPayingGoodsSale(sale);
    setGoodsPaymentForm({
      amount: sale.debt_amount || '',
      payment_method: paymentMethodsData?.[0]?.id || '',
      note: `Nasiya tovar qarzi to'lovi (Sotuv #${sale.sale_id || sale.id})`
    });
  };

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1600px', margin: '0 auto' }}>
      
      {/* 1. TOP HEADER & TOOLBAR */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '16px',
        marginBottom: '20px',
        flexWrap: 'wrap'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--primary), #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)'
            }}>
              <Wrench size={20} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                Ustalar hisobi (Tabel)
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', margin: 0 }}>
                Ustalar xizmat haqlari, tashkilot to'lovlari, podyomnik/asbob ushlanmalari va oylik hisob-kitoblar.
              </p>
            </div>
          </div>
        </div>

        {/* Global Toolbar: Month Picker & Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          
          {/* Month Switcher Pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
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

          {/* Quick Action Buttons */}
          <button
            onClick={() => handleOpenToolFee()}
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
            <Layers size={16} color="#8b5cf6" />
            <span>Podyomnik to'lovi yozish</span>
          </button>

          <button
            onClick={() => handleOpenAdvance()}
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
            <Wallet size={16} color="#f59e0b" />
            <span>Qarz / Avans yozish</span>
          </button>

          <button
            onClick={() => handleOpenPayout()}
            className="btn btn-primary"
            style={{
              padding: '0 16px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.88rem'
            }}
          >
            <CheckCircle2 size={16} />
            <span>Hisob-kitob (To'lov)</span>
          </button>

          <button
            onClick={() => handleOpenWorkerPayment()}
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
            <span>+ Ustadan to'lov (Qarz yopish)</span>
          </button>

          <button
            onClick={() => {
              refetchAll();
              if (selectedWorkerId !== 'all') refetchSingle();
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

      {/* 2. EXCEL-STYLE WORKER TABS (Bottom/Top tab switcher) */}
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
        {/* All Workers Comparison Tab */}
        <button
          onClick={() => setSelectedWorkerId('all')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '12px',
            border: selectedWorkerId === 'all' ? '1px solid var(--primary)' : '1px solid var(--border)',
            backgroundColor: selectedWorkerId === 'all' ? 'var(--primary)' : 'var(--surface)',
            color: selectedWorkerId === 'all' ? '#ffffff' : 'var(--text-main)',
            fontWeight: 700,
            fontSize: '0.88rem',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxShadow: selectedWorkerId === 'all' ? '0 4px 14px rgba(99, 102, 241, 0.3)' : 'var(--shadow-sm)',
            transition: 'all 0.2s ease'
          }}
        >
          <FileSpreadsheet size={16} />
          <span>📊 Barcha ustalar (Taqqoslash)</span>
          <span style={{
            fontSize: '0.75rem',
            padding: '2px 8px',
            borderRadius: '10px',
            backgroundColor: selectedWorkerId === 'all' ? 'rgba(255,255,255,0.25)' : 'var(--surface-hover)',
            color: selectedWorkerId === 'all' ? '#ffffff' : 'var(--text-muted)'
          }}>
            {workersList.length}
          </span>
        </button>

        {/* Individual Worker Tabs */}
        {workersList.map(w => {
          const isSelected = String(selectedWorkerId) === String(w.id);
          const hasPendingDebt = w.unpaid_company_debt_service > 0;
          const payableBalance = w.net_balance_payable_now;

          return (
            <button
              key={w.id}
              onClick={() => setSelectedWorkerId(w.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '12px',
                border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                backgroundColor: isSelected ? 'var(--surface)' : 'var(--surface)',
                color: isSelected ? 'var(--primary)' : 'var(--text-main)',
                fontWeight: isSelected ? 700 : 600,
                fontSize: '0.86rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                position: 'relative',
                boxShadow: isSelected ? '0 0 0 2px rgba(99, 102, 241, 0.2)' : 'var(--shadow-sm)',
                transition: 'all 0.2s ease'
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
                {w.name ? w.name.charAt(0).toUpperCase() : 'U'}
              </div>

              <span>{w.name}</span>
              {w.job && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  ({w.job})
                </span>
              )}

              {/* Net Balance Pill */}
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: '8px',
                backgroundColor: payableBalance > 0 
                  ? 'rgba(16, 185, 129, 0.12)' 
                  : payableBalance < 0 
                    ? 'rgba(239, 68, 68, 0.12)' 
                    : 'var(--surface-hover)',
                color: payableBalance > 0 
                  ? '#10b981' 
                  : payableBalance < 0 
                    ? 'var(--danger)' 
                    : 'var(--text-muted)'
              }}>
                {payableBalance > 0 ? `+${(payableBalance / 1000).toFixed(0)}k` : `${(payableBalance / 1000).toFixed(0)}k`}
              </span>

              {hasPendingDebt && (
                <span 
                  title={`Tashkilot qarzida: ${formatMoney(w.unpaid_company_debt_service)}`}
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
      </div>

      {/* 3. MAIN CONTENT: CONDITIONAL (ALL WORKERS COMPARISON vs SINGLE WORKER TAB) */}
      {selectedWorkerId === 'all' ? (
        /* ======================== ALL WORKERS COMPARISON VIEW ======================== */
        <div>
          {/* Comparison KPI Header */}
          <div className="all-workers-kpi-grid">
            <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--primary)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Jami xizmat haqi (Barcha ustalar)</span>
                  <StatHelpTooltip
                    title="Jami xizmat haqi"
                    meaning="Barcha ustalar bajargan xizmatlar bo'yicha hisoblangan umumiy ish haqi summasi."
                    formula="Barcha ustalarning (xizmat narxi × usta ulushi %) yig'indisi"
                  />
                </div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--primary)' }}>
                  {formatMoney(workersList.reduce((sum, w) => sum + (w.total_service_earned || 0), 0))}
                </div>
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                {workersList.reduce((sum, w) => sum + (w.services_count || 0), 0)} ta bajarilgan xizmat
              </div>
            </div>

            <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Tashkilotlar to'lagan (Tushgan)</span>
                  <StatHelpTooltip
                    title="Tashkilotlar to'lagan (Tushgan)"
                    meaning="Mijozlar yoki korxonalar to'lab bergan xizmatlar bo'yicha ustaga haqiqatda yetib kelgan va hozir to'lashga ruxsat etilgan summa."
                    formula="To'langan xizmatlar bo'yicha usta ulushlari"
                  />
                </div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#10b981' }}>
                  {formatMoney(workersList.reduce((sum, w) => sum + (w.paid_service_earned || 0), 0))}
                </div>
              </div>
              <div style={{ fontSize: '0.76rem', color: '#10b981', fontWeight: 600, marginTop: '8px' }}>
                Darhol hisob-kitob qilish mumkin
              </div>
            </div>

            <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #f59e0b', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Tashkilotlar qarzida turgan</span>
                  <StatHelpTooltip
                    title="Tashkilotlar qarzida turgan"
                    meaning="Korxona yoki nasiya mijozlar hali to'lamagan xizmatlar. Ushbu summa korxona pul o'tkazgach, ustaga to'lanadi."
                    formula="Kompaniya qarzidagi xizmatlar bo'yicha usta ulushlari"
                    align="right"
                  />
                </div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#f59e0b' }}>
                  {formatMoney(workersList.reduce((sum, w) => sum + (w.unpaid_company_debt_service || 0), 0))}
                </div>
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                Kompaniya to'lagach, ustaga to'lanadi
              </div>
            </div>

            <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #8b5cf6', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Podyomnik va asbob ushlanmasi</span>
                  <StatHelpTooltip
                    title="Podyomnik va asbob ushlanmasi"
                    meaning="Ustaxona tomonidan ustalardan podyomnik va asbob-uskuna ijarasi uchun hisoblangan oylik ushlanmalar summasi."
                    formula="Barcha ustalarning podyomnik to'lovlari yig'indisi"
                    align="right"
                  />
                </div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#8b5cf6' }}>
                  {formatMoney(workersList.reduce((sum, w) => sum + (w.total_tool_fees || 0), 0))}
                </div>
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                Ustaxona daromadiga ushlab qolingan
              </div>
            </div>

            <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #3b82f6', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Hozir to'lanadigan sof qoldiq</span>
                  <StatHelpTooltip
                    title="Hozir to'lanadigan sof qoldiq"
                    meaning="Kassadan ustalarga hozir to'lab berilishi lozim bo'lgan naqd pul qoldig'i (Kompaniya qarzidagi xizmatlar chiqarilgan)."
                    formula="Tushgan xizmat haqi - Podyomnik to'lovi - Avanslar + Ustadan tushgan to'lovlar - To'langan oyliklar"
                    align="right"
                  />
                </div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#3b82f6' }}>
                  {formatMoney(workersList.reduce((sum, w) => sum + (w.net_balance_payable_now || 0), 0))}
                </div>
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Jami hisoblangan: {formatMoney(workersList.reduce((sum, w) => sum + (w.net_balance_total || 0), 0))}
              </div>
            </div>
          </div>

          {/* All Workers Comparison Matrix Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--surface)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileSpreadsheet size={18} color="var(--primary)" />
                <span style={{ fontWeight: 700, fontSize: '1rem' }}>
                  {selectedMonth} oyi bo'yicha barcha ustalar tabeli
                </span>
              </div>
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    setToolFeeForm({
                      worker_id: '',
                      period_month: selectedMonth,
                      amount: '',
                      note: `${selectedMonth} oyi uchun oylik podyomnik to'lovi`
                    });
                    setShowToolFeeModal(true);
                  }}
                  className="btn btn-secondary"
                  style={{ height: '34px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Layers size={14} /> Barcha ustalar uchun podyomnik to'lovi
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-hover)', textAlign: 'left', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>Usta / Mutaxassis</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                        <span>Jami xizmat haqi</span>
                        <StatHelpTooltip
                          title="Jami xizmat haqi"
                          meaning="Usta bajargan barcha xizmatlar bo'yicha hisoblangan umumiy ish haqi ulushi."
                          formula="Σ (Xizmat narxi × Usta ulushi %)"
                        />
                      </div>
                    </th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right', color: '#10b981', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                        <span>Tushgan (Tashkilot)</span>
                        <StatHelpTooltip
                          title="Tushgan xizmat haqi"
                          meaning="Mijozlar to'lagan va ustaga berishga tayyor bo'lgan ish haqi."
                          formula="To'langan xizmatlar bo'yicha usta ulushi"
                        />
                      </div>
                    </th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right', color: '#f59e0b', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                        <span>Qarzda (Tashkilot)</span>
                        <StatHelpTooltip
                          title="Tashkilot qarzidagi xizmat"
                          meaning="Kompaniya yoki nasiya mijoz hali pulini to'lamagan xizmatlar ulushi (Pul tushgach to'lanadi)."
                          formula="Kompaniya qarzidagi xizmatlar bo'yicha usta ulushi"
                          align="right"
                        />
                      </div>
                    </th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right', color: '#8b5cf6', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                        <span>Podyomnik to'lovi</span>
                        <StatHelpTooltip
                          title="Podyomnik to'lovi"
                          meaning="Ustaxona tomonidan podyomnik va asboblardan foydalanganlik uchun ushlab qolinadigan oylik to'lov."
                          formula="Oylik belgilangan podyomnik normasi"
                          align="right"
                        />
                      </div>
                    </th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right', color: 'var(--danger)', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                        <span>Avans / Qarz</span>
                        <StatHelpTooltip
                          title="Usta qarzi / Avans"
                          meaning="Ustaga oldindan berilgan naqd avanslar va qarzlar."
                          formula="Σ Berilgan avanslar va qarzlar"
                          align="right"
                        />
                      </div>
                    </th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right', color: '#ec4899', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                        <span>Tovar qarzi (Nasiya)</span>
                        <StatHelpTooltip
                          title="Tovar qarzi (Nasiya)"
                          meaning="Usta do'kondan o'zi yoki mashina uchun nasiyaga olgan ehtiyot qismlarining to'lanmagan qarzi."
                          formula="Σ Nasiyaga olingan tovarlar qarz qoldig'i"
                          align="right"
                        />
                      </div>
                    </th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right', color: '#3b82f6', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                        <span>To'langan oylik</span>
                        <StatHelpTooltip
                          title="To'langan oylik"
                          meaning="Ushbu oy davomida ustaga kassadan oylik hisob-kitob sifatida berilgan pullar."
                          formula="Σ Kassadan ustaga berilgan oylik to'lovlar"
                          align="right"
                        />
                      </div>
                    </th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                        <span>Sof qoldiq (Hozir)</span>
                        <StatHelpTooltip
                          title="Sof qoldiq (Hozir to'lanadigan)"
                          meaning="Ustaga hozirning o'zida kassadan to'lab berilishi lozim bo'lgan sof summa."
                          formula="Tushgan xizmat haqi - Podyomnik - Avanslar + Ustadan to'lovlar - To'langan oylik"
                          align="right"
                        />
                      </div>
                    </th>
                    <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap', minWidth: '270px' }}>Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {isAllLoading ? (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                        Yuklanmoqda...
                      </td>
                    </tr>
                  ) : workersList.length === 0 ? (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                        Faol ustalar topilmadi.
                      </td>
                    </tr>
                  ) : (
                    workersList.map(w => {
                      const payable = w.net_balance_payable_now;
                      const hasToolFee = w.total_tool_fees > 0;

                      return (
                        <tr 
                          key={w.id} 
                          style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background-color 0.15s' }}
                          onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
                          onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          onClick={() => setSelectedWorkerId(w.id)}
                        >
                          <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{
                                width: '32px',
                                height: '32px',
                                minWidth: '32px',
                                borderRadius: '8px',
                                backgroundColor: 'var(--primary-light)',
                                color: 'var(--primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '0.85rem'
                              }}>
                                {w.name ? w.name.charAt(0).toUpperCase() : 'U'}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>{w.name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {w.job || 'Usta'} • {w.services_count} ta ish
                                </div>
                              </div>
                            </div>
                          </td>

                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                            {formatMoney(w.total_service_earned)}
                          </td>

                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#10b981', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                            {formatMoney(w.paid_service_earned)}
                          </td>

                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: w.unpaid_company_debt_service > 0 ? '#f59e0b' : 'var(--text-muted)', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                            {w.unpaid_company_debt_service > 0 ? formatMoney(w.unpaid_company_debt_service) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>

                          <td style={{ padding: '12px 14px', textAlign: 'right', color: '#8b5cf6', fontWeight: 600, verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                              <div style={{ whiteSpace: 'nowrap' }}>
                                {hasToolFee ? formatMoney(w.total_tool_fees) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                              </div>
                              {hasToolFee && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePayToolFee(w.id, w.total_tool_fees);
                                  }}
                                  className="btn"
                                  style={{
                                    height: '24px',
                                    padding: '0 8px',
                                    fontSize: '0.72rem',
                                    backgroundColor: 'rgba(139, 92, 246, 0.15)',
                                    color: '#8b5cf6',
                                    border: '1px solid rgba(139, 92, 246, 0.3)',
                                    borderRadius: '6px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title="Podyomnik to'lovini to'lash"
                                >
                                  <DollarSign size={11} /> To'lash
                                </button>
                              )}
                            </div>
                          </td>

                          <td style={{ padding: '12px 14px', textAlign: 'right', color: w.total_worker_debts > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 600, verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                              <div style={{ whiteSpace: 'nowrap' }}>
                                {w.total_worker_debts > 0 ? formatMoney(w.total_worker_debts) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                              </div>
                              {w.total_worker_debts > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePayWorkerDebt(w.id, w.total_worker_debts);
                                  }}
                                  className="btn"
                                  style={{
                                    height: '24px',
                                    padding: '0 8px',
                                    fontSize: '0.72rem',
                                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                                    color: 'var(--danger)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    borderRadius: '6px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title="Qarz / Avansni yopish"
                                >
                                  <ArrowDownRight size={11} /> Qarz yopish
                                </button>
                              )}
                              {Number(w.total_worker_payments || 0) > 0 && (
                                <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  To'langan: +{formatMoney(w.total_worker_payments)}
                                </div>
                              )}
                            </div>
                          </td>

                          <td style={{ padding: '12px 14px', textAlign: 'right', color: (w.total_goods_debt || 0) > 0 ? '#ec4899' : 'var(--text-muted)', fontWeight: (w.total_goods_debt || 0) > 0 ? 700 : 500, verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                              <div style={{ whiteSpace: 'nowrap' }}>
                                {(w.total_goods_debt || 0) > 0 ? formatMoney(w.total_goods_debt) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                              </div>
                              {(w.total_goods_debt || 0) > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedWorkerId(w.id);
                                    setActiveSubTab('goods_debts');
                                  }}
                                  className="btn"
                                  style={{
                                    height: '24px',
                                    padding: '0 8px',
                                    fontSize: '0.72rem',
                                    backgroundColor: 'rgba(236, 72, 153, 0.12)',
                                    color: '#ec4899',
                                    border: '1px solid rgba(236, 72, 153, 0.3)',
                                    borderRadius: '6px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title="Nasiya tovar qarzini ko'rish va to'lash"
                                >
                                  <ShoppingBag size={11} /> To'lash
                                </button>
                              )}
                            </div>
                          </td>

                          <td style={{ padding: '12px 14px', textAlign: 'right', color: '#3b82f6', fontWeight: 600, verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                            {w.total_payouts > 0 ? formatMoney(w.total_payouts) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>

                          <td style={{ padding: '12px 14px', textAlign: 'right', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                              <div style={{
                                fontWeight: 800,
                                fontSize: '0.95rem',
                                color: payable > 0 ? '#10b981' : payable < 0 ? 'var(--danger)' : 'var(--text-muted)',
                                whiteSpace: 'nowrap'
                              }}>
                                {formatMoney(payable)}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                Jami: {formatMoney(w.net_balance_total)}
                              </div>
                            </div>
                          </td>

                          <td style={{ padding: '12px 14px', textAlign: 'center', verticalAlign: 'top', minWidth: '270px' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center', flexWrap: 'nowrap' }}>
                              <button
                                onClick={() => setSelectedWorkerId(w.id)}
                                className="btn btn-secondary"
                                style={{ height: '28px', padding: '0 10px', fontSize: '0.76rem', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                title="Batafsil tabel"
                              >
                                <Eye size={12} /> Tabel
                              </button>
                              <button
                                onClick={() => handleOpenPayout(w.id)}
                                className="btn btn-primary"
                                style={{ height: '28px', padding: '0 10px', fontSize: '0.76rem', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                title="Hisob-kitob qilish (Oylik to'lash)"
                              >
                                <CheckCircle2 size={12} /> To'lash
                              </button>
                              <button
                                onClick={() => handleOpenWorkerPayment(w.id)}
                                className="btn"
                                style={{
                                  height: '28px',
                                  padding: '0 10px',
                                  fontSize: '0.76rem',
                                  backgroundColor: '#10b981',
                                  color: '#fff',
                                  fontWeight: 700,
                                  borderRadius: '6px',
                                  border: 'none',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="Ustadan to'lov qabul qilish (Qarz yopish)"
                              >
                                <ArrowDownRight size={12} /> + To'lov
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
        /* ======================== SINGLE WORKER DETAILED TAB VIEW ======================== */
        <div>
          {/* Worker Profile Sub-header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            padding: '14px 20px',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, var(--primary), #8b5cf6)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
                fontWeight: 800
              }}>
                {singleWorkerData?.worker?.name ? singleWorkerData.worker.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                    {singleWorkerData?.worker?.name || currentWorkerObj?.name || 'Usta'}
                  </h2>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--primary-light)',
                    color: 'var(--primary)'
                  }}>
                    {singleWorkerData?.worker?.job || currentWorkerObj?.job || 'Usta'}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Tel: {singleWorkerData?.worker?.phone_number || currentWorkerObj?.phone_number || '—'} • Oylik podyomnik normasi: {formatMoney(singleWorkerData?.worker?.monthly_tool_fee || currentWorkerObj?.monthly_tool_fee || 0)}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => currentWorkerObj && handleOpenConfig(currentWorkerObj)}
                className="btn btn-secondary"
                style={{ height: '36px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Podyomnik normasini sozlash"
              >
                <Settings size={15} /> Normani sozlash
              </button>
              <button
                onClick={() => handleOpenToolFee(selectedWorkerId)}
                className="btn btn-secondary"
                style={{ height: '36px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Layers size={15} color="#8b5cf6" /> Podyomnik to'lovi yozish
              </button>
              <button
                onClick={() => handleOpenAdvance(selectedWorkerId)}
                className="btn btn-secondary"
                style={{ height: '36px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Wallet size={15} color="#f59e0b" /> Avans yozish
              </button>
              <button
                onClick={() => handleOpenPayout(selectedWorkerId)}
                className="btn btn-primary"
                style={{ height: '36px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <CheckCircle2 size={15} /> Hisob-kitob (To'lov)
              </button>
              <button
                onClick={() => handleOpenWorkerPayment(selectedWorkerId)}
                className="btn"
                style={{
                  height: '36px',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#10b981',
                  color: '#fff',
                  fontWeight: 700,
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <ArrowDownRight size={15} /> + Ustadan to'lov
              </button>
            </div>
          </div>

          {/* KPI Summary Cards for Selected Worker */}
          {(() => {
            const sum = singleWorkerData?.summary || {};
            const totalEarned = sum.total_service_earned || 0;
            const paidEarned = sum.paid_service_earned || 0;
            const unpaidEarned = sum.unpaid_company_debt_service || 0;
            const toolFees = sum.total_tool_fees || 0;
            const workerDebts = sum.total_worker_debts || 0;
            const payouts = sum.total_payouts || 0;
            const payableNow = sum.net_balance_payable_now || 0;
            const netTotal = sum.net_balance_total || 0;

            return (
              <div className="worker-kpi-grid">
                {/* 1. Total Earned */}
                <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--primary)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '210px' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                        <span>Jami yozilgan xizmat</span>
                        <StatHelpTooltip
                          title="Jami yozilgan xizmat"
                          meaning="Usta tomonidan ushbu davrda bajarilgan barcha xizmatlar bo'yicha hisoblangan jami ish haqi."
                          formula="Σ (Xizmat narxi × Usta ulushi %)"
                        />
                      </div>
                      <Wrench size={16} color="var(--primary)" />
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--primary)' }}>
                      {formatMoney(totalEarned)}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {sum.services_count || 0} ta xizmat bo'yicha
                    </div>
                  </div>
                  <div style={{ marginTop: 'auto', paddingTop: '10px', height: '32px', display: 'flex', alignItems: 'center', fontSize: '0.74rem', color: 'var(--text-muted)', gap: '4px' }}>
                    <Wrench size={12} color="var(--primary)" /> Usta ish haqi ulushi
                  </div>
                </div>

                {/* 2. Realized vs Pending */}
                <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '210px' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                        <span>Tashkilotdan tushgan</span>
                        <StatHelpTooltip
                          title="Tashkilotdan tushgan / Qarzda"
                          meaning="Tushgan: mijoz to'lagan xizmat haqi. Qarzda: korxona to'lovini kutayotgan xizmat haqi (tushgach ustaga to'lanadi)."
                          formula="Tushgan = To'langan xizmatlar ulushi, Qarzda = To'lanmagan korxona xizmatlari"
                        />
                      </div>
                      <CheckCircle2 size={16} color="#10b981" />
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#10b981' }}>
                      {formatMoney(paidEarned)}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#f59e0b', fontWeight: 600, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} /> Qarzda: {formatMoney(unpaidEarned)}
                    </div>
                  </div>
                  <div style={{ marginTop: 'auto', paddingTop: '10px', height: '32px', display: 'flex', alignItems: 'center', fontSize: '0.74rem', color: '#10b981', gap: '4px' }}>
                    <CheckCircle2 size={12} /> To'langan xizmatlar
                  </div>
                </div>

                {/* 3. Tool Fee */}
                <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #8b5cf6', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '210px' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                        <span>Podyomnik to'lovi</span>
                        <StatHelpTooltip
                          title="Podyomnik va asbob to'lovi"
                          meaning="Usta ustaxonaning podyomnik va asboblaridan foydalanganlik uchun to'lashi lozim bo'lgan oylik to'lov."
                          formula="Usta profilidagi oylik podyomnik tarifi"
                        />
                      </div>
                      <Layers size={16} color="#8b5cf6" />
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#8b5cf6' }}>
                      {formatMoney(toolFees)}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Oylik doimiy ushlanma
                    </div>
                  </div>
                  {toolFees > 0 ? (
                    <button
                      type="button"
                      onClick={() => handlePayToolFee(selectedWorkerId, toolFees)}
                      className="btn"
                      style={{
                        marginTop: 'auto',
                        width: '100%',
                        height: '32px',
                        fontSize: '0.76rem',
                        backgroundColor: 'rgba(139, 92, 246, 0.15)',
                        color: '#8b5cf6',
                        border: '1px solid rgba(139, 92, 246, 0.3)',
                        borderRadius: '6px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                      title="Podyomnik to'lovini to'lash"
                    >
                      <DollarSign size={13} /> Podyomnik to'lash
                    </button>
                  ) : (
                    <div style={{ marginTop: 'auto', paddingTop: '10px', height: '32px', display: 'flex', alignItems: 'center', fontSize: '0.74rem', color: 'var(--text-muted)', gap: '4px' }}>
                      <Layers size={12} color="#8b5cf6" /> To'lov yo'q
                    </div>
                  )}
                </div>

                {/* 4. Worker Debt / Advances */}
                <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--danger)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '210px' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                        <span>Usta qarzi / Avanslar</span>
                        <StatHelpTooltip
                          title="Usta qarzi va avanslar"
                          meaning="Ustaga oldindan berilgan avans pullari yoki olingan qarzlar."
                          formula="Σ Berilgan avanslar va qarzlar"
                        />
                      </div>
                      <Wallet size={16} color="var(--danger)" />
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--danger)' }}>
                      {formatMoney(workerDebts)}
                    </div>
                    {Number(sum.total_worker_payments || 0) > 0 ? (
                      <div style={{ fontSize: '0.74rem', color: '#10b981', fontWeight: 700, marginTop: '4px', whiteSpace: 'nowrap' }}>
                        Ustadan tushgan: +{formatMoney(sum.total_worker_payments)}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Avans va qarzlar
                      </div>
                    )}
                  </div>
                  {workerDebts > 0 ? (
                    <button
                      type="button"
                      onClick={() => handlePayWorkerDebt(selectedWorkerId, workerDebts)}
                      className="btn"
                      style={{
                        marginTop: 'auto',
                        width: '100%',
                        height: '32px',
                        fontSize: '0.76rem',
                        backgroundColor: 'rgba(239, 68, 68, 0.12)',
                        color: 'var(--danger)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '6px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                      title="Qarz / Avansni yopish"
                    >
                      <ArrowDownRight size={13} /> Qarzni to'lash (Yopish)
                    </button>
                  ) : (
                    <div style={{ marginTop: 'auto', paddingTop: '10px', height: '32px', display: 'flex', alignItems: 'center', fontSize: '0.74rem', color: 'var(--text-muted)', gap: '4px' }}>
                      <Wallet size={12} color="var(--danger)" /> Avans qarzi yo'q
                    </div>
                  )}
                </div>

                {/* 5. Goods Debt / Nasiya tovarlar */}
                <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #ec4899', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '210px' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                        <span>Nasiya tovarlar qarzi</span>
                        <StatHelpTooltip
                          title="Nasiya tovarlar qarzi"
                          meaning="Usta do'kondan qarzga olgan ehtiyot qismlar va tovarlarning to'lanmagan summasi."
                          formula="Σ Nasiya tovar sotuvlari bo'yicha qarz qoldig'i"
                          align="right"
                        />
                      </div>
                      <ShoppingBag size={16} color="#ec4899" />
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#ec4899' }}>
                      {formatMoney(sum.total_goods_debt_all_time || sum.total_goods_debt || 0)}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {sum.goods_sales_count || 0} ta chek bo'yicha ehtiyot qismlar
                    </div>
                  </div>
                  {Number(sum.total_goods_debt_all_time || sum.total_goods_debt || 0) > 0 ? (
                    <button
                      type="button"
                      onClick={() => setActiveSubTab('goods_debts')}
                      className="btn"
                      style={{
                        marginTop: 'auto',
                        width: '100%',
                        height: '32px',
                        fontSize: '0.76rem',
                        backgroundColor: 'rgba(236, 72, 153, 0.12)',
                        color: '#ec4899',
                        border: '1px solid rgba(236, 72, 153, 0.3)',
                        borderRadius: '6px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                      title="Nasiya tovar qarzini ko'rish va to'lash"
                    >
                      <ShoppingBag size={13} /> Qarzni to'lash (Ro'yxat)
                    </button>
                  ) : (
                    <div style={{ marginTop: 'auto', paddingTop: '10px', height: '32px', display: 'flex', alignItems: 'center', fontSize: '0.74rem', color: 'var(--text-muted)', gap: '4px' }}>
                      <ShoppingBag size={12} color="#ec4899" /> Nasiya tovar qarzi yo'q
                    </div>
                  )}
                </div>

                {/* 6. Paid Out */}
                <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #3b82f6', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '210px' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                        <span>To'langan oylik</span>
                        <StatHelpTooltip
                          title="To'langan oylik"
                          meaning="Bu oyda ustaga kassadan oylik hisob-kitob (Payout) sifatida berilgan pullar."
                          formula="Σ Kassadan ustaga berilgan oylik to'lovlar"
                          align="right"
                        />
                      </div>
                      <ArrowDownRight size={16} color="#3b82f6" />
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#3b82f6' }}>
                      {formatMoney(payouts)}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Bu oyda berilgan to'lovlar
                    </div>
                  </div>
                  <div style={{ marginTop: 'auto', paddingTop: '10px', height: '32px', display: 'flex', alignItems: 'center', fontSize: '0.74rem', color: '#3b82f6', gap: '4px' }}>
                    <ArrowDownRight size={12} /> Kassadan to'langan
                  </div>
                </div>

                {/* 7. NET PAYABLE NOW (Featured Spotlight Card) */}
                <div className="card worker-kpi-featured" style={{
                  padding: '16px 20px',
                  background: payableNow >= 0 
                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(99, 102, 241, 0.08))' 
                    : 'rgba(239, 68, 68, 0.12)',
                  border: payableNow >= 0 ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '210px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                        <span>SOF TO'LANADIGAN QOLDIQ</span>
                        <StatHelpTooltip
                          title="Sof to'lanadigan qoldiq"
                          meaning="Kassadan ustaga hozirning o'zida to'lab berilishi lozim bo'lgan sof summa."
                          formula="Tushgan xizmat haqi - Podyomnik - Avanslar + Ustadan to'lovlar - To'langan oylik"
                          align="right"
                        />
                      </div>
                      <span style={{
                        fontSize: '0.72rem',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: payableNow >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: payableNow >= 0 ? '#10b981' : 'var(--danger)',
                        fontWeight: 700
                      }}>
                        {payableNow >= 0 ? "Kassadan to'lanadi" : "Usta qarzdor"}
                      </span>
                    </div>
                    <div style={{
                      fontSize: '1.75rem',
                      fontWeight: 900,
                      color: payableNow >= 0 ? '#10b981' : 'var(--danger)',
                      letterSpacing: '-0.02em',
                      lineHeight: 1.2
                    }}>
                      {formatMoney(payableNow)}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Jami hisoblangan: <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{formatMoney(netTotal)}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 'auto', paddingTop: '10px', display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => handleOpenPayout(selectedWorkerId)}
                      className="btn btn-primary"
                      style={{ flex: 1, height: '34px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                      title="Hisob-kitob qilish (Oylik to'lash)"
                    >
                      <CheckCircle2 size={14} /> Hisob-kitob (Oylik to'lash)
                    </button>
                    <button
                      onClick={() => handleOpenWorkerPayment(selectedWorkerId)}
                      className="btn"
                      style={{
                        flex: 1,
                        height: '34px',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        backgroundColor: '#10b981',
                        color: '#fff',
                        fontWeight: 700,
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                      title="Ustadan to'lov qabul qilish (Qarz yopish)"
                    >
                      <ArrowDownRight size={14} /> + Ustadan to'lov
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Sub-Tabs Selector & Search/Filters Bar */}
          <div className="card" style={{ padding: '14px 18px', marginBottom: '16px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px'
            }}>
              {/* Sub-Tab Navigation Buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setActiveSubTab('jobs')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: activeSubTab === 'jobs' ? 'var(--primary)' : 'var(--surface-hover)',
                    color: activeSubTab === 'jobs' ? '#fff' : 'var(--text-main)',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Car size={16} />
                  <span>Bajargan ishlari va Tashkilotlar</span>
                  <span style={{
                    fontSize: '0.72rem',
                    padding: '1px 7px',
                    borderRadius: '10px',
                    backgroundColor: activeSubTab === 'jobs' ? 'rgba(255,255,255,0.25)' : 'var(--surface)',
                    color: activeSubTab === 'jobs' ? '#fff' : 'var(--text-muted)'
                  }}>
                    {singleWorkerData?.services?.length || 0}
                  </span>
                </button>

                <button
                  onClick={() => setActiveSubTab('goods_debts')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: activeSubTab === 'goods_debts' ? '#ec4899' : 'var(--surface-hover)',
                    color: activeSubTab === 'goods_debts' ? '#fff' : 'var(--text-main)',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <ShoppingBag size={16} />
                  <span>Nasiya tovarlar va Ehtiyot qismlar</span>
                  <span style={{
                    fontSize: '0.72rem',
                    padding: '1px 7px',
                    borderRadius: '10px',
                    backgroundColor: activeSubTab === 'goods_debts' ? 'rgba(255,255,255,0.25)' : 'var(--surface)',
                    color: activeSubTab === 'goods_debts' ? '#fff' : 'var(--text-muted)'
                  }}>
                    {singleWorkerData?.goods_sales?.length || 0}
                  </span>
                </button>

                <button
                  onClick={() => setActiveSubTab('deductions')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: activeSubTab === 'deductions' ? 'var(--primary)' : 'var(--surface-hover)',
                    color: activeSubTab === 'deductions' ? '#fff' : 'var(--text-main)',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Layers size={16} />
                  <span>Ushlanmalar, Podyomnik va Avanslar</span>
                  <span style={{
                    fontSize: '0.72rem',
                    padding: '1px 7px',
                    borderRadius: '10px',
                    backgroundColor: activeSubTab === 'deductions' ? 'rgba(255,255,255,0.25)' : 'var(--surface)',
                    color: activeSubTab === 'deductions' ? '#fff' : 'var(--text-muted)'
                  }}>
                    {singleWorkerData?.transactions?.length || 0}
                  </span>
                </button>
              </div>

              {/* Filters & Search */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
                {activeSubTab === 'jobs' && (
                  <>
                    {/* Company Filter Pill */}
                    <select
                      value={isCompanyFilter}
                      onChange={e => setIsCompanyFilter(e.target.value)}
                      className="input-field"
                      style={{ height: '36px', padding: '0 10px', fontSize: '0.82rem', marginBottom: 0, width: 'auto' }}
                    >
                      <option value="">Barcha mijozlar</option>
                      <option value="true">Faqat tashkilotlar (Kompaniya)</option>
                      <option value="false">Jismoniy shaxslar</option>
                    </select>

                    {/* Payment Status Filter */}
                    <select
                      value={paymentStatusFilter}
                      onChange={e => setPaymentStatusFilter(e.target.value)}
                      className="input-field"
                      style={{ height: '36px', padding: '0 10px', fontSize: '0.82rem', marginBottom: 0, width: 'auto' }}
                    >
                      <option value="">To'lov holati: Barchasi</option>
                      <option value="PAID">To'langan (Tushgan)</option>
                      <option value="UNPAID">Qarzda turgan</option>
                      <option value="PARTIAL">Qisman to'langan</option>
                    </select>
                  </>
                )}

                {/* Table search input */}
                <input
                  type="text"
                  placeholder="Qidiruv..."
                  value={tableSearch}
                  onChange={e => setTableSearch(e.target.value)}
                  className="input-field"
                  style={{ height: '36px', width: '180px', padding: '0 10px', fontSize: '0.82rem', marginBottom: 0 }}
                />
              </div>
            </div>
          </div>

          {/* Sub-Tab Content */}
          {activeSubTab === 'jobs' ? (
            /* ================= SUB-TAB 1: COMPLETED JOBS & CLIENT DEBTS ================= */
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--surface-hover)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Sana</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Sotuv #</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Tashkilot / Mijoz</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Mashina</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Xizmat tavsifi</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Ishlatilgan ehtiyot qismlar</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>Xizmat haqi</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'center' }}>Kompaniya to'lovi</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>Tushgan ulush</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isSingleLoading ? (
                      <tr>
                        <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                          Xizmatlar yuklanmoqda...
                        </td>
                      </tr>
                    ) : filteredServices.length === 0 ? (
                      <tr>
                        <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                          Belgilangan davrda ushbu usta uchun bajarilgan ishlar topilmadi.
                        </td>
                      </tr>
                    ) : (
                      filteredServices.map(svc => {
                        const isCompany = svc.is_company;
                        const isPaid = svc.payment_status === 'PAID';
                        const isPartial = svc.payment_status === 'PARTIAL';

                        return (
                          <tr key={svc.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                              {new Date(svc.datetime).toLocaleDateString('uz-UZ')} {new Date(svc.datetime).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                            </td>

                            <td style={{ padding: '12px 14px', fontWeight: 700 }}>
                              <span style={{
                                backgroundColor: 'var(--surface-hover)',
                                padding: '3px 7px',
                                borderRadius: '6px',
                                border: '1px solid var(--border)',
                                fontSize: '0.8rem'
                              }}>
                                #{svc.sale_id}
                              </span>
                            </td>

                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {isCompany && (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    backgroundColor: 'rgba(99, 102, 241, 0.12)',
                                    color: 'var(--primary)',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    padding: '2px 6px',
                                    borderRadius: '5px'
                                  }}>
                                    <Building2 size={11} /> Kompaniya
                                  </span>
                                )}
                                <span style={{ fontWeight: 600 }}>{svc.client_name}</span>
                              </div>
                            </td>

                            <td style={{ padding: '12px 14px' }}>
                              {svc.car_plate ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <span style={{
                                    border: '1px solid var(--border)',
                                    backgroundColor: 'var(--surface-hover)',
                                    borderRadius: '4px',
                                    padding: '1px 5px',
                                    fontWeight: 700,
                                    fontSize: '0.78rem'
                                  }}>
                                    {svc.car_plate}
                                  </span>
                                  {svc.car_type && (
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                      ({svc.car_type})
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>—</span>
                              )}
                            </td>

                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                              {svc.service_name}
                            </td>

                            <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.8rem', maxWidth: '200px' }}>
                              <span title={svc.products_summary} style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                              }}>
                                {svc.products_summary}
                              </span>
                            </td>

                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, fontSize: '0.92rem' }}>
                              {formatMoney(svc.amount)}
                            </td>

                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '3px 9px',
                                borderRadius: '12px',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                backgroundColor: isPaid ? 'rgba(16, 185, 129, 0.12)' : isPartial ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                color: isPaid ? '#10b981' : isPartial ? '#f59e0b' : 'var(--danger)'
                              }}>
                                {svc.payment_status_display}
                              </span>
                            </td>

                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              <div style={{ fontWeight: 700, color: '#10b981' }}>
                                {formatMoney(svc.realized_amount)}
                              </div>
                              {svc.pending_amount > 0 && (
                                <div style={{ fontSize: '0.72rem', color: '#f59e0b' }}>
                                  Qarzda: {formatMoney(svc.pending_amount)}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeSubTab === 'goods_debts' ? (
            /* ================= SUB-TAB 2: GOODS TAKEN ON CREDIT / DEBT ================= */
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--surface)',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShoppingBag size={18} color="#ec4899" />
                    <span>Usta nasiyaga olgan tovarlar va ehtiyot qismlar</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Do'kondan nasiyaga olingan barcha mahsulotlar ro'yxati va ularning to'lanmagan qarz qoldig'i
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Jami olingan tovarlar: <strong style={{ color: 'var(--text-main)' }}>{formatMoney(singleWorkerData?.summary?.total_goods_taken || 0)}</strong>
                  </div>
                  <div style={{
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    color: '#ec4899',
                    backgroundColor: 'rgba(236, 72, 153, 0.1)',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    border: '1px solid rgba(236, 72, 153, 0.25)'
                  }}>
                    Qolgan qarz: {formatMoney(singleWorkerData?.summary?.total_goods_debt_all_time || 0)}
                  </div>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--surface-hover)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Sana</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Sotuv #</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Mashina</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Olingan tovarlar va miqdorlari</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>Jami narxi</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right', color: '#10b981' }}>To'langan</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right', color: '#ec4899' }}>Qarz (Nasiya)</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'center' }}>Holati</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Qaytarish muddati</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'center' }}>Amal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isSingleLoading ? (
                      <tr>
                        <td colSpan="10" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                          Yuklanmoqda...
                        </td>
                      </tr>
                    ) : filteredGoodsSales.length === 0 ? (
                      <tr>
                        <td colSpan="10" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                          Ushbu usta hali do'kondan qarzga tovar olmagan.
                        </td>
                      </tr>
                    ) : (
                      filteredGoodsSales.map(sale => {
                        const isPaid = sale.status === 'PAID';
                        const isPartial = sale.status === 'PARTIAL';

                        return (
                          <tr key={sale.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                              {new Date(sale.datetime).toLocaleDateString('uz-UZ')} {new Date(sale.datetime).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                            </td>

                            <td style={{ padding: '12px 14px', fontWeight: 700 }}>
                              <span style={{
                                backgroundColor: 'var(--surface-hover)',
                                padding: '3px 7px',
                                borderRadius: '6px',
                                border: '1px solid var(--border)',
                                fontSize: '0.8rem'
                              }}>
                                #{sale.sale_id}
                              </span>
                            </td>

                            <td style={{ padding: '12px 14px' }}>
                              {sale.car_plate ? (
                                <span style={{
                                  border: '1px solid var(--border)',
                                  backgroundColor: 'var(--surface-hover)',
                                  borderRadius: '4px',
                                  padding: '1px 5px',
                                  fontWeight: 700,
                                  fontSize: '0.78rem'
                                }}>
                                  {sale.car_plate}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>—</span>
                              )}
                            </td>

                            <td style={{ padding: '12px 14px' }}>
                              {sale.items && sale.items.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {sale.items.map((it, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
                                      <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>• {it.product_name}</span>
                                      <span style={{
                                        fontSize: '0.74rem',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        backgroundColor: 'var(--surface-hover)',
                                        border: '1px solid var(--border)',
                                        fontWeight: 700,
                                        color: 'var(--primary)'
                                      }}>
                                        {it.quantity} {it.unit_name}
                                      </span>
                                      <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                        ({formatMoney(it.price)} = {formatMoney(it.total)})
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{sale.items_summary}</span>
                              )}
                            </td>

                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700 }}>
                              {formatMoney(sale.total_amount)}
                            </td>

                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                              {formatMoney(sale.paid_amount)}
                            </td>

                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: sale.debt_amount > 0 ? '#ec4899' : 'var(--text-muted)' }}>
                              {sale.debt_amount > 0 ? formatMoney(sale.debt_amount) : '0 so\'m'}
                            </td>

                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                backgroundColor: isPaid ? 'rgba(16, 185, 129, 0.12)' : isPartial ? 'rgba(245, 158, 11, 0.12)' : 'rgba(236, 72, 153, 0.12)',
                                color: isPaid ? '#10b981' : isPartial ? '#d97706' : '#ec4899'
                              }}>
                                {sale.status_display}
                              </span>
                            </td>

                            <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                              {sale.due_date ? new Date(sale.due_date).toLocaleDateString('uz-UZ') : '—'}
                            </td>

                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              {sale.debt_amount > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenPayGoodsDebt(sale)}
                                  className="btn btn-primary"
                                  style={{
                                    height: '28px',
                                    padding: '0 10px',
                                    fontSize: '0.76rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title="Ushbu sotuv bo'yicha tovar qarzini to'lash"
                                >
                                  <DollarSign size={12} /> Qarzni to'lash
                                </button>
                              ) : (
                                <span style={{ color: '#10b981', fontSize: '0.78rem', fontWeight: 700 }}>
                                  To'langan ✅
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* ================= SUB-TAB 3: TOOL FEES, ADVANCES & PAYOUTS ================= */
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--surface)'
              }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 700 }}>
                  Ushlanmalar va hisob-kitoblar ro'yxati
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleOpenToolFee(selectedWorkerId)}
                    className="btn btn-secondary"
                    style={{ height: '32px', fontSize: '0.78rem' }}
                  >
                    + Podyomnik to'lovi
                  </button>
                  <button
                    onClick={() => handleOpenAdvance(selectedWorkerId)}
                    className="btn btn-secondary"
                    style={{ height: '32px', fontSize: '0.78rem' }}
                  >
                    + Qarz / Avans
                  </button>
                  <button
                    onClick={() => handleOpenPayout(selectedWorkerId)}
                    className="btn btn-primary"
                    style={{ height: '32px', fontSize: '0.78rem' }}
                  >
                    + Oylik to'lov (Payout)
                  </button>
                  <button
                    onClick={() => handleOpenWorkerPayment(selectedWorkerId)}
                    className="btn"
                    style={{
                      height: '32px',
                      fontSize: '0.78rem',
                      backgroundColor: '#10b981',
                      color: '#fff',
                      fontWeight: 700,
                      borderRadius: '8px',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    + Ustadan to'lov
                  </button>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--surface-hover)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Sana</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Amal turi</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>Summa</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Oy / Davr</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>To'lov usuli</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Izoh</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700 }}>Mas'ul shaxs</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'center' }}>Kassa holati</th>
                      <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'center' }}>Amallar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isSingleLoading ? (
                      <tr>
                        <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                          Tranzaksiyalar yuklanmoqda...
                        </td>
                      </tr>
                    ) : filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                          Ushbu usta uchun hali ushlanma yoki to'lov yozilmagan.
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map(tr => {
                        const isToolFee = tr.transaction_type === 'TOOL_FEE';
                        const isDebt = tr.transaction_type === 'WORKER_DEBT';
                        const isPayout = tr.transaction_type === 'PAYOUT';
                        const isBonus = tr.transaction_type === 'BONUS';
                        const isWorkerPayment = tr.transaction_type === 'WORKER_PAYMENT';

                        return (
                          <tr key={tr.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                              {new Date(tr.created_at).toLocaleDateString('uz-UZ')} {new Date(tr.created_at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                            </td>

                            <td style={{ padding: '12px 14px' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '3px 8px',
                                borderRadius: '8px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                backgroundColor: isWorkerPayment
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : isToolFee 
                                    ? 'rgba(139, 92, 246, 0.12)' 
                                    : isDebt 
                                      ? 'rgba(239, 68, 68, 0.12)' 
                                      : isPayout 
                                        ? 'rgba(99, 102, 241, 0.12)' 
                                        : 'rgba(16, 185, 129, 0.12)',
                                color: isWorkerPayment
                                  ? '#10b981'
                                  : isToolFee 
                                    ? '#8b5cf6' 
                                    : isDebt 
                                      ? 'var(--danger)' 
                                      : isPayout 
                                        ? '#6366f1' 
                                        : '#10b981'
                              }}>
                                {tr.transaction_type_display}
                              </span>
                            </td>

                            <td style={{
                              padding: '12px 14px',
                              textAlign: 'right',
                              fontWeight: 800,
                              fontSize: '0.92rem',
                              color: (isBonus || isWorkerPayment) ? '#10b981' : isPayout ? '#6366f1' : 'var(--danger)'
                            }}>
                              {(isBonus || isWorkerPayment) ? `+${formatMoney(tr.amount)}` : `-${formatMoney(tr.amount)}`}
                            </td>

                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                              {tr.period_month || '—'}
                            </td>

                            <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                              {tr.payment_method_display}
                            </td>

                            <td style={{ padding: '12px 14px' }}>
                              {tr.note || '—'}
                            </td>

                            <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                              {tr.created_by_name || 'Tizim'}
                            </td>

                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              {tr.cashflow_id ? (
                                <span style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  color: '#10b981',
                                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                  padding: '2px 6px',
                                  borderRadius: '6px'
                                }}>
                                  Kassa smenasi (#{tr.cashflow_id})
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                  Ichki tabel
                                </span>
                              )}
                            </td>

                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                {isToolFee && (
                                  <button
                                    type="button"
                                    onClick={() => handlePayToolFee(selectedWorkerId, tr.amount)}
                                    className="btn"
                                    style={{
                                      height: '28px',
                                      padding: '0 8px',
                                      fontSize: '0.74rem',
                                      backgroundColor: 'rgba(139, 92, 246, 0.15)',
                                      color: '#8b5cf6',
                                      border: '1px solid rgba(139, 92, 246, 0.3)',
                                      borderRadius: '6px',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      whiteSpace: 'nowrap'
                                    }}
                                    title="Ushbu podyomnik to'lovini to'lash"
                                  >
                                    <DollarSign size={12} /> To'lash
                                  </button>
                                )}
                                {isDebt && (
                                  <button
                                    type="button"
                                    onClick={() => handlePayWorkerDebt(selectedWorkerId, tr.amount)}
                                    className="btn"
                                    style={{
                                      height: '28px',
                                      padding: '0 8px',
                                      fontSize: '0.74rem',
                                      backgroundColor: 'rgba(239, 68, 68, 0.12)',
                                      color: 'var(--danger)',
                                      border: '1px solid rgba(239, 68, 68, 0.3)',
                                      borderRadius: '6px',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      whiteSpace: 'nowrap'
                                    }}
                                    title="Ushbu qarz / avansni yopish"
                                  >
                                    <ArrowDownRight size={12} /> Qarz yopish
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    if (window.confirm("Rostdan ham bu yozuvni o'chirmoqchimisiz?")) {
                                      deleteTransactionMutation.mutate(tr.id);
                                    }
                                  }}
                                  className="btn-icon"
                                  title="O'chirish"
                                  style={{ color: 'var(--danger)', width: '28px', height: '28px' }}
                                >
                                  <Trash2 size={15} />
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
          )}
        </div>
      )}

      {/* ================= MODAL 1: CHARGE MONTHLY TOOL / CAR LIFT FEE ================= */}
      {showToolFeeModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowToolFeeModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '480px', width: '92%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={20} color="#8b5cf6" />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Podyomnik va asbob to'lovi</h3>
              </div>
              <button className="btn-icon" onClick={() => setShowToolFeeModal(false)}><X size={18} /></button>
            </div>

            <form onSubmit={e => {
              e.preventDefault();
              chargeToolFeeMutation.mutate({
                worker_id: toolFeeForm.worker_id || null,
                period_month: toolFeeForm.period_month,
                amount: toolFeeForm.amount ? parseFloat(toolFeeForm.amount) : undefined,
                note: toolFeeForm.note
              });
            }}>
              <div className="input-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Usta</label>
                <select
                  value={toolFeeForm.worker_id}
                  onChange={e => {
                    const wId = e.target.value;
                    const found = workersList.find(w => String(w.id) === String(wId));
                    setToolFeeForm({
                      ...toolFeeForm,
                      worker_id: wId,
                      amount: found?.monthly_tool_fee || toolFeeForm.amount
                    });
                  }}
                  className="input-field"
                >
                  <option value="">Barcha ustalar (Ommaviy bir oylik to'lov)</option>
                  {workersList.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.job || 'Usta'}) {w.monthly_tool_fee ? `[Norma: ${Number(w.monthly_tool_fee).toLocaleString()} so'm]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="input-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Oy (Davr)</label>
                <input
                  type="month"
                  required
                  value={toolFeeForm.period_month}
                  onChange={e => setToolFeeForm({ ...toolFeeForm, period_month: e.target.value })}
                  className="input-field"
                />
              </div>

              <div className="input-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  To'lov miqdori (So'm) {toolFeeForm.worker_id === '' && "(Bo'sh qoldirilsa har bir ustaning o'z normasi olinadi)"}
                </label>
                <input
                  type="number"
                  placeholder="Masalan: 300000"
                  value={toolFeeForm.amount}
                  onChange={e => setToolFeeForm({ ...toolFeeForm, amount: e.target.value })}
                  className="input-field"
                />
              </div>

              <div className="input-group" style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Izoh</label>
                <input
                  type="text"
                  value={toolFeeForm.note}
                  onChange={e => setToolFeeForm({ ...toolFeeForm, note: e.target.value })}
                  className="input-field"
                />
              </div>

              <div style={{
                backgroundColor: 'rgba(139, 92, 246, 0.08)',
                border: '1px solid rgba(139, 92, 246, 0.25)',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '0.8rem',
                color: '#6d28d9',
                marginBottom: '18px'
              }}>
                ℹ️ Bu to'lov ichki tabel ushlanmasi bo'lib, ustaning oylik sof qoldig'idan ayirib qolinadi.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setShowToolFeeModal(false)} className="btn btn-secondary">
                  Bekor qilish
                </button>
                <button type="submit" className="btn btn-primary" disabled={chargeToolFeeMutation.isPending}>
                  {chargeToolFeeMutation.isPending ? 'Hisoblanmoqda...' : 'Hisoblash va Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: WORKER DEBT / ADVANCE ================= */}
      {showAdvanceModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAdvanceModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '480px', width: '92%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wallet size={20} color="#f59e0b" />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Ustaga qarz / avans berish</h3>
              </div>
              <button className="btn-icon" onClick={() => setShowAdvanceModal(false)}><X size={18} /></button>
            </div>

            <form onSubmit={e => {
              e.preventDefault();
              if (!advanceForm.worker) return toast.error("Ustani tanlang");
              if (!advanceForm.amount || parseFloat(advanceForm.amount) <= 0) return toast.error("Summani kiriting");

              createTransactionMutation.mutate({
                worker: advanceForm.worker,
                transaction_type: 'WORKER_DEBT',
                amount: parseFloat(advanceForm.amount),
                period_month: selectedMonth,
                payment_method: advanceForm.payment_method,
                note: advanceForm.note || 'Avans'
              });
            }}>
              <div className="input-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Usta *</label>
                <select
                  required
                  value={advanceForm.worker}
                  onChange={e => setAdvanceForm({ ...advanceForm, worker: e.target.value })}
                  className="input-field"
                >
                  <option value="">Ustani tanlang...</option>
                  {workersList.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.job || 'Usta'})</option>
                  ))}
                </select>
              </div>

              <div className="input-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Avans / Qarz summasi (So'm) *</label>
                <input
                  type="number"
                  required
                  placeholder="Masalan: 500000"
                  value={advanceForm.amount}
                  onChange={e => setAdvanceForm({ ...advanceForm, amount: e.target.value })}
                  className="input-field"
                  style={{ fontSize: '1rem', fontWeight: 700 }}
                />
              </div>

              <div className="input-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>To'lov shakli</label>
                <select
                  value={advanceForm.payment_method}
                  onChange={e => setAdvanceForm({ ...advanceForm, payment_method: e.target.value })}
                  className="input-field"
                >
                  <option value="CASH">Naqd pul (Kassadan berish)</option>
                  <option value="CARD">Plastik karta orqali</option>
                  <option value="TRANSFER">Bank o'tkazmasi</option>
                  <option value="NONE">Ichki qarz / Zapchast hisobidan</option>
                </select>
              </div>

              <div className="input-group" style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Izoh / Sabab</label>
                <input
                  type="text"
                  placeholder="Masalan: Uy xarajatlari uchun avans yoki zapchast oldi"
                  value={advanceForm.note}
                  onChange={e => setAdvanceForm({ ...advanceForm, note: e.target.value })}
                  className="input-field"
                />
              </div>

              {advanceForm.payment_method === 'CASH' && (
                <div style={{
                  padding: '10px 14px',
                  backgroundColor: activeShift ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                  border: activeShift ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: '10px',
                  fontSize: '0.8rem',
                  marginBottom: '18px',
                  color: activeShift ? '#065f46' : '#92400e'
                }}>
                  {activeShift ? (
                    <span>✅ Faol kassa smenasi (# {activeShift.id}) mavjud. Naqd pul kassa chiqimiga avtomatik yoziladi.</span>
                  ) : (
                    <span>⚠️ Diqqat: Hozirda ochiq kassa smenasi yo'q. Faqat tabelga qayd etiladi.</span>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setShowAdvanceModal(false)} className="btn btn-secondary">
                  Bekor qilish
                </button>
                <button type="submit" className="btn btn-primary" disabled={createTransactionMutation.isPending}>
                  {createTransactionMutation.isPending ? 'Saqlanmoqda...' : 'Avansni tasdiqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 3: PAYOUT / SETTLEMENT ================= */}
      {showPayoutModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowPayoutModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '500px', width: '92%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={20} color="#10b981" />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Usta bilan hisob-kitob (Oylik to'lov)</h3>
              </div>
              <button className="btn-icon" onClick={() => setShowPayoutModal(false)}><X size={18} /></button>
            </div>

            {(() => {
              const selectedWorker = workersList.find(w => String(w.id) === String(payoutForm.worker));
              const payableNow = selectedWorker ? selectedWorker.net_balance_payable_now : 0;
              const netTotal = selectedWorker ? selectedWorker.net_balance_total : 0;

              return (
                <form onSubmit={e => {
                  e.preventDefault();
                  if (!payoutForm.worker) return toast.error("Ustani tanlang");
                  if (!payoutForm.amount || parseFloat(payoutForm.amount) <= 0) return toast.error("To'lov summasini kiriting");

                  createTransactionMutation.mutate({
                    worker: payoutForm.worker,
                    transaction_type: 'PAYOUT',
                    amount: parseFloat(payoutForm.amount),
                    period_month: selectedMonth,
                    payment_method: payoutForm.payment_method,
                    note: payoutForm.note || `${selectedMonth} oyi oylik to'lovi`
                  });
                }}>
                  <div className="input-group" style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Usta *</label>
                    <select
                      required
                      value={payoutForm.worker}
                      onChange={e => {
                        const wId = e.target.value;
                        const found = workersList.find(w => String(w.id) === String(wId));
                        setPayoutForm({
                          ...payoutForm,
                          worker: wId,
                          amount: found && found.net_balance_payable_now > 0 ? found.net_balance_payable_now : ''
                        });
                      }}
                      className="input-field"
                    >
                      <option value="">Ustani tanlang...</option>
                      {workersList.map(w => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.job || 'Usta'}) — Hozir to'lanadigan: {formatMoney(w.net_balance_payable_now)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedWorker && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '10px',
                      padding: '12px 14px',
                      backgroundColor: 'var(--surface-hover)',
                      borderRadius: '10px',
                      marginBottom: '14px'
                    }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Hozir to'lanishi mumkin:</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#10b981' }}>
                          {formatMoney(payableNow)}
                        </div>
                        <button
                          type="button"
                          onClick={() => setPayoutForm({ ...payoutForm, amount: Math.max(0, payableNow) })}
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: '#10b981',
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            textDecoration: 'underline'
                          }}
                        >
                          Shu summani qo'yish
                        </button>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Jami hisoblangan:</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--primary)' }}>
                          {formatMoney(netTotal)}
                        </div>
                        <button
                          type="button"
                          onClick={() => setPayoutForm({ ...payoutForm, amount: Math.max(0, netTotal) })}
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: 'var(--primary)',
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            textDecoration: 'underline'
                          }}
                        >
                          Jami summani qo'yish
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="input-group" style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>To'lov miqdori (So'm) *</label>
                    <input
                      type="number"
                      required
                      placeholder="Masalan: 1500000"
                      value={payoutForm.amount}
                      onChange={e => setPayoutForm({ ...payoutForm, amount: e.target.value })}
                      className="input-field"
                      style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981' }}
                    />
                  </div>

                  <div className="input-group" style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>To'lov usuli</label>
                    <select
                      value={payoutForm.payment_method}
                      onChange={e => setPayoutForm({ ...payoutForm, payment_method: e.target.value })}
                      className="input-field"
                    >
                      <option value="CASH">Naqd pul (Kassadan to'lash)</option>
                      <option value="CARD">Plastik karta orqali</option>
                      <option value="TRANSFER">Bank o'tkazmasi</option>
                      <option value="NONE">Ichki hisob-kitob (Kassasiz)</option>
                    </select>
                  </div>

                  <div className="input-group" style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Izoh</label>
                    <input
                      type="text"
                      placeholder="Masalan: 2026-10 oyi yakuniy to'lovi"
                      value={payoutForm.note}
                      onChange={e => setPayoutForm({ ...payoutForm, note: e.target.value })}
                      className="input-field"
                    />
                  </div>

                  {payoutForm.payment_method === 'CASH' && (
                    <div style={{
                      padding: '10px 14px',
                      backgroundColor: activeShift ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                      border: activeShift ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(245, 158, 11, 0.25)',
                      borderRadius: '10px',
                      fontSize: '0.8rem',
                      marginBottom: '18px',
                      color: activeShift ? '#065f46' : '#92400e'
                    }}>
                      {activeShift ? (
                        <span>✅ Faol kassa smenasi (# {activeShift.id}) mavjud. Naqd to'lov kassa chiqimiga avtomatik yoziladi va qoldiq to'g'ri chiqadi.</span>
                      ) : (
                        <span>⚠️ Diqqat: Hozirda ochiq kassa smenasi yo'q. Chiqim kassa smenasiga bog'lanmaydi.</span>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" onClick={() => setShowPayoutModal(false)} className="btn btn-secondary">
                      Bekor qilish
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={createTransactionMutation.isPending}>
                      {createTransactionMutation.isPending ? 'Bajarilmoqda...' : "To'lovni amalga oshirish"}
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

      {/* ================= MODAL: WORKER PAYS SHOP (QARZ / PODYOMNIK YOPISH) ================= */}
      {showWorkerPaymentModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowWorkerPaymentModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '500px', width: '92%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ArrowDownRight size={20} color="#10b981" />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Ustadan to'lov qabul qilish (Qarz yopish)</h3>
              </div>
              <button className="btn-icon" onClick={() => setShowWorkerPaymentModal(false)}><X size={18} /></button>
            </div>

            {(() => {
              const selectedWorker = workersList.find(w => String(w.id) === String(workerPaymentForm.worker));
              const payableNow = selectedWorker ? selectedWorker.net_balance_payable_now : 0;
              const netTotal = selectedWorker ? selectedWorker.net_balance_total : 0;
              const hasDebt = payableNow < 0 || netTotal < 0;

              return (
                <form onSubmit={e => {
                  e.preventDefault();
                  if (!workerPaymentForm.worker) return toast.error("Ustani tanlang");
                  if (!workerPaymentForm.amount || parseFloat(workerPaymentForm.amount) <= 0) return toast.error("To'lov summasini kiriting");

                  createTransactionMutation.mutate({
                    worker: workerPaymentForm.worker,
                    transaction_type: 'WORKER_PAYMENT',
                    amount: parseFloat(workerPaymentForm.amount),
                    period_month: workerPaymentForm.period_month || selectedMonth,
                    payment_method: workerPaymentForm.payment_method,
                    note: workerPaymentForm.note || `Qarz / Podyomnik to'lovi yopish (${selectedMonth})`
                  });
                }}>
                  <div className="input-group" style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Usta *</label>
                    <select
                      required
                      value={workerPaymentForm.worker}
                      onChange={e => {
                        const wId = e.target.value;
                        const found = workersList.find(w => String(w.id) === String(wId));
                        const curPayable = found ? found.net_balance_payable_now : 0;
                        setWorkerPaymentForm({
                          ...workerPaymentForm,
                          worker: wId,
                          amount: curPayable < 0 ? Math.abs(curPayable) : workerPaymentForm.amount
                        });
                      }}
                      className="input-field"
                    >
                      <option value="">Ustani tanlang...</option>
                      {workersList.map(w => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.job || 'Usta'}) — {w.net_balance_payable_now < 0 ? `Qarzi: ${formatMoney(Math.abs(w.net_balance_payable_now))}` : `Qoldig'i: ${formatMoney(w.net_balance_payable_now)}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedWorker && hasDebt && (
                    <div style={{
                      padding: '12px 14px',
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: '10px',
                      marginBottom: '14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}>
                      <div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Ustaning hozirgi qarzi:</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--danger)' }}>
                          {formatMoney(Math.abs(payableNow))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWorkerPaymentForm({ ...workerPaymentForm, amount: Math.abs(payableNow) })}
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          backgroundColor: '#10b981',
                          color: '#fff',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer'
                        }}
                      >
                        Qarzni to'liq yopish ({formatMoney(Math.abs(payableNow))})
                      </button>
                    </div>
                  )}

                  <div className="input-group" style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>To'lov miqdori (So'm) *</label>
                    <input
                      type="number"
                      required
                      placeholder="Masalan: 121210"
                      value={workerPaymentForm.amount}
                      onChange={e => setWorkerPaymentForm({ ...workerPaymentForm, amount: e.target.value })}
                      className="input-field"
                      style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981' }}
                    />
                  </div>

                  <div className="input-group" style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>To'lov usuli</label>
                    <select
                      value={workerPaymentForm.payment_method}
                      onChange={e => setWorkerPaymentForm({ ...workerPaymentForm, payment_method: e.target.value })}
                      className="input-field"
                    >
                      <option value="CASH">Naqd pul (Kassaga kirim)</option>
                      <option value="CARD">Plastik karta orqali</option>
                      <option value="TRANSFER">Bank o'tkazmasi</option>
                    </select>
                  </div>

                  <div className="input-group" style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Davr (Oy)</label>
                    <input
                      type="month"
                      value={workerPaymentForm.period_month}
                      onChange={e => setWorkerPaymentForm({ ...workerPaymentForm, period_month: e.target.value })}
                      className="input-field"
                    />
                  </div>

                  <div className="input-group" style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Izoh</label>
                    <input
                      type="text"
                      placeholder="Masalan: Podyomnik to'lovi uchun naqd berdi"
                      value={workerPaymentForm.note}
                      onChange={e => setWorkerPaymentForm({ ...workerPaymentForm, note: e.target.value })}
                      className="input-field"
                    />
                  </div>

                  {workerPaymentForm.payment_method === 'CASH' && (
                    <div style={{
                      padding: '10px 14px',
                      backgroundColor: activeShift ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                      border: activeShift ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(245, 158, 11, 0.25)',
                      borderRadius: '10px',
                      fontSize: '0.8rem',
                      marginBottom: '18px',
                      color: activeShift ? '#065f46' : '#92400e'
                    }}>
                      {activeShift ? (
                        <span>✅ Faol kassa smenasi (# {activeShift.id}) mavjud. Naqd to'lov kassa kirimiga avtomatik yoziladi va kassa qoldig'iga qo'shiladi.</span>
                      ) : (
                        <span>ℹ️ Hozirda ochiq kassa smenasi yo'q. Faqat tabelga va umumiy kirimga qayd etiladi.</span>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" onClick={() => setShowWorkerPaymentModal(false)} className="btn btn-secondary">
                      Bekor qilish
                    </button>
                    <button
                      type="submit"
                      className="btn"
                      style={{
                        backgroundColor: '#10b981',
                        color: '#fff',
                        fontWeight: 700,
                        padding: '0 18px',
                        height: '38px',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                      disabled={createTransactionMutation.isPending}
                    >
                      {createTransactionMutation.isPending ? 'Saqlanmoqda...' : "To'lovni qabul qilish"}
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

      {/* ================= MODAL 4: CONFIGURE WORKER MONTHLY TOOL FEE ================= */}
      {showConfigModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowConfigModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '420px', width: '92%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={18} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Podyomnik normasini sozlash</h3>
              </div>
              <button className="btn-icon" onClick={() => setShowConfigModal(false)}><X size={18} /></button>
            </div>

            <form onSubmit={e => {
              e.preventDefault();
              updateWorkerToolFeeMutation.mutate({
                worker_id: configForm.worker_id,
                monthly_tool_fee: parseFloat(configForm.monthly_tool_fee || 0)
              });
            }}>
              <div style={{ marginBottom: '14px', fontSize: '0.88rem' }}>
                Usta: <span style={{ fontWeight: 700 }}>{configForm.worker_name}</span>
              </div>

              <div className="input-group" style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Doimiy oylik podyomnik to'lovi (So'm)</label>
                <input
                  type="number"
                  required
                  placeholder="Masalan: 300000"
                  value={configForm.monthly_tool_fee}
                  onChange={e => setConfigForm({ ...configForm, monthly_tool_fee: e.target.value })}
                  className="input-field"
                  style={{ fontSize: '1rem', fontWeight: 700 }}
                />
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Har oy oxirida podyomnik to'lovi hisoblanganda shu summa avtomatik tavsiya etiladi.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setShowConfigModal(false)} className="btn btn-secondary">
                  Bekor qilish
                </button>
                <button type="submit" className="btn btn-primary" disabled={updateWorkerToolFeeMutation.isPending}>
                  {updateWorkerToolFeeMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 5: PAY GOODS / SPARE PARTS DEBT ================= */}
      {payingGoodsSale && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setPayingGoodsSale(null); }}>
          <div className="modal-content" style={{ maxWidth: '460px', width: '92%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShoppingBag size={20} color="#ec4899" />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                  Nasiya tovar qarzini to'lash
                </h3>
              </div>
              <button className="btn-icon" onClick={() => setPayingGoodsSale(null)}><X size={18} /></button>
            </div>

            {/* Sale summary box */}
            <div style={{
              backgroundColor: 'var(--surface-hover)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '16px',
              fontSize: '0.84rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Sotuv raqami:</span>
                <span style={{ fontWeight: 700 }}>#{payingGoodsSale.sale_id || payingGoodsSale.id}</span>
              </div>
              {payingGoodsSale.car_plate && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Mashina:</span>
                  <span style={{ fontWeight: 700 }}>{payingGoodsSale.car_plate}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Olingan tovarlar:</span>
                <span style={{ fontWeight: 600, maxWidth: '240px', textAlign: 'right' }}>
                  {payingGoodsSale.items_summary || (payingGoodsSale.items?.map(i => i.product_name).join(', '))}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Jami summa:</span>
                <span>{formatMoney(payingGoodsSale.total_amount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Oldin to'langan:</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>{formatMoney(payingGoodsSale.paid_amount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '6px', marginTop: '6px' }}>
                <span style={{ fontWeight: 700, color: '#ec4899' }}>Qolgan qarz:</span>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: '#ec4899' }}>
                  {formatMoney(payingGoodsSale.debt_amount)}
                </span>
              </div>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              const amount = parseFloat(goodsPaymentForm.amount);
              if (!amount || amount <= 0) {
                toast.error("To'lov summasini kiriting");
                return;
              }
              if (amount > Number(payingGoodsSale.debt_amount)) {
                toast.error(`To'lov summasi qarz miqdoridan (${formatMoney(payingGoodsSale.debt_amount)}) ko'p bo'lishi mumkin emas`);
                return;
              }
              payGoodsDebtMutation.mutate({
                saleId: payingGoodsSale.sale_id || payingGoodsSale.id,
                payload: {
                  amount,
                  payment_method: goodsPaymentForm.payment_method || (paymentMethodsData?.[0]?.id || 1),
                  note: goodsPaymentForm.note
                }
              });
            }}>
              <div className="input-group" style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>To'lov summasi (So'm) *</label>
                  <button
                    type="button"
                    onClick={() => setGoodsPaymentForm({ ...goodsPaymentForm, amount: payingGoodsSale.debt_amount })}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary)',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    To'liq qarz ({formatMoney(payingGoodsSale.debt_amount)})
                  </button>
                </div>
                <input
                  type="number"
                  step="any"
                  required
                  max={payingGoodsSale.debt_amount}
                  value={goodsPaymentForm.amount}
                  onChange={e => setGoodsPaymentForm({ ...goodsPaymentForm, amount: e.target.value })}
                  className="input-field"
                  style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ec4899' }}
                />
              </div>

              <div className="input-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>To'lov usuli</label>
                <select
                  value={goodsPaymentForm.payment_method}
                  onChange={e => setGoodsPaymentForm({ ...goodsPaymentForm, payment_method: e.target.value })}
                  className="input-field"
                  required
                >
                  {(paymentMethodsData || []).map(pm => (
                    <option key={pm.id} value={pm.id}>
                      {pm.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="input-group" style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Izoh (Ixtiyoriy)</label>
                <input
                  type="text"
                  placeholder="Masalan: Usta tomonidan nasiya tovar qarzi to'landi"
                  value={goodsPaymentForm.note}
                  onChange={e => setGoodsPaymentForm({ ...goodsPaymentForm, note: e.target.value })}
                  className="input-field"
                />
              </div>

              {activeShift ? (
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '10px',
                  fontSize: '0.78rem',
                  marginBottom: '18px',
                  color: '#065f46'
                }}>
                  ✅ Faol kassa smenasi (# {activeShift.id}) mavjud. To'lov kassa kirimiga avtomatik yoziladi.
                </div>
              ) : null}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setPayingGoodsSale(null)} className="btn btn-secondary">
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn"
                  style={{
                    backgroundColor: '#ec4899',
                    color: '#fff',
                    fontWeight: 700,
                    padding: '0 18px',
                    height: '38px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                  disabled={payGoodsDebtMutation.isPending}
                >
                  {payGoodsDebtMutation.isPending ? 'To\'lanmoqda...' : 'Qarzni to\'lash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
