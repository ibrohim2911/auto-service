import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Search, Plus, FileEdit, Trash2, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import SearchableSelect from '../components/SearchableSelect';
import Pagination from '../components/Pagination';
import { useDebounce } from '../hooks/useDebounce';

export default function Debts() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebounce(searchQuery, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  
  const [filters, setFilters] = useState({
    debt_type: '',
    status: '',
    client: '',
    start_date: '',
    end_date: '',
    due_date_start: '',
    due_date_end: '',
    ordering: '-created_at'
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters]);

  const [showAdvanced, setShowAdvanced] = useState(false);

  const getDueDateStatus = (dueDate, remaining) => {
    if (remaining <= 0) {
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

  const defaultDueDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState(null);
  
  const initialForm = { client: '', person_name: '', debt_type: 'GIVEN', amount: '', due_date: defaultDueDate, description: '' };
  const [formData, setFormData] = useState(initialForm);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');

  const { data: debtsData, isLoading } = useQuery({
    queryKey: ['debts', debouncedSearch, filters, page, pageSize],
    queryFn: async () => {
      let url = `debts/?page=${page}&page_size=${pageSize}&`;
      if (debouncedSearch) url += `search=${encodeURIComponent(debouncedSearch)}&`;
      if (filters.debt_type) url += `debt_type=${filters.debt_type}&`;
      if (filters.status) url += `status=${filters.status}&`;
      if (filters.client) url += `client=${filters.client}&`;
      if (filters.start_date) url += `start_date=${filters.start_date}&`;
      if (filters.end_date) url += `end_date=${filters.end_date}T23:59:59&`;
      if (filters.due_date_start) url += `due_date_start=${filters.due_date_start}&`;
      if (filters.due_date_end) url += `due_date_end=${filters.due_date_end}&`;
      if (filters.ordering) url += `ordering=${filters.ordering}&`;
      
      const { data } = await api.get(url);
      return data;
    }
  });

  const debts = debtsData?.results || (Array.isArray(debtsData) ? debtsData : []);

  const { data: clients } = useQuery({ 
    queryKey: ['clients-options'], 
    queryFn: async () => {
      const res = await api.get('clients/?page_size=200');
      return res.data?.results || (Array.isArray(res.data) ? res.data : []);
    }
  });
  const { data: paymentMethods } = useQuery({ 
    queryKey: ['payment-methods-options'], 
    queryFn: async () => {
      const res = await api.get('payment-methods/?page_size=200');
      return res.data?.results || (Array.isArray(res.data) ? res.data : []);
    }
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('debts/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      toast.success('Qarz yozuvi yaratildi');
      setIsModalOpen(false);
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data) => api.patch(`debts/${editingDebt.id}/`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      toast.success('Qarz yozuvi yangilandi');
      setIsModalOpen(false);
      setEditingDebt(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`debts/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      toast.success('Qarz yozuvi o\'chirildi');
    }
  });

  const handleSave = (e) => {
    e.preventDefault();
    const dataToSave = {
      ...formData,
      due_date: formData.due_date || defaultDueDate
    };
    if (editingDebt) {
      updateMutation.mutate(dataToSave);
    } else {
      createMutation.mutate(dataToSave);
    }
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

  const handlePayDebt = async (e) => {
    e.preventDefault();
    if (!paymentAmount || !paymentMethodId) return toast.error("Barcha maydonlarni to'ldiring");
    const amt = parseFloat(paymentAmount);
    
    // Total debt left
    const debtLeft = parseFloat(editingDebt.amount) - parseFloat(editingDebt.paid_amount);
    if (amt > debtLeft) return toast.error("To'lov qolgan qarzdan oshib ketdi!");

    try {
      const newPaid = parseFloat(editingDebt.paid_amount) + amt;
      const newStatus = newPaid >= parseFloat(editingDebt.amount) ? 'PAID' : 'PARTIAL';
      
      // Update Debt record
      await api.patch(`debts/${editingDebt.id}/`, {
        paid_amount: newPaid,
        status: newStatus
      });

      // Insert CashFlow record
      // If we gave debt (GIVEN), they pay us -> INCOME. If we took debt (TAKEN), we pay them -> EXPENSE.
      const transType = editingDebt.debt_type === 'GIVEN' ? 'INCOME' : 'EXPENSE';
      
      await api.post('cash-flow/', {
        transaction_type: transType,
        category: 'DEBT',
        amount: amt,
        payment_method: paymentMethodId,
        client: editingDebt.client || null,
        description: `Payment for external debt #${editingDebt.id}`
      });

      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });
      toast.success('To\'lov muvaffaqiyatli saqlandi');
      setIsPaymentModalOpen(false);
      setEditingDebt(null);
    } catch (e) {
      toast.error("To'lovni saqlashda xatolik");
    }
  };

  const openEdit = (debt) => {
    setEditingDebt(debt);
    setFormData({
      client: debt.client || '',
      person_name: debt.person_name || '',
      debt_type: debt.debt_type,
      amount: debt.amount,
      due_date: debt.due_date || '',
      description: debt.description || ''
    });
    setIsModalOpen(true);
  };

  const openPayment = (debt) => {
    setEditingDebt(debt);
    setPaymentAmount('');
    setPaymentMethodId('');
    setIsPaymentModalOpen(true);
  };

  return (
    <div style={{ padding: '16px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', color: 'var(--primary)', marginBottom: '4px' }}>Tashqi qarzlar</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Qarzlar va moliyaviy majburiyatlarni boshqarish.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setFormData(initialForm); setEditingDebt(null); setIsModalOpen(true); }}>
          <Plus size={16} /> Yangi qarz
        </button>
      </div>

      {/* FILTER BAR CARD */}
      <div className="card" style={{ marginBottom: '16px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: showAdvanced ? '12px' : '0' }}>
          <div className="input-group" style={{ flex: '2 1 250px', marginBottom: 0 }}>
            <label>Shaxs/Mijozni qidirish</label>
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
            <label>Qarz turi</label>
            <SearchableSelect
              value={filters.debt_type}
              onChange={v => setFilters({...filters, debt_type: v})}
              options={[
                { value: 'GIVEN', label: 'Berilgan qarz' },
                { value: 'TAKEN', label: 'Olingan qarz' }
              ]}
              placeholder="Barcha turlar"
            />
          </div>

          <div className="input-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
            <label>Holat</label>
            <SearchableSelect
              value={filters.status}
              onChange={v => setFilters({...filters, status: v})}
              options={[
                { value: 'UNPAID', label: 'To\'lanmagan' },
                { value: 'PARTIAL', label: 'Qisman to\'langan' },
                { value: 'PAID', label: 'To\'langan' }
              ]}
              placeholder="Barcha holatlar"
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
                  debt_type: '', status: '', client: '', start_date: '', end_date: '',
                  due_date_start: '', due_date_end: '', ordering: '-created_at'
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
            <div className="input-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
              <label>Yaratilgan sana (dan)</label>
              <input 
                type="date" 
                value={filters.start_date}
                onChange={e => setFilters({...filters, start_date: e.target.value})}
                className="input-field" 
                
              />
            </div>

            <div className="input-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
              <label>Yaratilgan sana (gacha)</label>
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

            <div className="input-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
              <label>Saralash</label>
              <select 
                value={filters.ordering} 
                onChange={e => setFilters({...filters, ordering: e.target.value})}
                className="input-field"
                
              >
                <option value="-created_at">Yaratilgan sana (Yangi)</option>
                <option value="created_at">Yaratilgan sana (Eski)</option>
                <option value="-amount">Miqdor (Yuqoridan pastga)</option>
                <option value="amount">Miqdor (Pastdan yuqoriga)</option>
                <option value="due_date">Muddat (Yaqin)</option>
                <option value="-due_date">Muddat (Uzoq)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>Qarzlar yuklanmoqda...</div>
        ) : (!debts || debts.length === 0) ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <FileText size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <h3>Qarzlar topilmadi</h3>
            <p>Ushbu mezonlarga mos keladigan qarzingiz yo'q.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: 'var(--surface-hover)' }}>
              <tr>
                <th onClick={() => handleSort('person_name')} style={{ cursor: 'pointer' }}>Shaxs / Kompaniya{getSortIcon('person_name')}</th>
                <th onClick={() => handleSort('debt_type')} style={{ cursor: 'pointer' }}>Turi{getSortIcon('debt_type')}</th>
                <th onClick={() => handleSort('amount')} style={{ cursor: 'pointer' }}>Miqdor{getSortIcon('amount')}</th>
                <th onClick={() => handleSort('paid_amount')} style={{ cursor: 'pointer' }}>To'landi{getSortIcon('paid_amount')}</th>
                <th>Qoldiq</th>
                <th onClick={() => handleSort('due_date')} style={{ cursor: 'pointer' }}>Muddat{getSortIcon('due_date')}</th>
                <th onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>Holat{getSortIcon('status')}</th>
                <th style={{ textAlign: 'right' }}>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {debts.map(debt => {
                const remaining = parseFloat(debt.amount) - parseFloat(debt.paid_amount);
                return (
                  <tr key={debt.id}>
                    <td style={{ fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span>{debt.client_name ? debt.client_name : debt.person_name}</span>
                        {debt.sale_id && (
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(52, 152, 219, 0.15)',
                            color: '#3498db'
                          }}>
                            Sotuv #{debt.sale_id}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>{debt.description}</div>
                    </td>
                    <td>
                      {debt.debt_type === 'GIVEN' ? (
                        <span style={{ color: '#2ecc71', fontWeight: 500 }}>↑ Given</span>
                      ) : (
                        <span style={{ color: '#e74c3c', fontWeight: 500 }}>↓ Taken</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 'bold' }}>{parseFloat(debt.amount).toLocaleString()}</td>
                    <td style={{ color: '#3498db' }}>{parseFloat(debt.paid_amount).toLocaleString()}</td>
                    <td style={{ color: remaining > 0 ? '#e74c3c' : 'var(--text-muted)', fontWeight: 500 }}>
                      {remaining.toLocaleString()}
                    </td>
                    <td>
                      <div>{debt.due_date || '-'}</div>
                      {debt.due_date && remaining > 0 && (
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: getDueDateStatus(debt.due_date, remaining).bg,
                          color: getDueDateStatus(debt.due_date, remaining).color,
                          marginTop: '2px'
                        }}>
                          {getDueDateStatus(debt.due_date, remaining).label}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${debt.status === 'PAID' ? 'badge-primary' : debt.status === 'PARTIAL' ? 'badge-warning' : 'badge-danger'}`} style={{ backgroundColor: debt.status === 'PAID' ? '#2ecc71' : debt.status === 'PARTIAL' ? '#f39c12' : '#e74c3c', color: 'white' }}>
                        {debt.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        {debt.status !== 'PAID' && (
                          <button className="btn" style={{ fontSize: '0.8rem', padding: '4px 12px', background: 'var(--primary)', color: 'white' }} onClick={() => openPayment(debt)}>
                            To'lov qilish
                          </button>
                        )}
                        <button className="btn-icon" onClick={() => openEdit(debt)}><FileEdit size={16} /></button>
                        <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => { if(window.confirm('Ishonchingiz komilmi?')) deleteMutation.mutate(debt.id); }}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Pagination
        currentPage={debtsData?.current_page || page}
        totalPages={debtsData?.total_pages || 1}
        totalCount={debtsData?.count || 0}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
      />

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <h2 style={{ marginBottom: '24px' }}>{editingDebt ? 'Qarzni tahrirlash' : 'Yangi qarz'}</h2>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label>Turi</label>
                  <select className="input-field" value={formData.debt_type} onChange={e => setFormData({...formData, debt_type: e.target.value})}>
                    <option value="GIVEN">Berilgan qarz</option>
                    <option value="TAKEN">Olingan qarz</option>
                  </select>
                </div>
                <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label>Miqdor (SO'M)</label>
                  <input type="number" required className="input-field" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} />
                </div>
              </div>

              <div className="input-group">
                <label>Ro'yxatdan o'tgan mijoz (Ixtiyoriy)</label>
                <SearchableSelect
                  value={formData.client}
                  onChange={v => setFormData({...formData, client: v})}
                  options={clients?.map(c => ({ value: c.id, label: c.name })) || []}
                  placeholder="Mijozni tanlang..."
                />
              </div>

              {!formData.client && (
                <div className="input-group">
                  <label>Shaxs / Kompaniya nomi (Agar mijoz tanlanmagan bo'lsa)</label>
                  <input type="text" className="input-field" value={formData.person_name} onChange={e => setFormData({...formData, person_name: e.target.value})} placeholder="M-n. Ta'minotchi XYZ, Eson To'rayev" />
                </div>
              )}

              <div className="input-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ margin: 0 }}>Muddat (Qaytarish sanasi) <span style={{ color: 'var(--danger)' }}>*</span></label>
                </div>
                <input 
                  type="date" 
                  required 
                  className="input-field" 
                  value={formData.due_date || defaultDueDate} 
                  onChange={e => setFormData({...formData, due_date: e.target.value})} 
                />
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginTop: '6px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '4px' }}>Tezkor:</span>
                  {[
                    { days: 3, label: '+3 kun' },
                    { days: 7, label: '+7 kun' },
                    { days: 15, label: '+15 kun' },
                    { days: 30, label: '+30 kun' },
                    { days: 60, label: '+2 oy' }
                  ].map(preset => {
                    const presetDate = new Date(Date.now() + preset.days * 86400000).toISOString().split('T')[0];
                    const isSelected = formData.due_date === presetDate;
                    return (
                      <button
                        key={preset.days}
                        type="button"
                        onClick={() => setFormData({ ...formData, due_date: presetDate })}
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                          backgroundColor: isSelected ? 'var(--primary)' : 'var(--surface)',
                          color: isSelected ? '#fff' : 'var(--text-main)'
                        }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="input-group">
                <label>Izohlar</label>
                <textarea className="input-field" rows="2" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsModalOpen(false)}>Bekor qilish</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Saqlash</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isPaymentModalOpen && editingDebt && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h2 style={{ marginBottom: '24px' }}>To'lov kiritish</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>
              {editingDebt.debt_type === 'GIVEN' ? 'Bizga bo\'lgan qarz uchun to\'lovni qabul qilish.' : 'Qarzni qaytarish.'}
            </p>
            <form onSubmit={handlePayDebt} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                <label>Miqdor (Maks: {(parseFloat(editingDebt.amount) - parseFloat(editingDebt.paid_amount)).toLocaleString()} SO'M)</label>
                <input 
                  type="number" 
                  required
                  className="input-field" 
                  value={paymentAmount} 
                  onChange={e => setPaymentAmount(e.target.value)} 
                  max={parseFloat(editingDebt.amount) - parseFloat(editingDebt.paid_amount)}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsPaymentModalOpen(false)}>Bekor qilish</button>
                <button type="submit" className="btn btn-success" style={{ flex: 1, background: '#2ecc71', color: 'white' }}>To'lovni tasdiqlash</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
