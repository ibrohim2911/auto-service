import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Search, FileText, Download, Printer, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import SearchableSelect from '../components/SearchableSelect';
import Pagination from '../components/Pagination';
import { useDebounce } from '../hooks/useDebounce';

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
  const [payingDebt, setPayingDebt] = useState(null);
  
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

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: async () => (await api.get('users/?page_size=100')).data.results });
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: async () => (await api.get('clients/?page_size=500')).data.results });
  const { data: paymentMethods } = useQuery({ queryKey: ['payment-methods'], queryFn: async () => (await api.get('payment-methods/?page_size=100')).data.results });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: async () => (await api.get('products/?page_size=500')).data.results });

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
                  <td style={{ fontWeight: 600 }}>{sale.client ? clients?.find(c => c.id === sale.client)?.name : 'Oddiy mijoz'}</td>
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
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <button className="btn-icon" style={{ color: 'var(--primary)' }} title="Tafsilotlarni ko'rish" onClick={() => setSelectedSale(sale)}>
                        <FileText size={18} />
                      </button>
                      <button 
                        className="btn-icon" 
                        style={{ color: '#2ecc71' }} 
                        title="Kassir chekini chop etish (Narx bilan)" 
                        onClick={() => handlePrintSale(sale.id, 'cashier')}
                      >
                        <Printer size={18} />
                      </button>
                      <button 
                        className="btn-icon" 
                        style={{ color: '#3498db' }} 
                        title="Ishchi chekini chop etish (Narxsiz - Ustaxona)" 
                        onClick={() => handlePrintSale(sale.id, 'worker')}
                      >
                        <Wrench size={18} />
                      </button>
                      <button className="btn-icon" title="Sotuvni tahrirlash" onClick={() => {
                        navigate(`/pos?edit=${sale.id}`);
                      }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
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

      {selectedSale && (
        <div className="modal-overlay" onClick={() => setSelectedSale(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="flex-between mb-4">
              <h2 style={{ margin: 0 }}>Sotuv #{selectedSale.id} Tafsilotlari</h2>
              <button className="btn-icon" onClick={() => setSelectedSale(null)}>
                <FileText size={18} />
              </button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px', background: 'var(--surface-hover)', padding: '16px', borderRadius: '12px' }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Mijoz:</span> <strong>{selectedSale.client ? clients?.find(c => c.id === selectedSale.client)?.name : 'Oddiy mijoz'}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Ishchi:</span> <strong>{users?.find(u => u.id === selectedSale.user)?.first_name || 'Tizim'}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Sana:</span> <strong>{new Date(selectedSale.datetime).toLocaleString()}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>To'lov:</span> <strong>{paymentMethods?.find(m => m.id === selectedSale.payment_type)?.name || selectedSale.payment_type}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Jami:</span> <strong style={{ fontSize: '1.1rem' }}>{parseFloat(selectedSale.total_amount).toLocaleString()} SO'M</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>To'landi:</span> <strong style={{ color: '#2ecc71', fontSize: '1.1rem' }}>{parseFloat(selectedSale.paid_amount).toLocaleString()} SO'M</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Qarz:</span> <strong style={{ color: parseFloat(selectedSale.debt_amount) > 0 ? '#e74c3c' : 'inherit', fontSize: '1.1rem' }}>{parseFloat(selectedSale.debt_amount).toLocaleString()} SO'M</strong></div>
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

            <h3 style={{ marginBottom: '12px', fontSize: '1.1rem' }}>Mahsulotlar</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ backgroundColor: 'var(--surface-hover)' }}>
                <tr>
                  <th>Mahsulot</th>
                  <th>Narx</th>
                  <th>Miqdor</th>
                  <th>Jami</th>
                </tr>
              </thead>
              <tbody>
                {selectedSale.items?.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td>{products?.find(p => p.id === item.product)?.name || `Mahsulot #${item.product}`}</td>
                    <td>{parseFloat(item.price).toLocaleString()}</td>
                    <td>{item.quantity}</td>
                    <td style={{ fontWeight: 500 }}>{parseFloat(item.total).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  type="button"
                  className="btn btn-secondary" 
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                  onClick={() => handlePrintSale(selectedSale.id, 'cashier')}
                >
                  <Printer size={16} style={{ color: '#2ecc71' }} /> Kassir cheki (Narx bilan)
                </button>
                <button 
                  type="button"
                  className="btn btn-secondary" 
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                  onClick={() => handlePrintSale(selectedSale.id, 'worker')}
                >
                  <Wrench size={16} style={{ color: '#3498db' }} /> Ishchi cheki (Narxsiz)
                </button>
              </div>
              <button className="btn btn-secondary" onClick={() => setSelectedSale(null)}>Yopish</button>
            </div>
          </div>
        </div>
      )}



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
    </div>
  );
}
