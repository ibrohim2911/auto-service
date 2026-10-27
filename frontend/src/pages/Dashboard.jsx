import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  DollarSign, ShoppingBag, TrendingUp, Users, Wrench, Wallet, Package,
  AlertTriangle, Building2, Car, Calendar, ArrowUpRight, ArrowDownRight,
  Layers, RefreshCw, ChevronRight, CheckCircle2, Clock, Sparkles, Filter,
  Search, X, Check
} from 'lucide-react';
import api from '../api';
import Pagination from '../components/Pagination';
import { useDebounce } from '../hooks/useDebounce';
import StatHelpTooltip from '../components/StatHelpTooltip';

const formatMoney = (amount) => {
  return Number(amount || 0).toLocaleString('uz-UZ') + " so'm";
};

const formatShortMoney = (val) => {
  const num = Math.abs(val || 0);
  if (num >= 1000000) {
    return `${(val / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(val / 1000).toFixed(0)}k`;
  }
  return String(val || 0);
};

const PERIOD_PRESETS = [
  { key: 'today', label: 'Bugun' },
  { key: 'yesterday', label: 'Kecha' },
  { key: '7days', label: '7 kun' },
  { key: 'this_month', label: 'Shu oy' },
  { key: 'last_month', label: "O'tgan oy" },
  { key: 'all_time', label: 'Barcha vaqt' },
  { key: 'custom', label: 'Sana tanlash' },
];

const DONUT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'];

