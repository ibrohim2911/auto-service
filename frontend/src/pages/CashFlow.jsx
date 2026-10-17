import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wallet, Plus, Trash2, ArrowUpRight, ArrowDownRight, X, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store';
import api from '../api';
import SearchableSelect from '../components/SearchableSelect';
import Pagination from '../components/Pagination';
import { useDebounce } from '../hooks/useDebounce';

const CATEGORY_MAP = {
  SALE: "Sotuv to'lovi",
  DEBT: "Qarz yig'ish / to'lov",
  SUPPLIER: "Ta'minotchi to'lovi",
  BILL: "Hisob to'lovi",
  TRANSFER: "Hisob o'tkazmasi",
  OTHER: "Boshqa"
};

const getCategoryOptions = (type) => {
  if (type === 'EXPENSE') {
    return [
      { value: 'SUPPLIER', label: "Ta'minotchi to'lovi" },
      { value: 'BILL', label: "Hisob / Harajat to'lovi" },
      { value: 'DEBT', label: "Qarz to'lash" },
      { value: 'TRANSFER', label: "Hisob o'tkazmasi (Transfer)" },
      { value: 'OTHER', label: "Boshqa chiqim" },
      { value: 'SALE', label: "Sotuv to'lovi / Qaytarish" },
    ];
  }
  return [
    { value: 'SALE', label: "Sotuv to'lovi" },
    { value: 'DEBT', label: "Qarz yig'ish / to'lov" },
    { value: 'TRANSFER', label: "Hisob o'tkazmasi (Transfer)" },
    { value: 'OTHER', label: "Boshqa kirim" },
    { value: 'SUPPLIER', label: "Ta'minotchi qaytargan pul" },
    { value: 'BILL', label: "Hisob to'lovi" },
  ];
};

