import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingBag, Search, FileText, Download, Printer, Wrench,
  Trash2, RotateCcw, Edit3, Plus, X, Car, AlertTriangle, Check
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import SearchableSelect from '../components/SearchableSelect';
import Pagination from '../components/Pagination';
import { useDebounce } from '../hooks/useDebounce';
import OrganizationInvoiceModal from '../components/OrganizationInvoice';

export default function Sales() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebounce(searchQuery, 300);

  const handlePrintSale = async (saleId, type) => {
    const typeLabel = type === 'cashier' ? "Kassir cheki (Narx bilan)" : "Ishchi cheki (Narxsiz)";
    const toastId = toast.loading(`${typeLabel} printerga yuborilmoqda...`);
    try {
      const res = await api.post(`sales/${saleId}/print/`, { type });
      const detail = res.data?.results?.[type]?.message || "Chop etish vazifasi yuborildi";
      toast.success(`${typeLabel}: ${detail}`, { id: toastId });
    } catch (err) {
      toast.error(err.response?.data?.error || "Printerga yuborishda xatolik yuz berdi", { id: toastId });
    }
  };
  
  const getDueDateStatus = (dueDate, debtAmount) => {
    if (!debtAmount || parseFloat(debtAmount) <= 0) {
      return { label: "To'langan", color: '#2ecc71', bg: 'rgba(46, 204, 113, 0.1)', isOverdue: false };
    }
    if (!dueDate) {
      return { label: "Belgilanmagan", color: 'var(--text-muted)', bg: 'var(--surface-hover)', isOverdue: false };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);

    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const overdueDays = Math.abs(diffDays);
      return {
        label: `Muddati o'tgan (${overdueDays} kun)`,
        color: '#e74c3c',
        bg: 'rgba(231, 76, 60, 0.15)',
        isOverdue: true
      };
    } else if (diffDays === 0) {
      return {
        label: "Bugun oxirgi kun",
        color: '#e67e22',
        bg: 'rgba(230, 126, 34, 0.15)',
        isOverdue: false
      };
    } else if (diffDays <= 3) {
      return {
        label: `${diffDays} kun qoldi`,
        color: '#f39c12',
        bg: 'rgba(243, 156, 18, 0.15)',
        isOverdue: false
      };
    } else {
      return {
        label: `${diffDays} kun qoldi`,
        color: '#3498db',
        bg: 'rgba(52, 152, 219, 0.15)',
        isOverdue: false
      };
    }
  };

  const [filters, setFilters] = useState({
    user: '',
    client: '',
    payment_type: '',
    start_date: '',
    end_date: '',
    due_date_start: '',
    due_date_end: '',
    min_amount: '',
    max_amount: '',
    ordering: '-datetime'
  });
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeTab, setActiveTab] = useState('all_sales');
  const [selectedSale, setSelectedSale] = useState(null);
  const [orgInvoiceSale, setOrgInvoiceSale] = useState(null);
  const [payingDebt, setPayingDebt] = useState(null);

  // Delete, Refund, and Edit states
  const [deletingSale, setDeletingSale] = useState(null);
  const [refundingSale, setRefundingSale] = useState(null);
  const [refundItems, setRefundItems] = useState({});
  const [refundServices, setRefundServices] = useState([]);
  const [refundReason, setRefundReason] = useState('');
  const [refundPaymentMethodId, setRefundPaymentMethodId] = useState('');

  const [editingSale, setEditingSale] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [prodToAdd, setProdToAdd] = useState('');
  
  const navigate = useNavigate();
  
  // Payment Form State
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  
  const queryClient = useQueryClient();

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedSearch, filters]);

  const { data: salesResponse, isLoading } = useQuery({
    queryKey: ['sales', debouncedSearch, filters, activeTab, page, pageSize],
    queryFn: async () => {
      let url = `sales/?page=${page}&page_size=${pageSize}&`;
      if (activeTab === 'debts') url += 'has_debt=true&';
      if (debouncedSearch) url += `search=${encodeURIComponent(debouncedSearch)}&`;
      if (filters.user) url += `user=${filters.user}&`;
      if (filters.client) url += `client=${filters.client}&`;
      if (filters.payment_type) url += `payment_type=${filters.payment_type}&`;
      if (filters.start_date) url += `start_date=${filters.start_date}&`;
      if (filters.end_date) url += `end_date=${filters.end_date}T23:59:59&`;
      if (filters.due_date_start) url += `due_date_start=${filters.due_date_start}&`;
      if (filters.due_date_end) url += `due_date_end=${filters.due_date_end}&`;
      if (filters.min_amount) url += `min_amount=${filters.min_amount}&`;
      if (filters.max_amount) url += `max_amount=${filters.max_amount}&`;
      if (filters.ordering) url += `ordering=${filters.ordering}&`;
      
      const { data } = await api.get(url);
      return data;
    }
  });

  const updateSaleMutation = useMutation({
    mutationFn: async ({ id, payload }) => await api.patch(`sales/${id}/`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
    onError: (err) => console.error('Sotuvni yangilashda xatolik', err)
  });

  const deleteSaleMutation = useMutation({
    mutationFn: async (id) => await api.delete(`sales/${id}/`),
    onSuccess: () => {
      toast.success("Sotuv muvaffaqiyatli o'chirildi va tovarlar omborga qaytarildi");
      setDeletingSale(null);
      setSelectedSale(null);
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventories'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Sotuvni o'chirishda xatolik");
    }
  });

  const refundSaleMutation = useMutation({
    mutationFn: async ({ id, payload }) => await api.post(`sales/${id}/refund/`, payload),
    onSuccess: (res) => {
      toast.success(res.data?.detail || "Mahsulotlar muvaffaqiyatli qaytarildi");
      setRefundingSale(null);
      setSelectedSale(null);
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventories'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Qaytarishda xatolik yuz berdi");
    }
  });

  const saveEditSaleMutation = useMutation({
    mutationFn: async ({ id, payload }) => await api.patch(`sales/${id}/`, payload),
    onSuccess: () => {
      toast.success("Sotuv ma'lumotlari muvaffaqiyatli yangilandi");
      setEditingSale(null);
      setSelectedSale(null);
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventories'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Sotuvni yangilashda xatolik yuz berdi");
    }
  });

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: async () => (await api.get('users/?page_size=100')).data.results });
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: async () => (await api.get('clients/?page_size=500')).data.results });
  const { data: paymentMethods } = useQuery({ queryKey: ['payment-methods'], queryFn: async () => (await api.get('payment-methods/?page_size=100')).data.results });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: async () => (await api.get('products/?page_size=500')).data.results });
  const { data: cars } = useQuery({ queryKey: ['cars'], queryFn: async () => (await api.get('cars/?page_size=500')).data.results });

  const workers = React.useMemo(() => users?.filter(u => u.role === 'WORKER') || users || [], [users]);

  const handleOpenEdit = (sale) => {
    setEditingSale(sale);
    setEditForm({
      client: sale.client || '',
      car: sale.car || '',
      payment_type: sale.payment_type || '',
      due_date: sale.due_date || '',
      paid_amount: parseFloat(sale.paid_amount || 0),
      items: (sale.items || []).map(i => ({
        id: i.id,
        product: i.product,
        product_name: i.product_name || products?.find(p => p.id === i.product)?.name || `Mahsulot #${i.product}`,
        quantity: parseFloat(i.quantity || 1),
        price: parseFloat(i.price || 0),
        total: parseFloat(i.total || 0)
      })),
      services: (sale.services || []).map(s => ({
        id: s.id,
        worker: s.worker || '',
        worker_name: s.worker_name || '',
        service_name: s.service_name || "Xizmat haqi",
        amount: parseFloat(s.amount || 0)
      }))
    });
    setProdToAdd('');
  };

  const handleOpenRefund = (sale) => {
    setRefundingSale(sale);
    const initialItems = {};
    (sale.items || []).forEach(i => {
      initialItems[i.id] = 0;
    });
    setRefundItems(initialItems);
    setRefundServices([]);
    setRefundReason('Mijoz mahsulotni qaytardi');
    setRefundPaymentMethodId(sale.payment_type || (paymentMethods?.[0]?.id || ''));
  };

  const refundCalculations = React.useMemo(() => {
    if (!refundingSale) return { totalRefund: 0, debtReduction: 0, cashRefund: 0 };
    let itemsRefundTotal = 0;
    (refundingSale.items || []).forEach(item => {
      const qty = parseFloat(refundItems[item.id] || 0);
      if (qty > 0) {
        itemsRefundTotal += qty * parseFloat(item.price || 0);
      }
    });

    let servicesRefundTotal = 0;
    (refundingSale.services || []).forEach(svc => {
      if (refundServices.includes(svc.id)) {
        servicesRefundTotal += parseFloat(svc.amount || 0);
      }
    });

    const totalRefund = itemsRefundTotal + servicesRefundTotal;
    const currentDebt = parseFloat(refundingSale.debt_amount || 0);
    const debtReduction = Math.min(currentDebt, totalRefund);
    const cashRefund = Math.max(0, totalRefund - debtReduction);

    return { totalRefund, debtReduction, cashRefund };
  }, [refundingSale, refundItems, refundServices]);

  const handleConfirmRefund = () => {
    if (!refundingSale) return;
    const { totalRefund } = refundCalculations;
    if (totalRefund <= 0) {
      toast.error("Kamida bitta mahsulot yoki xizmat miqdorini belgilang");
      return;
    }

    const itemsPayload = Object.entries(refundItems)
      .filter(([_, qty]) => parseFloat(qty) > 0)
      .map(([id, qty]) => ({ id: parseInt(id), quantity: parseFloat(qty) }));

    const payload = {
      items: itemsPayload,
      services: refundServices,
      reason: refundReason,
      payment_method: refundPaymentMethodId || undefined
    };

    refundSaleMutation.mutate({ id: refundingSale.id, payload });
  };

  const editCalculations = React.useMemo(() => {
    if (!editForm) return { productsTotal: 0, servicesTotal: 0, totalAmount: 0, debtAmount: 0 };
    const productsTotal = (editForm.items || []).reduce((sum, it) => sum + (parseFloat(it.price || 0) * parseFloat(it.quantity || 0)), 0);
    const servicesTotal = (editForm.services || []).reduce((sum, sc) => sum + parseFloat(sc.amount || 0), 0);
    const totalAmount = productsTotal + servicesTotal;
    const paidAmount = parseFloat(editForm.paid_amount || 0);
    const debtAmount = Math.max(0, totalAmount - paidAmount);
    return { productsTotal, servicesTotal, totalAmount, debtAmount };
  }, [editForm]);

  const handleSaveEdit = () => {
    if (!editingSale || !editForm) return;
    const { totalAmount, debtAmount } = editCalculations;

    const payload = {
      client: editForm.client || null,
      car: editForm.car || null,
      payment_type: editForm.payment_type || null,
      due_date: debtAmount > 0 ? (editForm.due_date || null) : null,
      total_amount: totalAmount,
      paid_amount: parseFloat(editForm.paid_amount || 0),
      debt_amount: debtAmount,
      items: editForm.items.map(it => ({
        product: it.product,
        quantity: parseFloat(it.quantity || 1),
        price: parseFloat(it.price || 0),
        total: parseFloat(it.quantity || 1) * parseFloat(it.price || 0)
      })),
      services: editForm.services.map(sc => ({
        worker: sc.worker || null,
        service_name: sc.service_name || "Xizmat haqi",
        amount: parseFloat(sc.amount || 0)
      }))
    };

    saveEditSaleMutation.mutate({ id: editingSale.id, payload });
  };

  const displayedSales = salesResponse?.results || [];

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilters({
      user: '',
      client: '',
      payment_type: '',
      start_date: '',
      end_date: '',
      due_date_start: '',
      due_date_end: '',
      min_amount: '',
      max_amount: '',
      ordering: '-datetime'
    });
  };

  const handleSort = (field) => {
    if (filters.ordering === field) {
      setFilters({ ...filters, ordering: `-${field}` });
    } else {
      setFilters({ ...filters, ordering: field });
    }
  };

  const getSortIcon = (field) => {
    if (filters.ordering === field) return ' ↑';
    if (filters.ordering === `-${field}`) return ' ↓';
    return '';
  };

  const handlePayDebt = async () => {
    if (!paymentMethodId || !paymentAmount || parseFloat(paymentAmount) <= 0) return;
    const amt = parseFloat(paymentAmount);
    if (amt > parseFloat(payingDebt.debt_amount)) return; // Prevent overpaying
    
    try {
      // 1. Create CashFlow Record
      await api.post('cash-flow/', {
        transaction_type: 'INCOME',
        category: 'DEBT',
        amount: amt,
        payment_method: paymentMethodId,
        client: payingDebt.client,
        user: payingDebt.user,
        sale: payingDebt.id,
        description: `Debt Payment for Sale #${payingDebt.id}`
      });
      
      // 2. Patch Sale Record
      await api.patch(`sales/${payingDebt.id}/`, {
        paid_amount: parseFloat(payingDebt.paid_amount) + amt,
        debt_amount: parseFloat(payingDebt.debt_amount) - amt
      });
      
      // Force reload
      window.location.reload();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ padding: '16px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', color: 'var(--primary)', marginBottom: '4px' }}>Sotuvlar tarixi</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Barcha oldingi sotuv yozuvlarini ko'rish va filtrlash.</p>
        </div>
        <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Download size={16} /> Eksport qilish
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'all_sales', label: 'Barcha sotuvlar', icon: <ShoppingBag size={16} /> },
          { id: 'debts', label: 'To\'lanmagan qarzlar', icon: <FileText size={16} /> },
        ].map(tab => (
          <button 
            key={tab.id} 
            onClick={() => setActiveTab(tab.id)} 
            style={{ 
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', backgroundColor: 'transparent', border: 'none', 
              borderBottom: activeTab === tab.id ? '3px solid var(--primary)' : '3px solid transparent', 
              color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)', 
              fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* FILTER BAR CARD */}
      <div className="card" style={{ marginBottom: '16px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: showAdvanced ? '12px' : '0' }}>
          <div className="input-group" style={{ flex: '2 1 250px', marginBottom: 0 }}>
            <label>Mijoz / Ishchini qidirish</label>
            <div className="search-bar">
              <Search size={16} color="var(--text-muted)" />
              <input 
                type="text" 
                placeholder="Qidirish..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="input-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
            <label>Ishchi</label>
            <SearchableSelect
              value={filters.user}
              onChange={v => setFilters({...filters, user: v})}
              options={users?.map(u => ({ value: u.id, label: u.first_name || u.username })) || []}
              placeholder="Barcha ishchilar"
            />
          </div>

          <div className="input-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
            <label>Mijoz</label>
            <SearchableSelect
              value={filters.client}
              onChange={v => setFilters({...filters, client: v})}
              options={clients?.map(c => ({ value: c.id, label: c.name })) || []}
              placeholder="Barcha mijozlar"
            />
          </div>

          <div className="input-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
            <label>To'lov turi</label>
            <SearchableSelect
              value={filters.payment_type}
              onChange={v => setFilters({...filters, payment_type: v})}
              options={paymentMethods?.map(p => ({ value: p.id, label: p.name })) || []}
              placeholder="Barcha usullar"
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
            >
              Filtrlar {showAdvanced ? '▲' : '▼'}
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={handleResetFilters}
              title="Barcha filtrlarni tozalash"
              style={{ whiteSpace: 'nowrap', opacity: 0.8 }}
            >
              Tozalash
            </button>
          </div>
        </div>

        {showAdvanced && (
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', paddingTop: '16px', borderTop: '1px solid var(--border)', marginTop: '16px' }}>
            <div className="input-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
              <label>Boshlanish sanasi</label>
              <input 
                type="date" 
                value={filters.start_date}
                onChange={e => setFilters({...filters, start_date: e.target.value})}
                className="input-field" 
                
              />
            </div>

            <div className="input-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
              <label>Tugash sanasi</label>
              <input 
                type="date" 
                value={filters.end_date}
                onChange={e => setFilters({...filters, end_date: e.target.value})}
                className="input-field" 
              />
            </div>

            <div className="input-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
              <label>Muddat (dan)</label>
              <input 
                type="date" 
                value={filters.due_date_start}
                onChange={e => setFilters({...filters, due_date_start: e.target.value})}
                className="input-field" 
              />
            </div>

            <div className="input-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
              <label>Muddat (gacha)</label>
              <input 
                type="date" 
                value={filters.due_date_end}
                onChange={e => setFilters({...filters, due_date_end: e.target.value})}
                className="input-field" 
              />
            </div>

            <div className="input-group" style={{ flex: '1 1 140px', marginBottom: 0 }}>
              <label>Eng kam jami (SO'M)</label>
              <input 
                type="number" 
                placeholder="Min 0"
                value={filters.min_amount}
                onChange={e => setFilters({...filters, min_amount: e.target.value})}
                className="input-field"
              />
            </div>

            <div className="input-group" style={{ flex: '1 1 140px', marginBottom: 0 }}>
              <label>Eng ko'p jami (SO'M)</label>
              <input 
                type="number" 
                placeholder="Maks..."
                value={filters.max_amount}
                onChange={e => setFilters({...filters, max_amount: e.target.value})}
                className="input-field"
              />
            </div>

            <div className="input-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
              <label>Saralash</label>
              <select 
                value={filters.ordering} 
                onChange={e => setFilters({...filters, ordering: e.target.value})}
                className="input-field"
              >
                <option value="-datetime">Sana (Yangi)</option>
                <option value="datetime">Sana (Eski)</option>
                <option value="-total_amount">Miqdor (Yuqoridan pastga)</option>
                <option value="total_amount">Miqdor (Pastdan yuqoriga)</option>
                <option value="-debt_amount">Qarz (Eng ko'p)</option>
                <option value="due_date">Muddat (Yaqin)</option>
                <option value="-due_date">Muddat (Uzoq)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>Sotuvlar ma'lumotlari yuklanmoqda...</div>
        ) : (!displayedSales || displayedSales.length === 0) ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <ShoppingBag size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <h3>Sotuvlar topilmadi</h3>
            <p>Filtrlaringizni o'zgartirib ko'ring.</p>
          </div>
        ) : (
          <>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: 'var(--surface-hover)' }}>
              <tr>
                <th onClick={() => handleSort('id')} style={{ cursor: 'pointer' }}>ID{getSortIcon('id')}</th>
                <th onClick={() => handleSort('client__name')} style={{ cursor: 'pointer' }}>Mijoz{getSortIcon('client__name')}</th>
                <th onClick={() => handleSort('user__first_name')} style={{ cursor: 'pointer' }}>Ishchi{getSortIcon('user__first_name')}</th>
                <th onClick={() => handleSort('datetime')} style={{ cursor: 'pointer' }}>Sana{getSortIcon('datetime')}</th>
                <th onClick={() => handleSort('payment_type__name')} style={{ cursor: 'pointer' }}>To'lov{getSortIcon('payment_type__name')}</th>
                <th onClick={() => handleSort('total_amount')} style={{ cursor: 'pointer' }}>Jami{getSortIcon('total_amount')}</th>
                <th onClick={() => handleSort('paid_amount')} style={{ cursor: 'pointer' }}>To'landi{getSortIcon('paid_amount')}</th>
                <th onClick={() => handleSort('debt_amount')} style={{ cursor: 'pointer' }}>Qarz{getSortIcon('debt_amount')}</th>
                <th onClick={() => handleSort('due_date')} style={{ cursor: 'pointer' }}>Muddat{getSortIcon('due_date')}</th>
                <th style={{ textAlign: 'center' }}>Tafsilotlar</th>
              </tr>
            </thead>
            <tbody>
              {displayedSales.map(sale => (
                <tr key={sale.id}>
                  <td style={{ color: 'var(--text-muted)', fontWeight: 500 }}>#{sale.id}</td>
                  <td style={{ fontWeight: 600 }}>
                    <div>{sale.client ? clients?.find(c => c.id === sale.client)?.name : 'Oddiy mijoz'}</div>
                    {(sale.car_plate || (sale.car && cars?.find(c => c.id === sale.car)?.plate_number)) && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <Car size={13} style={{ color: 'var(--primary)' }} />
                        <span>{sale.car_plate || cars?.find(c => c.id === sale.car)?.plate_number}</span>
                        {(sale.car_type || (sale.car && cars?.find(c => c.id === sale.car)?.car_type)) && (
                          <span style={{ opacity: 0.8 }}>({sale.car_type || cars?.find(c => c.id === sale.car)?.car_type})</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td>{users?.find(u => u.id === sale.user)?.first_name || 'Tizim'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{new Date(sale.datetime).toLocaleString()}</td>
                  <td>{paymentMethods?.find(m => m.id === sale.payment_type)?.name || sale.payment_type}</td>
                  <td style={{ fontWeight: 'bold' }}>{parseFloat(sale.total_amount).toLocaleString()}</td>
                  <td style={{ color: '#2ecc71', fontWeight: 500 }}>{parseFloat(sale.paid_amount).toLocaleString()}</td>
                  <td style={{ color: parseFloat(sale.debt_amount) > 0 ? '#e74c3c' : 'var(--text-muted)', fontWeight: 500 }}>
                    {parseFloat(sale.debt_amount).toLocaleString()}
                  </td>
                  <td>
                    {parseFloat(sale.debt_amount) > 0 ? (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{sale.due_date || '-'}</div>
                        {sale.due_date && (
                          <span style={{
                            display: 'inline-block',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: getDueDateStatus(sale.due_date, sale.debt_amount).bg,
                            color: getDueDateStatus(sale.due_date, sale.debt_amount).color,
                            marginTop: '2px'
                          }}>
                            {getDueDateStatus(sale.due_date, sale.debt_amount).label}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>-</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                      <button className="btn-icon" style={{ color: 'var(--primary)' }} title="Tafsilotlarni ko'rish" onClick={() => setSelectedSale(sale)}>
                        <FileText size={17} />
                      </button>
                      <button 
                        className="btn-icon" 
                        style={{ color: '#0284c7' }} 
                        title="Tashkilot PDF hisob-fakturasi / chek" 
                        onClick={() => setOrgInvoiceSale(sale)}
                      >
                        <Download size={17} />
                      </button>
                      <button 
                        className="btn-icon" 
                        style={{ color: '#2ecc71' }} 
                        title="Kassir chekini chop etish (Narx bilan)" 
                        onClick={() => handlePrintSale(sale.id, 'cashier')}
                      >
                        <Printer size={17} />
                      </button>
                      <button 
                        className="btn-icon" 
                        style={{ color: '#3498db' }} 
                        title="Ishchi chekini chop etish (Narxsiz - Ustaxona)" 
                        onClick={() => handlePrintSale(sale.id, 'worker')}
                      >
                        <Wrench size={17} />
                      </button>
                      <button 
                        className="btn-icon" 
                        style={{ color: '#e67e22' }} 
                        title="Sotuvni tahrirlash (Mahsulotlar va xizmatlar)" 
                        onClick={() => handleOpenEdit(sale)}
                      >
                        <Edit3 size={17} />
                      </button>
                      <button 
                        className="btn-icon" 
                        style={{ color: '#9b59b6' }} 
                        title="Mahsulot qaytarish (Vozvrat / Refund)" 
                        onClick={() => handleOpenRefund(sale)}
                      >
                        <RotateCcw size={17} />
                      </button>
                      <button 
                        className="btn-icon" 
                        style={{ color: '#e74c3c' }} 
                        title="Sotuvni o'chirish (Omborga qaytarish)" 
                        onClick={() => setDeletingSale(sale)}
                      >
                        <Trash2 size={17} />
                      </button>
                      {activeTab === 'debts' && (
                        <button className="btn" style={{ fontSize: '0.8rem', padding: '4px 12px', background: '#2ecc71', color: 'white' }} onClick={() => { setPayingDebt(sale); setPaymentAmount(sale.debt_amount); setPaymentMethodId(''); }}>
                          Qarzni to'lash
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            currentPage={salesResponse?.current_page || page}
            totalPages={salesResponse?.total_pages || 1}
            totalItems={salesResponse?.count || 0}
            pageSize={pageSize}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(sz) => { setPageSize(sz); setPage(1); }}
          />
          </>
        )}
      </div>

      {/* ================= DETAILS MODAL ================= */}
      {selectedSale && (
        <div className="modal-overlay" onClick={() => setSelectedSale(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '720px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between mb-4">
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Sotuv #{selectedSale.id} Tafsilotlari</h2>
              <button className="btn-icon" onClick={() => setSelectedSale(null)}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px', background: 'var(--surface-hover)', padding: '16px', borderRadius: '12px', fontSize: '0.9rem' }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Mijoz:</span> <strong>{selectedSale.client ? clients?.find(c => c.id === selectedSale.client)?.name : 'Oddiy mijoz'}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Ishchi (Kassir):</span> <strong>{users?.find(u => u.id === selectedSale.user)?.first_name || 'Tizim'}</strong></div>
              
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Avtomobil:</span>{' '}
                <strong>
                  {selectedSale.car_plate || (selectedSale.car ? cars?.find(c => c.id === selectedSale.car)?.plate_number : '') || "Biriktirilmagan"}
                  {(selectedSale.car_type || (selectedSale.car ? cars?.find(c => c.id === selectedSale.car)?.car_type : '')) ? ` (${selectedSale.car_type || cars?.find(c => c.id === selectedSale.car)?.car_type})` : ''}
                </strong>
              </div>
              <div><span style={{ color: 'var(--text-muted)' }}>Sana:</span> <strong>{new Date(selectedSale.datetime).toLocaleString()}</strong></div>

              <div><span style={{ color: 'var(--text-muted)' }}>To'lov turi:</span> <strong>{paymentMethods?.find(m => m.id === selectedSale.payment_type)?.name || selectedSale.payment_type}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Jami summa:</span> <strong style={{ fontSize: '1.05rem', color: 'var(--primary)' }}>{parseFloat(selectedSale.total_amount).toLocaleString()} SO'M</strong></div>

              <div><span style={{ color: 'var(--text-muted)' }}>To'landi:</span> <strong style={{ color: '#2ecc71', fontSize: '1.05rem' }}>{parseFloat(selectedSale.paid_amount).toLocaleString()} SO'M</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Qarz:</span> <strong style={{ color: parseFloat(selectedSale.debt_amount) > 0 ? '#e74c3c' : 'inherit', fontSize: '1.05rem' }}>{parseFloat(selectedSale.debt_amount).toLocaleString()} SO'M</strong></div>

              <div>
                <span style={{ color: 'var(--text-muted)' }}>Qarz muddati:</span>{' '}
                {parseFloat(selectedSale.debt_amount) > 0 ? (
                  <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span>{selectedSale.due_date || '-'}</span>
                    {selectedSale.due_date && (
                      <span style={{
                        fontSize: '0.72rem',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: getDueDateStatus(selectedSale.due_date, selectedSale.debt_amount).bg,
                        color: getDueDateStatus(selectedSale.due_date, selectedSale.debt_amount).color
                      }}>
                        {getDueDateStatus(selectedSale.due_date, selectedSale.debt_amount).label}
                      </span>
                    )}
                  </strong>
                ) : (
                  <span style={{ color: '#2ecc71', fontWeight: 500 }}>To'langan</span>
                )}
              </div>
            </div>

            {/* Products Table */}
            <h3 style={{ marginBottom: '10px', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShoppingBag size={17} color="var(--primary)" /> Mahsulotlar ({(selectedSale.items || []).length} ta)
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginBottom: '20px', fontSize: '0.88rem' }}>
              <thead style={{ backgroundColor: 'var(--surface-hover)' }}>
                <tr>
                  <th style={{ padding: '8px 12px' }}>Mahsulot</th>
                  <th style={{ padding: '8px 12px' }}>Narx</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Miqdor</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Jami</th>
                </tr>
              </thead>
              <tbody>
                {(selectedSale.items || []).length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Mahsulot sotilmagan (faqat xizmat)
                    </td>
                  </tr>
                ) : (
                  selectedSale.items.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                        {item.product_name || products?.find(p => p.id === item.product)?.name || `Mahsulot #${item.product}`}
                      </td>
                      <td style={{ padding: '8px 12px' }}>{parseFloat(item.price).toLocaleString()} SO'M</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>{item.quantity}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{parseFloat(item.total).toLocaleString()} SO'M</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Services Table */}
            {selectedSale.services && selectedSale.services.length > 0 && (
              <>
                <h3 style={{ marginBottom: '10px', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wrench size={17} color="var(--primary)" /> Xizmatlar / Ustalar haqi ({selectedSale.services.length} ta)
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginBottom: '20px', fontSize: '0.88rem' }}>
                  <thead style={{ backgroundColor: 'var(--surface-hover)' }}>
                    <tr>
                      <th style={{ padding: '8px 12px' }}>Xizmat nomi</th>
                      <th style={{ padding: '8px 12px' }}>Usta (Mexanik)</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Summa (UZS)</th>
                      {selectedSale.services.some(s => parseFloat(s.amount_usd || 0) > 0) && (
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Summa (USD)</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSale.services.map(svc => (
                      <tr key={svc.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{svc.service_name || "Xizmat haqi"}</td>
                        <td style={{ padding: '8px 12px' }}>{svc.worker_name || users?.find(u => u.id === svc.worker)?.first_name || "Tayinlanmagan"}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>
                          {parseFloat(svc.amount || 0).toLocaleString()} SO'M
                        </td>
                        {selectedSale.services.some(s => parseFloat(s.amount_usd || 0) > 0) && (
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981' }}>
                            ${parseFloat(svc.amount_usd || 0).toFixed(2)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button 
                  type="button"
                  className="btn btn-secondary" 
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#0284c7', fontWeight: 600 }}
                  onClick={() => setOrgInvoiceSale(selectedSale)}
                >
                  <Download size={15} /> PDF hisob-faktura (Tashkilot)
                </button>
                <button 
                  type="button"
                  className="btn btn-secondary" 
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
                  onClick={() => handlePrintSale(selectedSale.id, 'cashier')}
                >
                  <Printer size={15} style={{ color: '#2ecc71' }} /> Kassir cheki
                </button>
                <button 
                  type="button"
                  className="btn btn-secondary" 
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
                  onClick={() => handlePrintSale(selectedSale.id, 'worker')}
                >
                  <Wrench size={15} style={{ color: '#3498db' }} /> Ishchi cheki
                </button>
                <button 
                  type="button"
                  className="btn btn-secondary" 
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#e67e22' }}
                  onClick={() => {
                    const s = selectedSale;
                    setSelectedSale(null);
                    handleOpenEdit(s);
                  }}
                >
                  <Edit3 size={15} /> Tahrirlash
                </button>
                <button 
                  type="button"
                  className="btn btn-secondary" 
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#9b59b6' }}
                  onClick={() => {
                    const s = selectedSale;
                    setSelectedSale(null);
                    handleOpenRefund(s);
                  }}
                >
                  <RotateCcw size={15} /> Qaytarish (Refund)
                </button>
                <button 
                  type="button"
                  className="btn btn-secondary" 
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#ef4444' }}
                  onClick={() => {
                    const s = selectedSale;
                    setSelectedSale(null);
                    setDeletingSale(s);
                  }}
                >
                  <Trash2 size={15} /> O'chirish
                </button>
              </div>
              <button className="btn btn-secondary" onClick={() => setSelectedSale(null)}>Yopish</button>
            </div>
          </div>
        </div>
      )}

      {/* ================= DELETE CONFIRM MODAL ================= */}
      {deletingSale && (
        <div className="modal-overlay" onClick={() => setDeletingSale(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px', padding: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px'
              }}>
                <Trash2 size={28} />
              </div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Sotuv #{deletingSale.id} ni o'chirish</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginTop: '6px' }}>
                Haqiqatan ham ushbu sotuvni o'chirmoqchimisiz?
              </p>
            </div>

            <div style={{
              background: 'var(--surface-hover)',
              padding: '14px 16px',
              borderRadius: '10px',
              fontSize: '0.83rem',
              color: 'var(--text-muted)',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div>• <strong>Mahsulotlar:</strong> Barcha sotilgan mahsulotlar avtomatik omborga qaytariladi.</div>
              <div>• <strong>FIFO Partiyalar:</strong> Qoldiqlar tiklanadi.</div>
              <div>• <strong>Qarz va Kassa:</strong> Sotuv bo'yicha shakllangan qarz va kassa tushumlari bekor qilinadi.</div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setDeletingSale(null)}
                disabled={deleteSaleMutation.isPending}
              >
                Bekor qilish
              </button>
              <button
                type="button"
                className="btn btn-danger"
                style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none' }}
                onClick={() => deleteSaleMutation.mutate(deletingSale.id)}
                disabled={deleteSaleMutation.isPending}
              >
                {deleteSaleMutation.isPending ? "O'chirilmoqda..." : "Ha, o'chirilsin"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= REFUND (VOZVRAT) MODAL ================= */}
      {refundingSale && (
        <div className="modal-overlay" onClick={() => setRefundingSale(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <div className="flex-between mb-3">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#9b59b6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RotateCcw size={20} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Mahsulot qaytarish (Vozvrat)</h2>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Sotuv #{refundingSale.id} • {refundingSale.client ? clients?.find(c => c.id === refundingSale.client)?.name : 'Oddiy mijoz'}
                  </div>
                </div>
              </div>
              <button className="btn-icon" onClick={() => setRefundingSale(null)}>
                <X size={18} />
              </button>
            </div>

            {/* Quick action: Refund all */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', background: 'var(--surface-hover)', padding: '10px 14px', borderRadius: '10px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Sotuv summasi: {parseFloat(refundingSale.total_amount).toLocaleString()} SO'M</span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                onClick={() => {
                  const allItems = {};
                  (refundingSale.items || []).forEach(it => {
                    allItems[it.id] = parseFloat(it.quantity || 0);
                  });
                  setRefundItems(allItems);
                  setRefundServices((refundingSale.services || []).map(s => s.id));
                }}
              >
                Barchasini to'liq qaytarish
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '0.92rem' }}>Mahsulotlar</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem', marginBottom: '16px' }}>
                <thead style={{ backgroundColor: 'var(--surface-hover)' }}>
                  <tr>
                    <th style={{ padding: '8px 10px' }}>Mahsulot</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Narx</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Sotilgan</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Qaytarish miqdori</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Qaytarish summasi</th>
                  </tr>
                </thead>
                <tbody>
                  {(refundingSale.items || []).map(item => {
                    const pName = products?.find(p => p.id === item.product)?.name || item.product_name || `Mahsulot #${item.product}`;
                    const curQty = parseFloat(refundItems[item.id] || 0);
                    const subtotal = curQty * parseFloat(item.price || 0);
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{pName}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{parseFloat(item.price).toLocaleString()}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>{item.quantity}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            max={parseFloat(item.quantity)}
                            step="any"
                            value={curQty}
                            onChange={e => {
                              const val = Math.max(0, Math.min(parseFloat(item.quantity), parseFloat(e.target.value) || 0));
                              setRefundItems(prev => ({ ...prev, [item.id]: val }));
                            }}
                            className="input-field"
                            style={{ width: '80px', textAlign: 'center', padding: '4px', margin: '0 auto', fontSize: '0.85rem' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: curQty > 0 ? '#9b59b6' : 'var(--text-muted)' }}>
                          {subtotal.toLocaleString()} SO'M
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Services Refund list if any */}
              {refundingSale.services && refundingSale.services.length > 0 && (
                <>
                  <h4 style={{ margin: '14px 0 8px 0', fontSize: '0.92rem' }}>Xizmatlar</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem', marginBottom: '16px' }}>
                    <thead style={{ backgroundColor: 'var(--surface-hover)' }}>
                      <tr>
                        <th style={{ padding: '8px 10px', width: '40px', textAlign: 'center' }}>Qaytarish</th>
                        <th style={{ padding: '8px 10px' }}>Xizmat</th>
                        <th style={{ padding: '8px 10px' }}>Usta</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Summa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refundingSale.services.map(svc => {
                        const isChecked = refundServices.includes(svc.id);
                        return (
                          <tr key={svc.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setRefundServices(prev => [...prev, svc.id]);
                                  } else {
                                    setRefundServices(prev => prev.filter(id => id !== svc.id));
                                  }
                                }}
                              />
                            </td>
                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{svc.service_name}</td>
                            <td style={{ padding: '8px 10px' }}>{svc.worker_name || 'Usta'}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                              {parseFloat(svc.amount).toLocaleString()} SO'M
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}

              {/* Financial Refund Breakdown */}
              <div style={{ background: 'var(--surface-hover)', padding: '14px', borderRadius: '12px', marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Jami qaytarilayotgan qiymat:</span>
                  <strong style={{ fontSize: '1.05rem', color: '#9b59b6' }}>{refundCalculations.totalRefund.toLocaleString()} SO'M</strong>
                </div>
                {refundCalculations.debtReduction > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.85rem' }}>
                    <span style={{ color: '#e67e22' }}>• Qarzdan kamaytiriladi:</span>
                    <strong style={{ color: '#e67e22' }}>-{refundCalculations.debtReduction.toLocaleString()} SO'M</strong>
                  </div>
                )}
                {refundCalculations.cashRefund > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.85rem' }}>
                    <span style={{ color: '#2ecc71' }}>• Mijozga qaytariladigan summa:</span>
                    <strong style={{ color: '#2ecc71' }}>{refundCalculations.cashRefund.toLocaleString()} SO'M</strong>
                  </div>
                )}
              </div>

              {/* Payment method if cash refund */}
              {refundCalculations.cashRefund > 0 && (
                <div className="input-group" style={{ marginTop: '14px', marginBottom: '10px' }}>
                  <label>Qaytarish to'lov usuli (Kassadan chiqim)</label>
                  <SearchableSelect
                    value={refundPaymentMethodId}
                    onChange={v => setRefundPaymentMethodId(v)}
                    options={paymentMethods?.map(p => ({ value: p.id, label: p.name })) || []}
                    placeholder="To'lov usulini tanlang..."
                  />
                </div>
              )}

              <div className="input-group" style={{ marginTop: '10px', marginBottom: 0 }}>
                <label>Qaytarish sababi / Izoh</label>
                <input
                  type="text"
                  value={refundReason}
                  onChange={e => setRefundReason(e.target.value)}
                  placeholder="Masalan: Mahsulot to'g'ri kelmadi..."
                  className="input-field"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setRefundingSale(null)}
                disabled={refundSaleMutation.isPending}
              >
                Bekor qilish
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#9b59b6', borderColor: '#9b59b6' }}
                onClick={handleConfirmRefund}
                disabled={refundSaleMutation.isPending || refundCalculations.totalRefund <= 0}
              >
                {refundSaleMutation.isPending ? "Qaytarilmoqda..." : "Qaytarishni tasdiqlash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= EDIT SALE MODAL ================= */}
      {editingSale && editForm && (
        <div className="modal-overlay" onClick={() => setEditingSale(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '840px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <div className="flex-between mb-3">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#e67e22', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Edit3 size={20} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Sotuv #{editingSale.id} ni tahrirlash</h2>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Mahsulotlar, xizmatlar, mijoz va to'lov ma'lumotlarini o'zgartirish
                  </div>
                </div>
              </div>
              <button className="btn-icon" onClick={() => setEditingSale(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
              {/* Sale Info row: Client, Car, Payment Method, Due Date */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', background: 'var(--surface-hover)', padding: '14px', borderRadius: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Mijoz</label>
                  <SearchableSelect
                    value={editForm.client}
                    onChange={v => setEditForm(prev => ({ ...prev, client: v }))}
                    options={clients?.map(c => ({ value: c.id, label: c.name })) || []}
                    placeholder="Mijozni tanlang..."
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Avtomobil</label>
                  <SearchableSelect
                    value={editForm.car}
                    onChange={v => setEditForm(prev => ({ ...prev, car: v }))}
                    options={cars?.map(c => ({ value: c.id, label: `${c.plate_number}${c.car_type ? ` (${c.car_type})` : ''}` })) || []}
                    placeholder="Avtoraqam tanlang..."
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>To'lov usuli</label>
                  <SearchableSelect
                    value={editForm.payment_type}
                    onChange={v => setEditForm(prev => ({ ...prev, payment_type: v }))}
                    options={paymentMethods?.map(p => ({ value: p.id, label: p.name })) || []}
                    placeholder="To'lov usuli..."
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Qarz muddati</label>
                  <input
                    type="date"
                    value={editForm.due_date || ''}
                    onChange={e => setEditForm(prev => ({ ...prev, due_date: e.target.value }))}
                    className="input-field"
                    style={{ fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {/* Items Section */}
              <div style={{ marginBottom: '20px' }}>
                <div className="flex-between mb-2">
                  <h4 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShoppingBag size={17} color="var(--primary)" /> Mahsulotlar ro'yxati
                  </h4>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ width: '240px' }}>
                      <SearchableSelect
                        value={prodToAdd}
                        onChange={v => {
                          if (v) {
                            const p = products?.find(prod => prod.id === v);
                            if (p) {
                              setEditForm(prev => ({
                                ...prev,
                                items: [
                                  ...prev.items,
                                  {
                                    id: `new-${Date.now()}`,
                                    product: p.id,
                                    product_name: p.name,
                                    quantity: 1,
                                    price: parseFloat(p.selling_price || 0),
                                    total: parseFloat(p.selling_price || 0)
                                  }
                                ]
                              }));
                            }
                            setProdToAdd('');
                          }
                        }}
                        options={products?.map(p => ({ value: p.id, label: `${p.name} (${parseFloat(p.selling_price).toLocaleString()} so'm)` })) || []}
                        placeholder="+ Mahsulot qo'shish..."
                      />
                    </div>
                  </div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead style={{ backgroundColor: 'var(--surface-hover)' }}>
                    <tr>
                      <th style={{ padding: '8px 10px' }}>Mahsulot</th>
                      <th style={{ padding: '8px 10px', width: '140px' }}>Narx (SO'M)</th>
                      <th style={{ padding: '8px 10px', width: '100px' }}>Miqdor</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', width: '130px' }}>Jami</th>
                      <th style={{ padding: '8px 10px', width: '40px', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editForm.items.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          Mahsulotlar yo'q
                        </td>
                      </tr>
                    ) : (
                      editForm.items.map((it, idx) => (
                        <tr key={it.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 600 }}>{it.product_name}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <input
                              type="number"
                              min="0"
                              value={it.price}
                              onChange={e => {
                                const newPrice = parseFloat(e.target.value) || 0;
                                setEditForm(prev => {
                                  const items = [...prev.items];
                                  items[idx] = { ...items[idx], price: newPrice, total: newPrice * items[idx].quantity };
                                  return { ...prev, items };
                                });
                              }}
                              className="input-field"
                              style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                            />
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <input
                              type="number"
                              min="0.1"
                              step="any"
                              value={it.quantity}
                              onChange={e => {
                                const newQty = parseFloat(e.target.value) || 0;
                                setEditForm(prev => {
                                  const items = [...prev.items];
                                  items[idx] = { ...items[idx], quantity: newQty, total: items[idx].price * newQty };
                                  return { ...prev, items };
                                });
                              }}
                              className="input-field"
                              style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                            />
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                            {(it.price * it.quantity).toLocaleString()}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn-icon"
                              style={{ color: '#ef4444' }}
                              onClick={() => {
                                setEditForm(prev => ({
                                  ...prev,
                                  items: prev.items.filter((_, i) => i !== idx)
                                }));
                              }}
                              title="O'chirish"
                            >
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Services Section */}
              <div style={{ marginBottom: '20px' }}>
                <div className="flex-between mb-2">
                  <h4 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Wrench size={17} color="var(--primary)" /> Xizmatlar (Ustalar)
                  </h4>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => {
                      setEditForm(prev => ({
                        ...prev,
                        services: [
                          ...prev.services,
                          {
                            id: `new-svc-${Date.now()}`,
                            worker: '',
                            service_name: "Xizmat haqi",
                            amount: 0
                          }
                        ]
                      }));
                    }}
                  >
                    <Plus size={14} /> Xizmat qo'shish
                  </button>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead style={{ backgroundColor: 'var(--surface-hover)' }}>
                    <tr>
                      <th style={{ padding: '8px 10px' }}>Xizmat nomi</th>
                      <th style={{ padding: '8px 10px', width: '220px' }}>Usta (Mexanik)</th>
                      <th style={{ padding: '8px 10px', width: '160px', textAlign: 'right' }}>Summa (SO'M)</th>
                      <th style={{ padding: '8px 10px', width: '40px', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editForm.services.length === 0 ? (
                      <tr>
                        <td colSpan="4" style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          Xizmatlar yo'q
                        </td>
                      </tr>
                    ) : (
                      editForm.services.map((svc, idx) => (
                        <tr key={svc.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 10px' }}>
                            <input
                              type="text"
                              value={svc.service_name}
                              onChange={e => {
                                const val = e.target.value;
                                setEditForm(prev => {
                                  const services = [...prev.services];
                                  services[idx] = { ...services[idx], service_name: val };
                                  return { ...prev, services };
                                });
                              }}
                              className="input-field"
                              style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                            />
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <select
                              value={svc.worker || ''}
                              onChange={e => {
                                const val = e.target.value ? parseInt(e.target.value) : '';
                                setEditForm(prev => {
                                  const services = [...prev.services];
                                  services[idx] = { ...services[idx], worker: val };
                                  return { ...prev, services };
                                });
                              }}
                              className="input-field"
                              style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                            >
                              <option value="">Tayinlanmagan</option>
                              {workers.map(w => (
                                <option key={w.id} value={w.id}>
                                  {w.first_name ? `${w.first_name} ${w.last_name || ''}` : w.username} {w.job ? `(${w.job})` : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                            <input
                              type="number"
                              min="0"
                              value={svc.amount}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                setEditForm(prev => {
                                  const services = [...prev.services];
                                  services[idx] = { ...services[idx], amount: val };
                                  return { ...prev, services };
                                });
                              }}
                              className="input-field"
                              style={{ padding: '4px 8px', fontSize: '0.85rem', textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn-icon"
                              style={{ color: '#ef4444' }}
                              onClick={() => {
                                setEditForm(prev => ({
                                  ...prev,
                                  services: prev.services.filter((_, i) => i !== idx)
                                }));
                              }}
                              title="O'chirish"
                            >
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totals & Paid Amount editing */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: 'var(--surface-hover)', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.86rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Mahsulotlar jami:</span>
                    <strong>{editCalculations.productsTotal.toLocaleString()} SO'M</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.86rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Xizmatlar jami:</span>
                    <strong>{editCalculations.servicesTotal.toLocaleString()} SO'M</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                    <span>Umumiy Jami:</span>
                    <strong style={{ color: 'var(--primary)', fontSize: '1.15rem' }}>{editCalculations.totalAmount.toLocaleString()} SO'M</strong>
                  </div>
                </div>

                <div>
                  <div className="input-group" style={{ marginBottom: '8px' }}>
                    <label style={{ fontSize: '0.82rem' }}>To'langan summa (SO'M)</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.paid_amount}
                      onChange={e => setEditForm(prev => ({ ...prev, paid_amount: e.target.value }))}
                      className="input-field"
                      style={{ fontSize: '0.95rem', fontWeight: 700, color: '#2ecc71' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginTop: '6px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Qarz summasi:</span>
                    <strong style={{ color: editCalculations.debtAmount > 0 ? '#e74c3c' : '#2ecc71', fontSize: '1.05rem' }}>
                      {editCalculations.debtAmount.toLocaleString()} SO'M
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.82rem' }}
                onClick={() => {
                  setEditingSale(null);
                  navigate(`/pos?edit=${editingSale.id}`);
                }}
              >
                POS orqali to'liq tahrirlash (Shtrixkod bilan)
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingSale(null)}
                  disabled={saveEditSaleMutation.isPending}
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveEdit}
                  disabled={saveEditSaleMutation.isPending}
                >
                  {saveEditSaleMutation.isPending ? "Saqlanmoqda..." : "O'zgarishlarni saqlash"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= PAY DEBT MODAL ================= */}
      {payingDebt && (
        <div className="modal-overlay" onClick={() => setPayingDebt(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h2 style={{ marginBottom: '24px' }}>Qarzni to'lash (Sotuv #{payingDebt.id})</h2>
            
            <div className="input-group">
              <label>To'lov usuli</label>
              <SearchableSelect
                value={paymentMethodId}
                onChange={v => setPaymentMethodId(v)}
                options={paymentMethods?.map(p => ({ value: p.id, label: p.name })) || []}
                placeholder="Usulni tanlang..."
              />
            </div>

            <div className="input-group">
              <label>Miqdor (Maks: {parseFloat(payingDebt.debt_amount).toLocaleString()} SO'M)</label>
              <input 
                type="number" 
                value={paymentAmount} 
                onChange={e => setPaymentAmount(e.target.value)} 
                className="input-field" 
                max={parseFloat(payingDebt.debt_amount)}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setPayingDebt(null)}>Bekor qilish</button>
              <button className="btn btn-success" style={{ flex: 1, background: '#2ecc71', color: 'white' }} onClick={handlePayDebt}>To'lovni tasdiqlash</button>
            </div>
          </div>
        </div>
      )}

      {/* ================= ORGANIZATION INVOICE / PDF EXPORT MODAL ================= */}
      <OrganizationInvoiceModal 
        isOpen={Boolean(orgInvoiceSale)}
        onClose={() => setOrgInvoiceSale(null)}
        sale={orgInvoiceSale}
        users={users || []}
        clients={clients || []}
        cars={cars || []}
        paymentMethods={paymentMethods || []}
      />
    </div>
  );
}