// Custom Glassmorphic Tooltip for Recharts
function CustomChartTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div style={{
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(10px)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '12px 16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
        minWidth: '180px'
      }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>
          {label}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {payload.map((entry, index) => (
            <div key={`item-${index}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: entry.color || entry.fill }} />
                <span style={{ color: '#cbd5e1' }}>{entry.name}:</span>
              </div>
              <span style={{ fontWeight: 700, color: '#f8fafc' }}>
                {formatMoney(entry.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

export default function Dashboard() {
  const [period, setPeriod] = useState('this_month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [chartMode, setChartMode] = useState('revenue_profit'); // 'revenue_profit' | 'product_service'
  const [productsTab, setProductsTab] = useState('top'); // 'top' | 'low_stock'

  // Shift filter states
  const [selectedShift, setSelectedShift] = useState(null);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftSearchQuery, setShiftSearchQuery] = useState('');
  const [debouncedShiftSearch] = useDebounce(shiftSearchQuery, 300);
  const [shiftStatusFilter, setShiftStatusFilter] = useState(''); // '' | 'OPEN' | 'CLOSED'
  const [shiftPage, setShiftPage] = useState(1);
  const [shiftPageSize, setShiftPageSize] = useState(8);

  // Fetch Dashboard Statistics with TanStack Query
  const { data: statsData, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['dashboard-stats', period, dateFrom, dateTo, selectedShift?.id],
    queryFn: async () => {
      let url = `dashboard-stats/?period=${period}`;
      if (period === 'shift' && selectedShift?.id) {
        url = `dashboard-stats/?shift=${selectedShift.id}`;
      } else if (period === 'custom' && dateFrom && dateTo) {
        url += `&date_from=${dateFrom}&date_to=${dateTo}`;
      }
      const res = await api.get(url);
      return res.data;
    },
    refetchInterval: 30000,
  });

  // Query paginated shifts for Shift Choosing modal
  const { data: shiftsData, isLoading: isLoadingShifts } = useQuery({
    queryKey: ['shifts-list', debouncedShiftSearch, shiftStatusFilter, shiftPage, shiftPageSize],
    queryFn: async () => {
      let url = `shifts/?page=${shiftPage}&page_size=${shiftPageSize}&ordering=-opened_at`;
      if (debouncedShiftSearch) {
        url += `&search=${encodeURIComponent(debouncedShiftSearch)}`;
      }
      if (shiftStatusFilter) {
        url += `&status=${shiftStatusFilter}`;
      }
      const res = await api.get(url);
      return res.data;
    },
    enabled: showShiftModal,
  });

  const periodInfo = statsData?.period_info || {};
  const fin = statsData?.financial_summary || statsData?.kpi || {
    total_revenue: 0,
    product_revenue: 0,
    service_revenue: 0,
    product_cost: 0,
    product_profit: 0,
    total_tool_fees: 0,
    gross_profit: 0,
    total_expenses: 0,
    net_profit: 0,
    total_sales_count: 0,
    company_sales_count: 0,
    individual_sales_count: 0,
    products_sold_qty: 0,
    services_count: 0,
  };

  const live = statsData?.live_snapshot || {
    client_debts_total: statsData?.kpi?.total_sales_debt || 0,
    company_debts_total: 0,
    individual_debts_total: statsData?.kpi?.total_sales_debt || 0,
    our_debts_total: statsData?.kpi?.total_external_debt_taken || 0,
    workers_payable_balance: 0,
    workers_debt_balance: 0,
    workers_total_advances: 0,
    inventory: { total_items_count: 0, total_stock_qty: 0, total_cost_val: 0, total_sell_val: 0, low_stock_count: 0 },
    low_stock_products: [],
  };

  const chartData = statsData?.chartData || [];
  const paymentBreakdown = statsData?.payment_breakdown || statsData?.paymentPerformance || [];
  const topWorkers = statsData?.top_workers || [];
  const topProducts = statsData?.top_products || statsData?.productPerformance || [];
  const recentSales = statsData?.recentSales || [];

  // Donut Data: Product Revenue vs Service Revenue
  const revenueSplitData = useMemo(() => {
    const prodRev = fin.product_revenue || 0;
    const servRev = fin.service_revenue || 0;
    if (prodRev === 0 && servRev === 0) return [];
    return [
      { name: 'Mahsulotlar savdosi', value: prodRev, color: '#6366f1' },
      { name: 'Avtoservis xizmati', value: servRev, color: '#10b981' }
    ];
  }, [fin.product_revenue, fin.service_revenue]);

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1600px', margin: '0 auto' }}>
      
      {/* ================= HEADER & TIME FILTER BAR ================= */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '16px',
        marginBottom: '24px',
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
              <TrendingUp size={20} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.65rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                Boshqaruv paneli
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', margin: 0 }}>
                Avtoservis moliyaviy oqimi, xizmat ko'rsatkichlari va operatsion holati.
              </p>
            </div>
          </div>
        </div>

        {/* Global Time Filter Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          
          {/* Preset Buttons Container */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '4px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            {PERIOD_PRESETS.map((p) => {
              const isActive = period === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => {
                    setPeriod(p.key);
                    setSelectedShift(null);
                    if (p.key !== 'custom') {
                      setDateFrom('');
                      setDateTo('');
                    }
                  }}
                  style={{
                    border: 'none',
                    padding: '6px 13px',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer',
                    backgroundColor: isActive ? 'var(--primary)' : 'transparent',
                    color: isActive ? '#ffffff' : 'var(--text-muted)',
                    transition: 'all 0.15s ease',
                    boxShadow: isActive ? '0 2px 8px rgba(99, 102, 241, 0.3)' : 'none'
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Shift Filter Button */}
          <button
            onClick={() => setShowShiftModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: period === 'shift' ? '1px solid var(--primary)' : '1px solid var(--border)',
              backgroundColor: period === 'shift' ? 'var(--primary)' : 'var(--surface)',
              color: period === 'shift' ? '#ffffff' : 'var(--text-main)',
              padding: '6px 14px',
              borderRadius: '12px',
              fontSize: '0.82rem',
              fontWeight: period === 'shift' ? 700 : 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: period === 'shift' ? '0 2px 8px rgba(99, 102, 241, 0.3)' : 'var(--shadow-sm)'
            }}
          >
            <Clock size={15} color={period === 'shift' ? '#ffffff' : 'var(--primary)'} />
            <span>{selectedShift ? `Smena #${selectedShift.id}` : "Smena bo'yicha"}</span>
          </button>

          {/* Custom Date Range Inputs */}
          {period === 'custom' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '4px 10px',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <Calendar size={15} color="var(--primary)" />
              <input
                type="date"
                value={dateFrom}
                onChange={e => {
                  setDateFrom(e.target.value);
                  setSelectedShift(null);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-main)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => {
                  setDateTo(e.target.value);
                  setSelectedShift(null);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-main)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              />
            </div>
          )}

          {/* Refresh Button */}
          <button
            onClick={() => refetch()}
            className="btn btn-secondary"
            title="Yangilash"
            style={{ width: '38px', height: '38px', padding: 0, borderRadius: '10px' }}
          >
            <RefreshCw size={16} className={isFetching ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Active Shift Indicator Banner */}
      {selectedShift && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(16, 185, 129, 0.08))',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: '14px',
          padding: '12px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--primary), #10b981)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              <Clock size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: '0.98rem' }}>
                  Smena #{selectedShift.id} statistikasi ko'rsatilmoqda
                </span>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: selectedShift.status === 'OPEN' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                  color: selectedShift.status === 'OPEN' ? '#10b981' : 'var(--text-muted)'
                }}>
                  {selectedShift.status === 'OPEN' ? '● Ochiq (Faol)' : 'Yopiq'}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Kassir: <strong style={{ color: 'var(--text-main)' }}>{selectedShift.user_name || selectedShift.username}</strong> • 
                Ochilgan: {new Date(selectedShift.opened_at).toLocaleString('uz-UZ')}
                {selectedShift.closed_at ? ` • Yopilgan: ${new Date(selectedShift.closed_at).toLocaleString('uz-UZ')}` : ''}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowShiftModal(true)}
              style={{ fontSize: '0.8rem', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <Layers size={14} /> Boshqa smena
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setSelectedShift(null);
                setPeriod('this_month');
              }}
              style={{ fontSize: '0.8rem', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '5px', color: '#ef4444' }}
              title="Filtrni tozalash"
            >
              <X size={14} /> Tozalash
            </button>
          </div>
        </div>
      )}

      {/* ================= ROW 1: PRIMARY FINANCIAL KPI CARDS ================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px',
        marginBottom: '20px'
      }}>
        
        {/* Card 1: Total Revenue */}
        <div className="card" style={{ padding: '18px 20px', borderLeft: '4px solid var(--primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Umumiy Tushum ({periodInfo.label || 'Davr'})
              </span>
              <StatHelpTooltip
                title="Umumiy Tushum"
                meaning="Belgilangan davr yoki smena davomida sotilgan barcha tovarlar va xizmatlar umumiy qiymati (Qarz/nasiyaga berilganlar ham hisobga olingan)."
                formula="Mahsulotlar savdosi + Xizmatlar haqi"
              />
            </div>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'var(--primary-light)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <DollarSign size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.02em', marginBottom: '8px' }}>
            {formatMoney(fin.total_revenue)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span style={{ backgroundColor: 'var(--surface-hover)', padding: '2px 7px', borderRadius: '6px', fontWeight: 600 }}>
              📦 Mahsulot: {formatShortMoney(fin.product_revenue)}
            </span>
            <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '2px 7px', borderRadius: '6px', fontWeight: 600 }}>
              🔧 Xizmat: {formatShortMoney(fin.service_revenue)}
            </span>
          </div>
        </div>

        {/* Card 2: Net Profit & Expenses */}
        <div className="card" style={{ padding: '18px 20px', borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Sof Foyda (Daromad - Chiqim)
              </span>
              <StatHelpTooltip
                title="Sof Foyda"
                meaning="Sotilgan tovarlar marjasi (ustama foydasi) va ko'rsatilgan xizmatlar tushumidan barcha operatsion xarajatlar, ish haqi va avanslar ayirilgandan keyin korxonada qolgan toza foyda."
                formula="Yalpi Foyda - Barcha Chiqimlar (Xarajatlar, Oyliklar)"
              />
            </div>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              color: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            color: (fin.net_profit || 0) >= 0 ? '#10b981' : 'var(--danger)',
            letterSpacing: '-0.02em',
            marginBottom: '8px'
          }}>
            {formatMoney(fin.net_profit)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span style={{ backgroundColor: 'var(--surface-hover)', padding: '2px 7px', borderRadius: '6px', fontWeight: 600 }}>
              Yalpi: {formatShortMoney(fin.gross_profit)}
            </span>
            <span style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '2px 7px', borderRadius: '6px', fontWeight: 600 }}>
              Chiqimlar: {formatShortMoney(fin.total_expenses)}
            </span>
          </div>
        </div>

        {/* Card 3: Checkouts & Jobs */}
        <div className="card" style={{ padding: '18px 20px', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Sotuvlar va Xizmatlar
              </span>
              <StatHelpTooltip
                title="Sotuvlar va Xizmatlar"
                meaning="Tanlangan davr yoki smena davomida rasmiylashtirilgan jami cheklar soni hamda ularning korxonalar va jismoniy shaxslarga taqsimlanishi."
                formula="Tashkilot savdolari + Jismoniy shaxslar savdolari"
              />
            </div>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'rgba(139, 92, 246, 0.12)',
              color: '#8b5cf6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ShoppingBag size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em', marginBottom: '8px' }}>
            {fin.total_sales_count || 0} ta savdo
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', padding: '2px 7px', borderRadius: '6px', fontWeight: 600 }}>
              🏢 {fin.company_sales_count || 0} tashkilot
            </span>
            <span style={{ backgroundColor: 'var(--surface-hover)', padding: '2px 7px', borderRadius: '6px', fontWeight: 600 }}>
              👤 {fin.individual_sales_count || 0} jismoniy
            </span>
          </div>
        </div>

        {/* Card 4: Customer & Company Debts */}
        <div className="card" style={{ padding: '18px 20px', borderLeft: '4px solid #ef4444' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Mijoz va Tashkilot Qarzlari
              </span>
              <StatHelpTooltip
                title="Mijozlar Qarzdorligi"
                meaning="Mijozlar (tashkilotlar va haydovchilar) tomonidan nasiyaga olingan tovarlar yoki xizmatlar uchun to'lanmagan umumiy joriy qarz balansi."
                formula="Barcha mijozlarning to'lanmagan qarz qoldiqlari yig'indisi"
              />
            </div>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Users size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ef4444', letterSpacing: '-0.02em', marginBottom: '8px' }}>
            {formatMoney(live.client_debts_total)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#d97706', padding: '2px 7px', borderRadius: '6px', fontWeight: 700 }}>
              Tashkilotlar: {formatShortMoney(live.company_debts_total)}
            </span>
            <span style={{ backgroundColor: 'var(--surface-hover)', padding: '2px 7px', borderRadius: '6px', fontWeight: 600 }}>
              Aholidan: {formatShortMoney(live.individual_debts_total)}
            </span>
          </div>
        </div>

      </div>

      {/* ================= ROW 2: OPERATIONS & QUICK STATS STRIP ================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
        gap: '14px',
        marginBottom: '24px'
      }}>
        
        {/* Strip 1: Payment Method Quick Breakdown */}
        <div className="card" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Wallet size={14} color="var(--primary)" /> To'lov Turlari (Tushum)
              <StatHelpTooltip
                title="To'lov turlari taqsimoti"
                meaning="Sotuvlar davomida qabul qilingan pullarning to'lov usullari (Naqd, Karta, Hisob raqam yoki Nasiya) bo'yicha tushum taqsimoti."
                formula="Har bir to'lov turi bo'yicha jami tushum"
              />
            </span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)' }}>
              {formatShortMoney(fin.total_revenue)}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
            {paymentBreakdown.map((pm, idx) => (
              <span key={idx} style={{
                fontSize: '0.74rem',
                fontWeight: 600,
                padding: '4px 8px',
                borderRadius: '6px',
                backgroundColor: pm.key === 'DEBT' || pm.type === 'DEBT' ? 'rgba(245, 158, 11, 0.12)' : 'var(--surface-hover)',
                color: pm.key === 'DEBT' || pm.type === 'DEBT' ? '#d97706' : 'var(--text-main)',
                border: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>{pm.short_name || pm.name}:</span>
                <strong style={{ color: pm.key === 'DEBT' || pm.type === 'DEBT' ? '#d97706' : 'var(--text-main)' }}>
                  {formatShortMoney(pm.value)}
                </strong>
              </span>
            ))}
          </div>
        </div>

        {/* Strip 2: Workers & Lift Fees */}
        <Link to="/worker-tabs" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ padding: '14px 18px', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Wrench size={14} color="#8b5cf6" /> Ustalar va Podyomnik
                <StatHelpTooltip
                  title="Ustalar hisobi va Podyomnik"
                  meaning="Ustalarga hisoblangan xizmat ulushi, ustaxona tomonidan ushlab qolinadigan podyomnik to'lovi hamda ustalarga to'lanishi lozim bo'lgan ish haqi balansi."
                  formula="Usta balansi = Xizmat haqi + Bonus - Podyomnik to'lovi - Avans - Tovar nasiyalari"
                />
              </span>
              <ArrowUpRight size={14} color="var(--primary)" />
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Podyomnik ushlanmasi:</span>
              <span style={{ color: '#8b5cf6' }}>+{formatShortMoney(fin.total_tool_fees)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px', flexWrap: 'wrap', gap: '6px' }}>
              <span>
                To'lanadigan: <strong style={{ color: '#10b981' }}>{formatShortMoney(live.workers_payable_balance)}</strong>
              </span>
              <span style={{ color: Number(live.workers_debt_balance || 0) > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: Number(live.workers_debt_balance || 0) > 0 ? 700 : 500 }}>
                Ustalar qarzi: {formatShortMoney(live.workers_debt_balance)}
              </span>
            </div>
          </div>
        </Link>

        {/* Strip 3: External / Supplier Debts */}
        <Link to="/debts" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ padding: '14px 18px', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Building2 size={14} color="#f59e0b" /> Bizning Qarzimiz (Ta'minotchi)
                <StatHelpTooltip
                  title="Ta'minotchilar oldidagi qarzimiz"
                  meaning="Ta'minotchilardan nasiyaga olingan tovarlar va ehtiyot qismlar uchun to'lanishi kerak bo'lgan umumiy qarz balansi."
                  formula="Barcha ta'minotchilarning to'lanmagan qoldiq qarz yig'indisi"
                />
              </span>
              <ArrowUpRight size={14} color="var(--primary)" />
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: live.our_debts_total > 0 ? '#f59e0b' : 'var(--text-main)' }}>
              {formatMoney(live.our_debts_total)}
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              Yetkazib beruvchilardan olingan qarzlar
            </div>
          </div>
        </Link>

        {/* Strip 4: Inventory Health */}
        <Link to="/inventory" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ padding: '14px 18px', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Package size={14} color="#3b82f6" /> Ombor Holati
                <StatHelpTooltip
                  title="Ombor tovar qoldiqlari"
                  meaning="Omborda mavjud mahsulot turlari, jami qoldiq soni, ularning tan narxdagi umumiy qiymati va minimal chegaradan kam qolgan tovarlar soni."
                  formula="Jami qiymat = Σ (Mahsulot qoldig'i × Tan narxi)"
                />
              </span>
              <ArrowUpRight size={14} color="var(--primary)" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-main)' }}>
                {live.inventory?.total_items_count || 0} tur ({formatShortMoney(live.inventory?.total_stock_qty)} dona)
              </span>
              {live.inventory?.low_stock_count > 0 && (
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  color: 'var(--danger)',
                  padding: '2px 7px',
                  borderRadius: '6px'
                }}>
                  {live.inventory.low_stock_count} ta kam
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Qiymati: {formatShortMoney(live.inventory?.total_cost_val)}
            </div>
          </div>
        </Link>

      </div>

      {/* ================= ROW 3: INTERACTIVE CHARTS (2/3 Trend + 1/3 Split) ================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
        gap: '20px',
        marginBottom: '24px'
      }}>
        
        {/* Left: Recharts Financial Trend (2/3 width equivalent) */}
        <div className="card" style={{ gridColumn: 'span 2', padding: '20px 24px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '18px',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                  Moliyaviy Tendensiya
                </h2>
                <StatHelpTooltip
                  title="Moliyaviy Tendensiya Grafigi"
                  meaning="Kunlar yoki davr kesimida umumiy tushum, yalpi foyda va amalga oshirilgan xarajatlar dinamikasi."
                  formula="Har bir kun/davr bo'yicha: Tushum, Foyda va Chiqim agregatsiyasi"
                />
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                {periodInfo.label || 'Belgilangan davr'} bo'yicha tushum va xarajatlar dinamikasi
              </p>
            </div>

            {/* Chart Mode Toggle */}
            <div style={{
              display: 'flex',
              backgroundColor: 'var(--surface-hover)',
              borderRadius: '8px',
              padding: '3px',
              border: '1px solid var(--border)'
            }}>
              <button
                onClick={() => setChartMode('revenue_profit')}
                style={{
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: chartMode === 'revenue_profit' ? 700 : 500,
                  cursor: 'pointer',
                  backgroundColor: chartMode === 'revenue_profit' ? 'var(--primary)' : 'transparent',
                  color: chartMode === 'revenue_profit' ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.15s ease'
                }}
              >
                Tushum va Foyda
              </button>
              <button
                onClick={() => setChartMode('product_service')}
                style={{
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: chartMode === 'product_service' ? 700 : 500,
                  cursor: 'pointer',
                  backgroundColor: chartMode === 'product_service' ? 'var(--primary)' : 'transparent',
                  color: chartMode === 'product_service' ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.15s ease'
                }}
              >
                Mahsulot va Xizmat haqi
              </button>
            </div>
          </div>

          <div style={{ height: '320px', width: '100%' }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} vertical={false} />
                  <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickMargin={8} tickLine={false} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={formatShortMoney} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '0.8rem', paddingTop: '10px' }} />

                  {chartMode === 'revenue_profit' ? (
                    <>
                      <Bar 
                        dataKey="total_revenue" 
                        name="Umumiy Tushum" 
                        fill="var(--primary)" 
                        radius={[5, 5, 0, 0]} 
                        maxBarSize={48} 
                      />
                      <Bar 
                        dataKey="profit" 
                        name="Yalpi Foyda" 
                        fill="#10b981" 
                        radius={[5, 5, 0, 0]} 
                        maxBarSize={48} 
                      />
                      <Bar 
                        dataKey="expenses" 
                        name="Chiqimlar" 
                        fill="#ef4444" 
                        radius={[5, 5, 0, 0]} 
                        maxBarSize={48} 
                      />
                    </>
                  ) : (
                    <>
                      <Bar 
                        dataKey="product_revenue" 
                        name="Mahsulot Savdosi" 
                        fill="#6366f1" 
                        stackId="a" 
                        radius={[0, 0, 0, 0]} 
                        maxBarSize={48} 
                      />
                      <Bar 
                        dataKey="service_revenue" 
                        name="Xizmat Haqilari" 
                        fill="#10b981" 
                        stackId="a" 
                        radius={[5, 5, 0, 0]} 
                        maxBarSize={48} 
                      />
                    </>
                  )}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                Belgilangan davr uchun grafik ma'lumotlari yo'q
              </div>
            )}
          </div>
        </div>

        {/* Right: Revenue Composition & Payment Channels (1/3 width) */}
        <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                Tushum Tarkibi va Kanallari
              </h2>
              <StatHelpTooltip
                title="Tushum Tarkibi va Kanallari"
                meaning="Umumiy tushumda ehtiyot qismlar savdosi va servis xizmatlari haqining foiz nisbati hamda to'lov usullari (kanallari) ulushi."
                formula="Ulush % = (Kategoriya tushumi / Umumiy tushum) × 100%"
              />
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
              Ehtiyot qismlar va servis xizmatlari nisbati
            </p>

            {/* Donut Chart */}
            <div style={{ height: '180px', width: '100%', position: 'relative' }}>
              {revenueSplitData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={revenueSplitData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {revenueSplitData.map((entry, index) => (
                        <Cell key={`donut-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatMoney(value)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Ma'lumot mavjud emas
                </div>
              )}
            </div>
          </div>

          {/* Payment Method Channels List */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', marginTop: '10px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>
              To'lov kanallari:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {paymentBreakdown.map((pm, idx) => {
                const totalIncome = paymentBreakdown.reduce((s, p) => s + (p.value || 0), 0) || 1;
                const pct = Math.round((pm.value / totalIncome) * 100);
                return (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }} />
                      <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{pm.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{formatMoney(pm.value)}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: '32px', textAlign: 'right' }}>
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
              {paymentBreakdown.length === 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>To'lovlar yo'q</div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* ================= ROW 4: BOTTOM OPERATIONAL PANELS ================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '20px'
      }}>
        
        {/* Panel 1: Recent Sales List (Fixed 0 mahsulot bug) */}
        <div className="card" style={{ padding: '20px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>So'nggi Sotuvlar</h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>Oxirgi savdo va xizmatlar</p>
            </div>
            <Link to="/sales" style={{ textDecoration: 'none', fontSize: '0.78rem', fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
              Barchasi <ChevronRight size={14} />
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {recentSales.map(sale => (
              <div 
                key={sale.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  backgroundColor: 'var(--surface-hover)',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  gap: '12px'
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)' }}>
                      #{sale.id} • {sale.client}
                    </span>
                    {sale.is_company && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        backgroundColor: 'rgba(99, 102, 241, 0.15)',
                        color: 'var(--primary)',
                        padding: '1px 5px',
                        borderRadius: '4px'
                      }}>
                        <Building2 size={10} /> Kompaniya
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {sale.car_plate && (
                      <span style={{ fontWeight: 600, color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0 4px' }}>
                        {sale.car_plate}
                      </span>
                    )}
                    <span>{new Date(sale.datetime).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
                      {sale.sale_type_display}
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--primary)' }}>
                    {formatMoney(sale.total_amount)}
                  </div>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: '5px',
                    backgroundColor: sale.debt_amount > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    color: sale.debt_amount > 0 ? 'var(--danger)' : '#10b981'
                  }}>
                    {sale.debt_amount > 0 ? `Qarz: ${formatShortMoney(sale.debt_amount)}` : (sale.payment_type || "To'langan")}
                  </span>
                </div>
              </div>
            ))}

            {recentSales.length === 0 && (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0', fontSize: '0.85rem' }}>
                Hozircha sotuvlar mavjud emas
              </p>
            )}
          </div>
        </div>

        {/* Panel 2: Top Active Mechanics (Workers Ranking) */}
        <div className="card" style={{ padding: '20px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Faol Ustalar Reytingi</h2>
                <StatHelpTooltip
                  title="Faol Ustalar Reytingi"
                  meaning="Tanlangan davr davomida avtomobillarga eng ko'p xizmat ko'rsatgan va eng yuqori tushum keltirgan ustalar ro'yxati."
                  formula="Har bir usta bajargan xizmatlarning umumiy tushumi"
                />
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>Davr bo'yicha eng ko'p xizmat ko'rsatganlar</p>
            </div>
            <Link to="/worker-tabs" style={{ textDecoration: 'none', fontSize: '0.78rem', fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
              Tabel <ChevronRight size={14} />
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {topWorkers.map((w, idx) => (
              <div 
                key={w.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  backgroundColor: 'var(--surface-hover)',
                  borderRadius: '10px',
                  border: '1px solid var(--border)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: idx === 0 ? '#f59e0b' : idx === 1 ? '#94a3b8' : idx === 2 ? '#b45309' : 'var(--primary-light)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.82rem'
                  }}>
                    {idx + 1}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)' }}>
                      {w.name}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      {w.job} • {w.cars_count || w.services_count} ta mashina
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#10b981' }}>
                    {formatMoney(w.total_fee)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Xizmat tushumi
                  </div>
                </div>
              </div>
            ))}

            {topWorkers.length === 0 && (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0', fontSize: '0.85rem' }}>
                Ushbu davrda xizmat ko'rsatgan ustalar yo'q
              </p>
            )}
          </div>
        </div>

        {/* Panel 3: Top Products & Low Stock Alerts */}
        <div className="card" style={{ padding: '20px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setProductsTab('top')}
                style={{
                  border: 'none',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: productsTab === 'top' ? 700 : 500,
                  cursor: 'pointer',
                  backgroundColor: productsTab === 'top' ? 'var(--primary)' : 'var(--surface-hover)',
                  color: productsTab === 'top' ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.15s ease'
                }}
              >
                🔥 Ko'p sotilganlar
              </button>
              <button
                onClick={() => setProductsTab('low_stock')}
                style={{
                  border: 'none',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: productsTab === 'low_stock' ? 700 : 500,
                  cursor: 'pointer',
                  backgroundColor: productsTab === 'low_stock' ? '#ef4444' : 'var(--surface-hover)',
                  color: productsTab === 'low_stock' ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.15s ease'
                }}
              >
                ⚠️ Kam qolganlar ({live.inventory?.low_stock_count || 0})
              </button>
            </div>

            <Link to="/inventory" style={{ textDecoration: 'none', fontSize: '0.78rem', fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
              Ombor <ChevronRight size={14} />
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {productsTab === 'top' ? (
              topProducts.map((p, idx) => (
                <div 
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    backgroundColor: 'var(--surface-hover)',
                    borderRadius: '10px',
                    border: '1px solid var(--border)'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {p.qty} {p.unit || 'dona'} sotildi
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.92rem', color: 'var(--primary)' }}>
                    {formatMoney(p.value)}
                  </div>
                </div>
              ))
            ) : (
              (live.low_stock_products || []).map((p, idx) => (
                <div 
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    backgroundColor: 'rgba(239, 68, 68, 0.06)',
                    borderRadius: '10px',
                    border: '1px solid rgba(239, 68, 68, 0.2)'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Joyi: {p.location} • Shtrixkod: {p.barcode}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      color: 'var(--danger)',
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      padding: '2px 8px',
                      borderRadius: '6px'
                    }}>
                      {p.quantity} {p.unit} qoldi
                    </span>
                  </div>
                </div>
              ))
            )}

            {((productsTab === 'top' && topProducts.length === 0) || (productsTab === 'low_stock' && (!live.low_stock_products || live.low_stock_products.length === 0))) && (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0', fontSize: '0.85rem' }}>
                {productsTab === 'top' ? "Belgilangan davrda sotuvlar yo'q" : "Omborda kam qolgan mahsulotlar yo'q"}
              </p>
            )}
          </div>
        </div>

      </div>

      {/* ================= SHIFT SELECTION MODAL ================= */}
      {showShiftModal && (
        <div className="modal-overlay" onClick={() => setShowShiftModal(false)}>
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '960px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '24px' }}
          >
            {/* Header */}
            <div className="flex-between mb-4">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Clock size={20} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Smena bo'yicha statistikani filtrlash</h2>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Boshqaruv panelini ma'lum bir smena va uning kassa ma'lumotlari bo'yicha tahlil qilish
                  </p>
                </div>
              </div>
              <button className="btn-icon" onClick={() => setShowShiftModal(false)} title="Yopish">
                <X size={20} />
              </button>
            </div>

            {/* Search and Status Filter Row */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <div style={{ flex: '1 1 260px', position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Smena ID, kassir ismi yoki izoh bo'yicha qidirish..."
                  value={shiftSearchQuery}
                  onChange={e => {
                    setShiftSearchQuery(e.target.value);
                    setShiftPage(1);
                  }}
                  className="input-field"
                  style={{ paddingLeft: '36px', height: '40px', fontSize: '0.85rem' }}
                />
                {shiftSearchQuery && (
                  <button
                    onClick={() => { setShiftSearchQuery(''); setShiftPage(1); }}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              {/* Status Tabs */}
              <div style={{ display: 'flex', gap: '6px', background: 'var(--surface-hover)', padding: '4px', borderRadius: '10px' }}>
                <button
                  type="button"
                  onClick={() => { setShiftStatusFilter(''); setShiftPage(1); }}
                  className={`btn ${shiftStatusFilter === '' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '6px 12px', border: 'none' }}
                >
                  Barchasi
                </button>
                <button
                  type="button"
                  onClick={() => { setShiftStatusFilter('OPEN'); setShiftPage(1); }}
                  className={`btn ${shiftStatusFilter === 'OPEN' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '6px 12px', border: 'none' }}
                >
                  ● Ochiq
                </button>
                <button
                  type="button"
                  onClick={() => { setShiftStatusFilter('CLOSED'); setShiftPage(1); }}
                  className={`btn ${shiftStatusFilter === 'CLOSED' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '6px 12px', border: 'none' }}
                >
                  Yopiq
                </button>
              </div>
            </div>

            {/* Table / List Container */}
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '12px', marginBottom: '16px' }}>
              {isLoadingShifts ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Smenalar yuklanmoqda...
                </div>
              ) : (!shiftsData?.results || shiftsData.results.length === 0) ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Clock size={40} style={{ opacity: 0.25, marginBottom: '12px' }} />
                  <h4>Smenalar topilmadi</h4>
                  <p style={{ fontSize: '0.85rem' }}>Qidiruv so'zini yoki filtrni o'zgartirib ko'ring</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead style={{ backgroundColor: 'var(--surface-hover)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={{ padding: '10px 14px' }}>Smena</th>
                      <th style={{ padding: '10px 14px' }}>Kassir</th>
                      <th style={{ padding: '10px 14px' }}>Holat</th>
                      <th style={{ padding: '10px 14px' }}>Ochilgan vaqti</th>
                      <th style={{ padding: '10px 14px' }}>Yopilgan vaqti</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Boshlang'ich</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Haqiqiy / Bor</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Farq</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center' }}>Tanlash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shiftsData.results.map((s) => {
                      const isSelected = selectedShift?.id === s.id;
                      const diff = parseFloat(s.difference || 0);
                      return (
                        <tr
                          key={s.id}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease'
                          }}
                          onClick={() => {
                            setSelectedShift(s);
                            setPeriod('shift');
                            setShowShiftModal(false);
                          }}
                        >
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--primary)' }}>
                            #{s.id}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 600 }}>{s.user_name || s.username}</div>
                            {s.user_phone && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.user_phone}</div>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '6px',
                              backgroundColor: s.status === 'OPEN' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                              color: s.status === 'OPEN' ? '#10b981' : 'var(--text-muted)'
                            }}>
                              {s.status === 'OPEN' ? '● Ochiq' : 'Yopiq'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {new Date(s.opened_at).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {s.closed_at
                              ? new Date(s.closed_at).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                              : <span style={{ color: '#10b981', fontWeight: 500 }}>Davom etmoqda...</span>
                            }
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>
                            {parseFloat(s.starting_cash || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>
                            {parseFloat(s.actual_cash || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            {diff !== 0 ? (
                              <span style={{
                                color: diff < 0 ? '#ef4444' : '#10b981',
                                fontWeight: 700
                              }}>
                                {diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>0</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <button
                              type="button"
                              className={`btn ${isSelected ? 'btn-success' : 'btn-primary'}`}
                              style={{
                                fontSize: '0.78rem',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedShift(s);
                                setPeriod('shift');
                                setShowShiftModal(false);
                              }}
                            >
                              {isSelected ? <><Check size={13} /> Tanlangan</> : 'Tanlash'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination inside Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <Pagination
                currentPage={shiftsData?.current_page || shiftPage}
                totalPages={shiftsData?.total_pages || 1}
                totalItems={shiftsData?.count || 0}
                pageSize={shiftPageSize}
                pageSizeOptions={[5, 8, 15, 25]}
                onPageChange={(p) => setShiftPage(p)}
                onPageSizeChange={(sz) => { setShiftPageSize(sz); setShiftPage(1); }}
              />
              <button className="btn btn-secondary" onClick={() => setShowShiftModal(false)}>
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