function CashFlow() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebounce(searchQuery, 300);

  const [filters, setFilters] = useState({
    transaction_type: '',
    category: '',
    payment_method: '',
    client: '',
    user: '',
    start_date: '',
    end_date: '',
    min_amount: '',
    max_amount: '',
    ordering: '-datetime'
  });

  const [showAdvanced, setShowAdvanced] = useState(false);

  const [formData, setFormData] = useState({
    transaction_type: 'INCOME',
    category: 'SALE',
    payment_method: '',
    amount: '',
    client: '',
    description: ''
  });
  const [formErrors, setFormErrors] = useState({});

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters]);

  const { data: cashFlowResponse, isLoading } = useQuery({ 
    queryKey: ['cashflow', debouncedSearch, filters, page, pageSize], 
    queryFn: async () => {
      let url = `cash-flow/?page=${page}&page_size=${pageSize}&`;
      if (debouncedSearch) url += `search=${encodeURIComponent(debouncedSearch)}&`;
      if (filters.transaction_type) url += `transaction_type=${filters.transaction_type}&`;
      if (filters.category) url += `category=${filters.category}&`;
      if (filters.payment_method) url += `payment_method=${filters.payment_method}&`;
      if (filters.client) url += `client=${filters.client}&`;
      if (filters.user) url += `user=${filters.user}&`;
      if (filters.start_date) url += `start_date=${filters.start_date}&`;
      if (filters.end_date) url += `end_date=${filters.end_date}T23:59:59&`;
      if (filters.min_amount) url += `min_amount=${filters.min_amount}&`;
      if (filters.max_amount) url += `max_amount=${filters.max_amount}&`;
      if (filters.ordering) url += `ordering=${filters.ordering}&`;

      const { data } = await api.get(url);
      return data;
    }
  });

  const flows = cashFlowResponse?.results || [];

  const { data: users } = useQuery({ 
    queryKey: ['users'], 
    queryFn: async () => (await api.get('users/?page_size=100')).data.results 
  });
  
  const { data: clients } = useQuery({ 
    queryKey: ['clients'], 
    queryFn: async () => (await api.get('clients/?page_size=500')).data.results 
  });

  const { data: paymentMethods } = useQuery({ 
    queryKey: ['payment-methods'], 
    queryFn: async () => (await api.get('payment-methods/?page_size=100')).data.results 
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => await api.delete(`cash-flow/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });
      toast.success('Amaliyot o\'chirildi');
    },
    onError: () => toast.error('O\'chirishda xatolik')
  });

  const createMutation = useMutation({
    mutationFn: async (payload) => await api.post(`cash-flow/`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });
      toast.success('Amaliyot qayd etildi!');
      closeModal();
    },
    onError: (err) => {
      toast.error('Saqlashda xatolik.');
      if (err.response?.data) setFormErrors(err.response.data);
    }
  });

  const openModal = () => {
    setFormData({
      transaction_type: 'INCOME',
      category: 'SALE',
      payment_method: paymentMethods?.[0]?.id || '',
      amount: '',
      client: '',
      description: ''
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData({
      transaction_type: 'INCOME',
      category: 'SALE',
      payment_method: paymentMethods?.[0]?.id || '',
      amount: '',
      client: '',
      description: ''
    });
    setFormErrors({});
  };

  const handleTypeChange = (newType) => {
    setFormData(prev => {
      let newCat = prev.category;
      if (newType === 'INCOME' && (prev.category === 'BILL' || prev.category === 'SUPPLIER')) {
        newCat = 'SALE';
      } else if (newType === 'EXPENSE' && prev.category === 'SALE') {
        newCat = 'SUPPLIER';
      }
      return {
        ...prev,
        transaction_type: newType,
        category: newCat
      };
    });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors(prev => ({ ...prev, [name]: null }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errors = {};
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      errors.amount = "To'g'ri miqdor kiritilishi shart";
    }
    if (!formData.category) {
      errors.category = "Toifani tanlang";
    }
    if (!formData.payment_method) {
      errors.payment_method = "To'lov usulini tanlang";
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    createMutation.mutate({
      ...formData,
      amount: parseFloat(formData.amount),
      client: formData.client || null,
      user: user?.id
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

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-color)', color: 'var(--text-main)', fontSize: '1rem', marginTop: '6px' };
  
  return (
    <div style={{ padding: '16px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', color: 'var(--primary)', marginBottom: '4px' }}>Pul oqimi</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Barcha kirim va chiqim to'lovlarini kuzating.</p>
        </div>
        <button className="btn btn-primary" onClick={openModal} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={18} /> Amaliyot qo'shish
        </button>
      </div>

      {/* FILTER BAR CARD */}
      <div className="card" style={{ marginBottom: '16px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: showAdvanced ? '12px' : '0' }}>
          <div className="input-group" style={{ flex: '2 1 250px', marginBottom: 0 }}>
            <label>Izoh / Mijozni qidirish</label>
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

          <div className="input-group" style={{ flex: '1 1 160px', marginBottom: 0 }}>
            <label>Turi</label>
            <select
              value={filters.transaction_type}
              onChange={e => setFilters({...filters, transaction_type: e.target.value})}
              className="input-field"
              
            >
              <option value="">Barcha turlar</option>
              <option value="INCOME">Kirim</option>
              <option value="EXPENSE">Chiqim</option>
            </select>
          </div>

          <div className="input-group" style={{ flex: '1 1 160px', marginBottom: 0 }}>
            <label>Toifa</label>
            <select
              value={filters.category}
              onChange={e => setFilters({...filters, category: e.target.value})}
              className="input-field"
              
            >
              <option value="">Barcha toifalar</option>
              <option value="SALE">Sotuv to'lovi</option>
              <option value="DEBT">Qarz yig'ish/To'lov</option>
              <option value="SUPPLIER">Ta'minotchi to'lovi</option>
              <option value="BILL">Hisob to'lovi</option>
              <option value="TRANSFER">Hisob o'tkazmasi</option>
              <option value="OTHER">Boshqa</option>
            </select>
          </div>

          <div className="input-group" style={{ flex: '1 1 160px', marginBottom: 0 }}>
            <label>To'lov turi</label>
            <SearchableSelect
              value={filters.payment_method}
              onChange={v => setFilters({...filters, payment_method: v})}
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
              onClick={() => {
                setSearchQuery('');
                setFilters({
                  transaction_type: '', category: '', payment_method: '', client: '', user: '',
                  start_date: '', end_date: '', min_amount: '', max_amount: '', ordering: '-datetime'
                });
              }}
              title="Filtrlarni tozalash"
              style={{ whiteSpace: 'nowrap', height: '42px', opacity: 0.8 }}
            >
              Tozalash
            </button>
          </div>
        </div>

        {showAdvanced && (
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', paddingTop: '16px', borderTop: '1px solid var(--border)', marginTop: '16px' }}>
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
              <label>Bajaruvchi</label>
              <SearchableSelect
                value={filters.user}
                onChange={v => setFilters({...filters, user: v})}
                options={users?.map(u => ({ value: u.id, label: u.first_name || u.username })) || []}
                placeholder="Barcha foydalanuvchilar"
              />
            </div>

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

            <div className="input-group" style={{ flex: '1 1 140px', marginBottom: 0 }}>
              <label>Eng kam miqdor</label>
              <input 
                type="number" 
                placeholder="Min 0"
                value={filters.min_amount}
                onChange={e => setFilters({...filters, min_amount: e.target.value})}
                className="input-field"
                
              />
            </div>

            <div className="input-group" style={{ flex: '1 1 140px', marginBottom: 0 }}>
              <label>Eng ko'p miqdor</label>
              <input 
                type="number" 
                placeholder="Max..."
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
                <option value="-amount">Miqdor (Yuqoridan pastga)</option>
                <option value="amount">Miqdor (Pastdan yuqoriga)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? <div style={{ padding: '48px', textAlign: 'center' }}>Amaliyotlar yuklanmoqda...</div> : 
        (!flows || flows.length === 0) ? <div style={{ padding: '48px', textAlign: 'center' }}>Amaliyotlar topilmadi</div> : (
          <>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: 'var(--surface-hover)' }}>
              <tr>
                <th onClick={() => handleSort('transaction_type')} style={{ cursor: 'pointer' }}>Turi{getSortIcon('transaction_type')}</th>
                <th onClick={() => handleSort('category')} style={{ cursor: 'pointer' }}>Toifa{getSortIcon('category')}</th>
                <th onClick={() => handleSort('amount')} style={{ cursor: 'pointer' }}>Miqdori{getSortIcon('amount')}</th>
                <th onClick={() => handleSort('payment_method__name')} style={{ cursor: 'pointer' }}>Usuli{getSortIcon('payment_method__name')}</th>
                <th onClick={() => handleSort('client__name')} style={{ cursor: 'pointer' }}>Mijoz / Izoh{getSortIcon('client__name')}</th>
                <th onClick={() => handleSort('datetime')} style={{ cursor: 'pointer' }}>Sana{getSortIcon('datetime')}</th>
                <th style={{ textAlign: 'right' }}>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {flows.map(f => (
                <tr key={f.id}>
                  <td>
                    {f.transaction_type === 'INCOME' ? 
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#2ecc71', fontWeight: 600 }}><ArrowDownRight size={16}/> Kirim</span> : 
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#e74c3c', fontWeight: 600 }}><ArrowUpRight size={16}/> Chiqim</span>
                    }
                  </td>
                  <td>
                    <span style={{ 
                      display: 'inline-block',
                      padding: '3px 8px', 
                      borderRadius: '6px', 
                      fontSize: '0.8rem', 
                      backgroundColor: 'var(--surface-hover)',
                      border: '1px solid var(--border)',
                      fontWeight: 500,
                      color: 'var(--text-main)'
                    }}>
                      {CATEGORY_MAP[f.category] || f.category_display || f.category || 'Boshqa'}
                    </span>
                  </td>
                  <td style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{parseFloat(f.amount).toLocaleString()} UZS</td>
                  <td>{paymentMethods?.find(m => m.id === f.payment_method)?.name || f.payment_method_name || f.payment_method}</td>
                  <td>
                    {f.client ? <span style={{ fontWeight: 500 }}>{clients?.find(c => c.id === f.client)?.name || f.client_name || f.client}</span> : null}
                    {f.description && <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>{f.description}</div>}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{new Date(f.datetime).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-icon" style={{ color: 'var(--danger)', marginLeft: 'auto' }} onClick={() => { if(window.confirm('Ushbu amaliyot o\'chirilsinmi?')) deleteMutation.mutate(f.id); }}><Trash2 size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            currentPage={cashFlowResponse?.current_page || page}
            totalPages={cashFlowResponse?.total_pages || 1}
            totalItems={cashFlowResponse?.count || 0}
            pageSize={pageSize}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(sz) => { setPageSize(sz); setPage(1); }}
          />
          </>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="flex-between mb-4">
              <h2>Amaliyot qo'shish</h2>
              <button className="btn-icon" onClick={closeModal}><X size={24} /></button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label>Turi</label>
                  <SearchableSelect
                    value={formData.transaction_type}
                    onChange={handleTypeChange}
                    options={[
                      { value: 'INCOME', label: 'Kirim' },
                      { value: 'EXPENSE', label: 'Chiqim' }
                    ]}
                  />
                </div>
                <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label>Toifa (Kategoriya)</label>
                  <SearchableSelect
                    value={formData.category}
                    onChange={v => {
                      setFormData(prev => ({ ...prev, category: v }));
                      if (formErrors.category) setFormErrors(prev => ({ ...prev, category: null }));
                    }}
                    options={getCategoryOptions(formData.transaction_type)}
                    placeholder="Toifani tanlang..."
                  />
                  {formErrors.category && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{formErrors.category}</span>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label>Miqdor (SO'M)</label>
                  <input 
                    type="number" 
                    name="amount" 
                    value={formData.amount || ''} 
                    onChange={handleInputChange} 
                    className="input-field" 
                    placeholder="0.00" 
                    min="0"
                    step="any"
                  />
                  {formErrors.amount && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{formErrors.amount}</span>}
                </div>
                <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label>To'lov usuli</label>
                  <SearchableSelect
                    value={formData.payment_method}
                    onChange={v => {
                      setFormData(prev => ({ ...prev, payment_method: v }));
                      if (formErrors.payment_method) setFormErrors(prev => ({ ...prev, payment_method: null }));
                    }}
                    options={paymentMethods?.map(p => ({ value: p.id, label: p.name })) || []}
                    placeholder="Usulni tanlang..."
                  />
                  {formErrors.payment_method && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{formErrors.payment_method}</span>}
                </div>
              </div>

              <div className="input-group" style={{ marginBottom: '16px' }}>
                <label>Mijoz (Ixtiyoriy)</label>
                <SearchableSelect
                  value={formData.client}
                  onChange={v => setFormData(prev => ({ ...prev, client: v }))}
                  options={clients?.map(c => ({ value: c.id, label: c.name })) || []}
                  placeholder="Yo'q"
                />
              </div>

              <div className="input-group" style={{ marginBottom: '24px' }}>
                <label>Izoh</label>
                <input 
                  type="text" 
                  name="description" 
                  value={formData.description || ''} 
                  onChange={handleInputChange} 
                  className="input-field" 
                  placeholder="Nima uchun edi?" 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={closeModal} className="btn btn-secondary">Bekor qilish</button>
                <button type="submit" disabled={createMutation.isPending} className="btn btn-primary" style={{ opacity: createMutation.isPending ? 0.7 : 1 }}>
                  {createMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CashFlow;
