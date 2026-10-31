import React, { useState, useMemo } from 'react';
import { Search, ShoppingCart, User, LogOut, Plus, Minus, CreditCard, Banknote, Trash2, Home, PackageOpen, X, Car as CarIcon, UserPlus, Calendar, AlertCircle, Clock, AlertTriangle, Wrench, Edit3 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import useAuthStore from '../store';
import toast from 'react-hot-toast';
import { useReactToPrint } from 'react-to-print';
import api from '../api';
import Receipt from '../components/Receipt';
import SearchableSelect from '../components/SearchableSelect';
import { useDebounce } from '../hooks/useDebounce';

const fetchCategories = async () => {
  const { data } = await api.get('categories/?page_size=100');
  return [
    { id: 'all', name: 'Barchasi' },
    { id: 'top_10_days', name: "🔥 Ko'p sotilganlar (10 kun)" },
    ...data.results
  ];
};

const fetchProducts = async () => {
  const { data } = await api.get('products/?page_size=100');
  return data.results;
};

const CheckoutModal = ({ cart, total, services, setServices, onClose, onSuccess, user, editSale, activeShift, onOpenShift }) => {
  const queryClient = useQueryClient();
  const defaultDueDate = useMemo(() => new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0], []);
  
  const productsTotal = Math.round(total || 0);
  const servicesTotal = (services || []).reduce((sum, s) => sum + Math.round(parseFloat(s.amount) || 0), 0);
  const grandTotal = productsTotal + servicesTotal;

  const [formData, setFormData] = useState({ 
    client: editSale?.client || '', 
    car: editSale?.car || '', 
    user: editSale?.user || user?.id || '', 
    due_date: editSale?.due_date || defaultDueDate,
    payments: editSale ? [{ method: editSale.payment_type || '', amount: Math.round(parseFloat(editSale.paid_amount) || grandTotal) }] : [{ method: '', amount: grandTotal }] 
  });
  const [printCashier, setPrintCashier] = useState(true);
  const [printWorker, setPrintWorker] = useState(true);

  // Quick Add sub-modal states
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [quickClientData, setQuickClientData] = useState({
    name: '',
    phone_number: '',
    is_company: false,
    account_number: ''
  });
  const [quickClientLoading, setQuickClientLoading] = useState(false);

  const [showQuickCar, setShowQuickCar] = useState(false);
  const [quickCarData, setQuickCarData] = useState({
    plate_number: '',
    car_type: '',
    owner: ''
  });
  const [quickCarLoading, setQuickCarLoading] = useState(false);

  // Worker Client picker sub-modal states
  const [showWorkerPicker, setShowWorkerPicker] = useState(false);
  const [workerPickerLoading, setWorkerPickerLoading] = useState(false);
  const [workerSearchFilter, setWorkerSearchFilter] = useState('');

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: async () => (await api.get('users/?page_size=100')).data.results });
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: async () => (await api.get('clients/?page_size=500')).data.results });
  const { data: cars } = useQuery({ queryKey: ['cars'], queryFn: async () => (await api.get('cars/?page_size=500')).data.results });
  const { data: paymentMethods } = useQuery({ queryKey: ['payment-methods'], queryFn: async () => (await api.get('payment-methods/?page_size=100')).data.results });

  const clientOptions = useMemo(() => {
    if (!clients) return [];
    return clients.map(c => ({
      value: c.id,
      label: c.is_worker ? `🛠️ [Usta] ${c.name.replace(/^\[Usta\]\s*/i, '')}` : c.name
    }));
  }, [clients]);

  const handleSelectWorkerAsClient = async (workerId) => {
    if (!workerId) return;
    setWorkerPickerLoading(true);
    try {
      const res = await api.post('clients/get-or-create-for-worker/', { worker_id: workerId });
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
      setFormData(prev => ({ ...prev, client: res.data.id }));
      setShowWorkerPicker(false);
      toast.success(`${res.data.name} mijoz sifatida tanlandi!`);
    } catch (err) {
      toast.error("Ustani mijoz sifatida tanlashda xatolik yuz berdi");
    } finally {
      setWorkerPickerLoading(false);
    }
  };

  // Intelligent Car selection list:
  // Shows all cars (with or without owner), prioritizing selected client's cars.
  const carOptions = useMemo(() => {
    if (!cars) return [];
    const selectedClientId = formData.client ? parseInt(formData.client) : null;

    const sortedCars = [...cars].sort((a, b) => {
      if (selectedClientId) {
        const aBelongs = a.owner === selectedClientId;
        const bBelongs = b.owner === selectedClientId;
        if (aBelongs && !bBelongs) return -1;
        if (!aBelongs && bBelongs) return 1;
      }
      return (a.plate_number || '').localeCompare(b.plate_number || '');
    });

    return sortedCars.map(c => {
      const typeStr = c.car_type ? ` (${c.car_type})` : '';
      let tag = '';
      if (selectedClientId && c.owner === selectedClientId) {
        tag = ' ★';
      } else if (c.owner_name) {
        tag = ` - [${c.owner_name}]`;
      } else {
        tag = " - (Egasi yo'q)";
      }
      return {
        value: c.id,
        label: `${c.plate_number}${typeStr}${tag}`
      };
    });
  }, [cars, formData.client]);

  const handleClientSelect = (clientId) => {
    setFormData(prev => {
      // If currently selected car belongs to another client, unselect car
      const currentCar = cars?.find(c => c.id === prev.car);
      const carBelongsToOther = currentCar && currentCar.owner && currentCar.owner !== clientId;
      return {
        ...prev,
        client: clientId,
        car: carBelongsToOther ? '' : prev.car
      };
    });
  };

  const handleCarSelect = (carId) => {
    const selectedCar = cars?.find(c => c.id === carId);
    setFormData(prev => ({
      ...prev,
      car: carId,
      // If client not chosen yet, auto-select car owner if exists
      client: (!prev.client && selectedCar?.owner) ? selectedCar.owner : prev.client
    }));
  };

  const handleQuickClientSubmit = async (e) => {
    e.preventDefault();
    if (!quickClientData.name.trim()) {
      return toast.error("Mijoz ismini kiriting");
    }
    setQuickClientLoading(true);
    try {
      const payload = {
        name: quickClientData.name.trim(),
        phone_number: quickClientData.phone_number ? quickClientData.phone_number.trim() : '',
        is_company: !!quickClientData.is_company,
        account_number: quickClientData.account_number ? quickClientData.account_number.trim() : ''
      };
      const res = await api.post('clients/', payload);
      const newClient = res.data;
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
      setFormData(prev => ({ ...prev, client: newClient.id }));
      toast.success("Mijoz muvaffaqiyatli qo'shildi!");
      setShowQuickClient(false);
      setQuickClientData({ name: '', phone_number: '', is_company: false, account_number: '' });
    } catch (err) {
      const msg = err.response?.data?.name?.[0] || err.response?.data?.phone_number?.[0] || "Mijozni saqlashda xatolik";
      toast.error(msg);
    } finally {
      setQuickClientLoading(false);
    }
  };

  const handleQuickCarSubmit = async (e) => {
    e.preventDefault();
    if (!quickCarData.plate_number.trim()) {
      return toast.error("Mashina raqamini kiriting");
    }
    setQuickCarLoading(true);
    try {
      const payload = {
        plate_number: quickCarData.plate_number.trim().toUpperCase(),
        car_type: quickCarData.car_type ? quickCarData.car_type.trim() : '',
        owner: quickCarData.owner ? parseInt(quickCarData.owner) : null
      };
      const res = await api.post('cars/', payload);
      const newCar = res.data;
      await queryClient.invalidateQueries({ queryKey: ['cars'] });
      setFormData(prev => ({
        ...prev,
        car: newCar.id,
        // Auto-select owner if car has one and client wasn't selected yet
        client: (!prev.client && newCar.owner) ? newCar.owner : prev.client
      }));
      toast.success("Mashina muvaffaqiyatli qo'shildi!");
      setShowQuickCar(false);
      setQuickCarData({ plate_number: '', car_type: '', owner: '' });
    } catch (err) {
      const msg = err.response?.data?.plate_number?.[0] || "Mashinani saqlashda xatolik";
      toast.error(msg);
    } finally {
      setQuickCarLoading(false);
    }
  };

  const totalPaid = Math.round(formData.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0));
  const debt_amount = Math.max(0, grandTotal - totalPaid);

  const submit = async () => {
    if (cart.length === 0 && (!services || services.length === 0)) {
      return toast.error("Savatchada mahsulot yoki xizmat bo'lishi kerak!");
    }
    for (const s of services || []) {
      if (parseFloat(s.amount) > 0 && !s.worker) {
        return toast.error("Iltimos, har bir xizmat uchun ustani tanlang!");
      }
    }
    if (formData.payments.some(p => !p.method && Number(p.amount) > 0)) return toast.error("Barcha miqdorlar uchun to'lov usulini tanlang");
    if (debt_amount > 0 && !formData.due_date) {
      return toast.error("Iltimos, qarz qaytarish muddatini tanlang");
    }
    
    let print_type = 'none';
    if (printCashier && printWorker) print_type = 'both';
    else if (printCashier) print_type = 'cashier';
    else if (printWorker) print_type = 'worker';

    const validServices = (services || [])
      .filter(s => parseFloat(s.amount) > 0)
      .map(s => {
        const workerObj = users?.find(u => u.id === (s.worker?.id || s.worker));
        return {
          worker: s.worker?.id || s.worker || null,
          worker_name: workerObj?.first_name || workerObj?.username || s.worker_name || '',
          service_name: s.service_name || "Xizmat haqi",
          amount: Math.round(parseFloat(s.amount) || 0)
        };
      });

    const payload = {
      ...formData,
      car: formData.car || null,
      client: formData.client || null,
      due_date: debt_amount > 0 ? (formData.due_date || defaultDueDate) : null,
      total_amount: Math.round(grandTotal),
      debt_amount: Math.round(debt_amount),
      paid_amount: Math.round(totalPaid),
      print: print_type !== 'none',
      print_type: print_type,
      items: cart.map(item => {
        const q = parseFloat(item.qty) || 1;
        const p = parseFloat(item.selling_price) || 0;
        const lineTot = item.line_total !== undefined 
          ? Math.round(Number(item.line_total) || 0)
          : Math.round(p * q);
        return { product: item.id, quantity: q, price: p, total: lineTot };
      }),
      services: validServices
    };

    const promise = window.location.search.includes('edit=') 
      ? api.patch(`sales/${new URLSearchParams(window.location.search).get('edit')}/`, payload)
      : api.post('sales/', payload);

    toast.promise(promise, {
      loading: 'Jarayonda...',
      success: () => { 
        onSuccess(); 
        return window.location.search.includes('edit=') ? 'Sotuv yangilandi!' : 'Sotuv yakunlandi!'; 
      },
      error: 'Tranzaksiyani yakunlashda xatolik.'
    });
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div 
        className="modal-content modal-wide" 
        style={{ 
          maxWidth: '840px', 
          width: '95%', 
          maxHeight: '92vh', 
          overflowY: 'auto', 
          padding: '24px 28px',
          boxSizing: 'border-box'
        }}
      >
        {/* Modal Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '20px', 
          paddingBottom: '14px', 
          borderBottom: '1px solid var(--border)' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              backgroundColor: 'rgba(99, 102, 241, 0.12)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CreditCard size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, lineHeight: 1.2 }}>
                {window.location.search.includes('edit=') ? "Sotuvni tahrirlash" : "To'lovni rasmiylashtirish"}
              </h2>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Savatda {cart.length} xil mahsulot ({cart.reduce((sum, item) => sum + item.qty, 0)} dona)
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              padding: '6px 14px',
              borderRadius: '20px',
              backgroundColor: 'var(--surface-hover)',
              border: '1px solid var(--border)',
              fontSize: '1rem',
              fontWeight: 700,
              color: 'var(--primary)',
              letterSpacing: '0.3px'
            }}>
              {Math.round(grandTotal).toLocaleString()} SO'M
            </div>
            <button
              type="button"
              className="btn-icon"
              onClick={onClose}
              title="Yopish"
              style={{ width: '36px', height: '36px' }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {!activeShift && (
          <div style={{
            marginBottom: '18px',
            padding: '12px 16px',
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.88rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--warning)', fontWeight: 600 }}>
              <AlertTriangle size={20} />
              <span>Diqqat: Kassa smenasi ochilmagan. Savdoni smenaga biriktirish tavsiya etiladi.</span>
            </div>
            {onOpenShift && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenShift();
                }}
                className="btn btn-primary"
                style={{ height: '32px', padding: '0 12px', fontSize: '0.8rem' }}
              >
                <Plus size={14} /> Smena ochish
              </button>
            )}
          </div>
        )}

        {/* 2-Column Responsive Body */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', 
          gap: '24px', 
          alignItems: 'start',
          marginBottom: '20px'
        }}>
          {/* Left Column: People, Vehicle & Split Payments */}
          <div>
            <div className="input-group" style={{ marginBottom: '16px' }}>
              <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Ishchi (Kassir/Mas'ul)</label>
              <SearchableSelect
                value={formData.user}
                onChange={v => setFormData({...formData, user: v})}
                options={users?.map(u => ({ value: u.id, label: u.first_name || u.username })) || []}
                placeholder="Ishchini tanlang..."
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem' }}>Mijoz</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setShowWorkerPicker(true)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.08)',
                        border: '1px solid #8b5cf6',
                        borderRadius: '5px',
                        padding: '2px 7px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      title="Ustani mijoz sifatida tanlash (Nasiyaga tovar berish)"
                    >
                      <Wrench size={12} /> Usta
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQuickClient(true)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: 'var(--primary)',
                        backgroundColor: 'transparent',
                        border: '1px solid var(--primary)',
                        borderRadius: '5px',
                        padding: '2px 7px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      title="Yangi mijoz qo'shish"
                    >
                      <Plus size={12} /> Yangi
                    </button>
                  </div>
                </div>
                <SearchableSelect
                  value={formData.client}
                  onChange={handleClientSelect}
                  options={clientOptions}
                  placeholder="Yo'q (Oddiy mijoz)"
                />
              </div>

              <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem' }}>Mashina</label>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickCarData({ plate_number: '', car_type: '', owner: formData.client || '' });
                      setShowQuickCar(true);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: 'var(--primary)',
                      backgroundColor: 'transparent',
                      border: '1px solid var(--primary)',
                      borderRadius: '5px',
                      padding: '2px 7px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title="Yangi mashina qo'shish"
                  >
                    <Plus size={12} /> Yangi
                  </button>
                </div>
                <SearchableSelect
                  value={formData.car}
                  onChange={handleCarSelect}
                  options={carOptions}
                  placeholder="Mashinani tanlang..."
                />
              </div>
            </div>

            {/* Usta va Xizmat haqi Section */}
            <div style={{
              marginBottom: '18px',
              padding: '14px 16px',
              backgroundColor: 'var(--surface-hover)',
              border: '1px solid var(--border)',
              borderRadius: '14px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (services && services.length > 0) ? '12px' : '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Wrench size={17} color="var(--primary)" />
                  <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Usta va Xizmat haqi</span>
                  {services && services.length > 0 && (
                    <span style={{
                      fontSize: '0.72rem',
                      backgroundColor: 'rgba(99, 102, 241, 0.15)',
                      color: 'var(--primary)',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '10px'
                    }}>
                      {services.length} ta
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const updated = [...(services || []), { worker: '', service_name: 'Xizmat haqi', amount: '' }];
                    setServices(updated);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--primary)',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                    borderRadius: '7px',
                    padding: '3px 9px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Plus size={13} /> Xizmat qo'shish
                </button>
              </div>

              {(!services || services.length === 0) ? (
                <div style={{
                  padding: '10px 12px',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  border: '1px dashed var(--border)',
                  borderRadius: '8px',
                  backgroundColor: 'var(--surface)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>Usta xizmati biriktirilmagan</span>
                  <button
                    type="button"
                    onClick={() => {
                      setServices([{ worker: '', service_name: 'Xizmat haqi', amount: '' }]);
                    }}
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--primary)',
                      background: 'none',
                      border: 'none',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    + Biriktirish
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {services.map((svc, idx) => (
                    <div 
                      key={idx}
                      style={{
                        padding: '10px 12px',
                        backgroundColor: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{ flex: 1.3 }}>
                          <SearchableSelect
                            value={svc.worker?.id || svc.worker}
                            onChange={v => {
                              const updated = [...services];
                              const found = users?.find(u => u.id === v);
                              updated[idx].worker = v;
                              updated[idx].worker_name = found?.first_name || found?.username || '';
                              setServices(updated);
                            }}
                            options={(users?.filter(u => u.role === 'WORKER') || users || []).map(u => ({
                              value: u.id,
                              label: `${u.first_name || u.username}${u.job ? ` (${u.job})` : ''}`
                            }))}
                            placeholder="Ustani tanlang..."
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <input
                            type="number"
                            value={svc.amount}
                            onChange={e => {
                              const updated = [...services];
                              updated[idx].amount = e.target.value;
                              setServices(updated);
                            }}
                            className="input-field"
                            style={{ marginBottom: 0, fontWeight: 600, fontSize: '0.9rem' }}
                            placeholder="Xizmat narxi..."
                          />
                        </div>
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ color: 'var(--danger)', width: '30px', height: '30px' }}
                          onClick={() => {
                            setServices(services.filter((_, i) => i !== idx));
                          }}
                          title="O'chirish"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div>
                        <input
                          type="text"
                          value={svc.service_name}
                          onChange={e => {
                            const updated = [...services];
                            updated[idx].service_name = e.target.value;
                            setServices(updated);
                          }}
                          className="input-field"
                          style={{ marginBottom: 0, fontSize: '0.8rem', padding: '5px 8px' }}
                          placeholder="Xizmat tavsifi (Xodovoy, Motor, Moy almashtirish...)"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem' }}>To'lov usullari</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (formData.payments.length > 0) {
                        const newPayments = [...formData.payments];
                        newPayments[0].amount = grandTotal;
                        setFormData({ ...formData, payments: newPayments });
                      }
                    }}
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: '#10b981',
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      borderRadius: '5px',
                      padding: '2px 6px',
                      cursor: 'pointer'
                    }}
                  >
                    To'liq summa
                  </button>
                </div>
                <button 
                  type="button" 
                  onClick={() => {
                    setFormData({...formData, payments: [...formData.payments, { method: '', amount: 0 }]});
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--primary)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px 4px'
                  }}
                >
                  <Plus size={14} /> Usul qo'shish
                </button>
              </div>

              {formData.payments.map((payment, index) => (
                <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                  <div style={{ flex: 1.5 }}>
                    <SearchableSelect
                      value={payment.method}
                      onChange={v => {
                        const newPayments = [...formData.payments];
                        newPayments[index].method = v;
                        setFormData({...formData, payments: newPayments});
                      }}
                      options={paymentMethods?.map(p => ({ value: p.id, label: p.name })) || []}
                      placeholder="Usulni tanlang..."
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <input 
                      type="number" 
                      value={payment.amount} 
                      onChange={e => {
                        const newPayments = [...formData.payments];
                        newPayments[index].amount = e.target.value;
                        setFormData({...formData, payments: newPayments});
                      }} 
                      className="input-field" 
                      style={{ marginBottom: 0 }}
                      placeholder="Miqdor..."
                    />
                  </div>
                  {formData.payments.length > 1 && (
                    <button 
                      type="button"
                      className="btn-icon" 
                      style={{ color: 'var(--danger)', width: '32px', height: '32px' }} 
                      onClick={() => {
                        setFormData({...formData, payments: formData.payments.filter((_, i) => i !== index)});
                      }}
                      title="O'chirish"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Financial Summary, Debt Expire Date & Printing */}
          <div>
            {/* Financial Summary Card */}
            <div style={{ 
              backgroundColor: 'var(--surface-hover)', 
              padding: '16px 18px', 
              borderRadius: '14px',
              border: '1px solid var(--border)',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Mahsulotlar:</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{productsTotal.toLocaleString()} SO'M</span>
              </div>
              {servicesTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', color: 'var(--primary)' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Xizmat haqi:</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>+{servicesTotal.toLocaleString()} SO'M</span>
                </div>
              )}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '10px',
                paddingTop: '6px',
                paddingBottom: '8px',
                borderTop: '1px dashed var(--border)',
                borderBottom: '1px dashed var(--border)'
              }}>
                <span style={{ color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 700 }}>Jami to'lov miqdori:</span>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--primary)' }}>{grandTotal.toLocaleString()} SO'M</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>To'landi:</span>
                <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#2ecc71' }}>{totalPaid.toLocaleString()} SO'M</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Qarz miqdori:</span>
                <span style={{ fontSize: '1.15rem', fontWeight: 700, color: debt_amount > 0 ? '#e74c3c' : 'var(--text-muted)' }}>
                  {Math.max(0, debt_amount).toLocaleString()} SO'M
                </span>
              </div>
            </div>

            {/* Debt Expire Date Card (if debt exists) */}
            {debt_amount > 0 && (
              <div style={{
                marginBottom: '16px',
                padding: '14px 16px',
                backgroundColor: 'rgba(231, 76, 60, 0.06)',
                border: '1px solid rgba(231, 76, 60, 0.3)',
                borderRadius: '14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 600,
                    fontSize: '0.88rem',
                    color: '#e74c3c',
                    margin: 0
                  }}>
                    <Calendar size={16} />
                    Qarzni qaytarish muddati (Muddat) <span style={{ color: '#e74c3c' }}>*</span>
                  </label>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(231, 76, 60, 0.15)',
                    color: '#e74c3c'
                  }}>
                    Majburiy
                  </span>
                </div>

                <div style={{ marginBottom: '8px' }}>
                  <input
                    type="date"
                    required
                    value={formData.due_date || defaultDueDate}
                    onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                    className="input-field"
                    style={{
                      width: '100%',
                      fontSize: '0.92rem',
                      fontWeight: 600,
                      borderColor: 'rgba(231, 76, 60, 0.4)',
                      marginBottom: 0
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: '2px' }}>Tezkor:</span>
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
                          padding: '3px 8px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          border: isSelected ? '1px solid #e74c3c' : '1px solid var(--border)',
                          backgroundColor: isSelected ? '#e74c3c' : 'var(--surface)',
                          color: isSelected ? '#fff' : 'var(--text-main)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Direct Printing Options */}
            <div style={{ 
              padding: '12px 16px', 
              backgroundColor: 'var(--surface-hover)', 
              borderRadius: '12px',
              border: '1px solid var(--border)',
              marginBottom: '8px'
            }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                Printerga to'g'ridan-to'g'ri chop etish:
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input 
                    type="checkbox" 
                    checked={printCashier} 
                    onChange={e => setPrintCashier(e.target.checked)} 
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                  />
                  <span>Kassir cheki (Narx bilan)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input 
                    type="checkbox" 
                    checked={printWorker} 
                    onChange={e => setPrintWorker(e.target.checked)} 
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                  />
                  <span>Ishchi cheki (Ustaxona)</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'flex-end',
          gap: '12px', 
          paddingTop: '16px', 
          borderTop: '1px solid var(--border)' 
        }}>
          <button 
            type="button"
            className="btn btn-secondary" 
            onClick={onClose} 
            style={{ minWidth: '120px' }}
          >
            Bekor qilish
          </button>
          <button 
            type="button"
            className="btn btn-primary" 
            onClick={submit} 
            style={{ minWidth: '180px', fontWeight: 600 }}
          >
            Sotuvni yakunlash
          </button>
        </div>

        {/* Quick Add Client Sub-modal */}
        {showQuickClient && (
          <div 
            className="modal-overlay" 
            style={{ zIndex: 1200, backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowQuickClient(false); }}
          >
            <div className="modal-content" style={{ maxWidth: '440px', width: '92%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <UserPlus size={20} color="var(--primary)" /> Tezkor mijoz qo'shish
                </h3>
                <button 
                  type="button" 
                  className="btn-icon" 
                  onClick={() => setShowQuickClient(false)}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleQuickClientSubmit}>
                <div className="input-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-main)', marginBottom: '8px' }}>
                    <input 
                      type="checkbox" 
                      checked={quickClientData.is_company} 
                      onChange={e => setQuickClientData({ ...quickClientData, is_company: e.target.checked })} 
                      style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }} 
                    />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Bu Tashkilotmi?</span>
                  </label>
                </div>

                <div className="input-group">
                  <label>{quickClientData.is_company ? 'Tashkilot nomi' : "To'liq ism"} <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={quickClientData.name}
                    onChange={e => setQuickClientData({ ...quickClientData, name: e.target.value })}
                    className="input-field"
                    placeholder={quickClientData.is_company ? "Kompaniya nomi..." : "Masalan: Alisher Vohidov"}
                  />
                </div>

                <div className="input-group">
                  <label>Telefon raqami</label>
                  <input
                    type="text"
                    value={quickClientData.phone_number}
                    onChange={e => setQuickClientData({ ...quickClientData, phone_number: e.target.value })}
                    className="input-field"
                    placeholder="+998 90 123 45 67"
                  />
                </div>

                {quickClientData.is_company && (
                  <div className="input-group">
                    <label>Hisob raqami (Ixtiyoriy)</label>
                    <input
                      type="text"
                      value={quickClientData.account_number}
                      onChange={e => setQuickClientData({ ...quickClientData, account_number: e.target.value })}
                      className="input-field"
                      placeholder="20208000..."
                    />
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => setShowQuickClient(false)}
                    disabled={quickClientLoading}
                  >
                    Bekor qilish
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={quickClientLoading}
                  >
                    {quickClientLoading ? "Saqlanmoqda..." : "Saqlash va Tanlash"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Quick Add Car Sub-modal */}
        {showQuickCar && (
          <div 
            className="modal-overlay" 
            style={{ zIndex: 1200, backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowQuickCar(false); }}
          >
            <div className="modal-content" style={{ maxWidth: '440px', width: '92%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CarIcon size={20} color="var(--primary)" /> Tezkor mashina qo'shish
                </h3>
                <button 
                  type="button" 
                  className="btn-icon" 
                  onClick={() => setShowQuickCar(false)}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleQuickCarSubmit}>
                <div className="input-group">
                  <label>Davlat raqami <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={quickCarData.plate_number}
                    onChange={e => setQuickCarData({ ...quickCarData, plate_number: e.target.value.toUpperCase() })}
                    className="input-field"
                    placeholder="Masalan: 01 A 123 AA"
                    style={{ textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}
                  />
                </div>

                <div className="input-group">
                  <label>Avto turi (Ixtiyoriy)</label>
                  <input
                    type="text"
                    value={quickCarData.car_type}
                    onChange={e => setQuickCarData({ ...quickCarData, car_type: e.target.value })}
                    className="input-field"
                    placeholder="Masalan: Gentra, Cobalt, Nexia 3..."
                  />
                </div>

                <div className="input-group">
                  <label>Egasi (Mijoz) - Ixtiyoriy</label>
                  <SearchableSelect
                    value={quickCarData.owner}
                    onChange={v => setQuickCarData({ ...quickCarData, owner: v })}
                    options={clients?.map(c => ({ value: c.id, label: c.name })) || []}
                    placeholder="Mijoz tanlanmagan (Egasi yo'q)"
                  />
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    * Mashina egasisiz ham saqlanishi mumkin
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => setShowQuickCar(false)}
                    disabled={quickCarLoading}
                  >
                    Bekor qilish
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={quickCarLoading}
                  >
                    {quickCarLoading ? "Saqlanmoqda..." : "Saqlash va Tanlash"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Worker Client Picker Sub-modal */}
        {showWorkerPicker && (
          <div 
            className="modal-overlay" 
            style={{ zIndex: 1200, backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowWorkerPicker(false); }}
          >
            <div className="modal-content" style={{ maxWidth: '480px', width: '92%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: '#8b5cf6' }}>
                  <Wrench size={20} /> Ustani mijoz sifatida tanlash
                </h3>
                <button 
                  type="button" 
                  className="btn-icon" 
                  onClick={() => setShowWorkerPicker(false)}
                >
                  <X size={20} />
                </button>
              </div>

              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: '14px' }}>
                Usta o'z ehtiyoji yoki qarzdorligi uchun tovar/ehtiyot qism olayotganda uni mijoz qilib biriktiring. Bu qarz <strong>Ustalar hisobi (Tabel)</strong> da avtomatik kuzatiladi.
              </p>

              <div style={{ marginBottom: '14px' }}>
                <input
                  type="text"
                  placeholder="Ustaning ismi yoki telefonini qidiring..."
                  value={workerSearchFilter}
                  onChange={e => setWorkerSearchFilter(e.target.value)}
                  className="input-field"
                  style={{ marginBottom: 0, fontSize: '0.86rem' }}
                  autoFocus
                />
              </div>

              <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {users?.filter(u => u.role === 'WORKER' || u.job).filter(u => {
                  if (!workerSearchFilter) return true;
                  const q = workerSearchFilter.toLowerCase();
                  const name = (u.first_name || u.username || '').toLowerCase();
                  const phone = (u.phone_number || '').toLowerCase();
                  const job = (u.job || '').toLowerCase();
                  return name.includes(q) || phone.includes(q) || job.includes(q);
                }).map(w => (
                  <div
                    key={w.id}
                    onClick={() => handleSelectWorkerAsClient(w.id)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--surface)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
                    onMouseOut={e => e.currentTarget.style.backgroundColor = 'var(--surface)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(139, 92, 246, 0.15)',
                        color: '#8b5cf6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700
                      }}>
                        {w.first_name ? w.first_name.charAt(0) : 'U'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                          {w.first_name || w.username} {w.last_name || ''}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {w.job || 'Usta'} • {w.phone_number || 'Tel yo\'q'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={workerPickerLoading}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', height: '30px', padding: '0 10px' }}
                    >
                      Tanlash
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowWorkerPicker(false)}
                >
                  Yopish
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function POS() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const { logout, user } = useAuthStore();
  const queryClient = useQueryClient();

  const receiptRef = React.useRef();
  const handlePrint = useReactToPrint({
    content: () => receiptRef.current,
  });
  const [isCheckout, setIsCheckout] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  // Multi-Tab Order System
  const [tabs, setTabs] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_tabs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(tab => ({
            ...tab,
            cart: (tab.cart || []).map(item => {
              const q = parseFloat(item.qty) || 1;
              const p = parseFloat(item.selling_price) || 0;
              const lineTot = item.line_total !== undefined 
                ? Math.round(Number(item.line_total) || 0) 
                : Math.round(p * q);
              return { ...item, line_total: lineTot };
            })
          }));
        }
      }
      const legacy = localStorage.getItem('pos_cart');
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
          return [{
            id: 'tab-1',
            title: 'Chek #1',
            cart: parsedLegacy.map(item => {
              const q = parseFloat(item.qty) || 1;
              const p = parseFloat(item.selling_price) || 0;
              const lineTot = item.line_total !== undefined 
                ? Math.round(Number(item.line_total) || 0) 
                : Math.round(p * q);
              return { ...item, line_total: lineTot };
            }),
            services: [],
            createdAt: Date.now()
          }];
        }
      }
    } catch (e) {
      console.error("Failed to parse POS tabs:", e);
    }
    return [{
      id: 'tab-1',
      title: 'Chek #1',
      cart: [],
      services: [],
      createdAt: Date.now()
    }];
  });

  const [activeTabId, setActiveTabId] = useState(() => {
    const saved = localStorage.getItem('pos_active_tab_id');
    return saved || 'tab-1';
  });

  // Ensure activeTabId remains valid
  React.useEffect(() => {
    if (tabs.length > 0 && !tabs.some(t => t.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

  // Persist tabs and activeTabId to localStorage
  React.useEffect(() => {
    if (!editId) {
      localStorage.setItem('pos_tabs', JSON.stringify(tabs));
    }
  }, [tabs, editId]);

  React.useEffect(() => {
    if (!editId && activeTabId) {
      localStorage.setItem('pos_active_tab_id', activeTabId);
    }
  }, [activeTabId, editId]);

  const activeTab = useMemo(() => {
    return tabs.find(t => t.id === activeTabId) || tabs[0] || { id: 'tab-1', title: 'Chek #1', cart: [], services: [] };
  }, [tabs, activeTabId]);

  const cart = activeTab.cart || [];
  const posServices = activeTab.services || [];

  const activeTabIdRef = React.useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  const setCart = React.useCallback((action) => {
    const currentId = activeTabIdRef.current;
    setTabs(prevTabs => {
      return prevTabs.map(tab => {
        if (tab.id === currentId) {
          const currentCart = tab.cart || [];
          const newCart = typeof action === 'function' ? action(currentCart) : action;
          return { ...tab, cart: newCart };
        }
        return tab;
      });
    });
  }, []);

  const setPosServices = React.useCallback((action) => {
    const currentId = activeTabIdRef.current;
    setTabs(prevTabs => {
      return prevTabs.map(tab => {
        if (tab.id === currentId) {
          const currentServices = tab.services || [];
          const newServices = typeof action === 'function' ? action(currentServices) : action;
          return { ...tab, services: newServices };
        }
        return tab;
      });
    });
  }, []);

  const handleCreateTab = React.useCallback(() => {
    setTabs(prevTabs => {
      let nextNum = 1;
      const existingNums = prevTabs
        .map(t => {
          const m = t.title?.match(/^Chek #(\d+)$/i);
          return m ? parseInt(m[1], 10) : null;
        })
        .filter(n => n !== null);

      if (existingNums.length > 0) {
        nextNum = Math.max(...existingNums) + 1;
      } else {
        nextNum = prevTabs.length + 1;
      }

      const newTabId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newTab = {
        id: newTabId,
        title: `Chek #${nextNum}`,
        cart: [],
        services: [],
        createdAt: Date.now()
      };
      setActiveTabId(newTabId);
      toast.success(`${newTab.title} ochildi`);
      return [...prevTabs, newTab];
    });
  }, []);

  const handleCloseTab = React.useCallback((tabIdToClose, e) => {
    if (e) e.stopPropagation();
    setTabs(prevTabs => {
      const tabToClose = prevTabs.find(t => t.id === tabIdToClose);
      if (!tabToClose) return prevTabs;

      const hasItems = (tabToClose.cart && tabToClose.cart.length > 0) || (tabToClose.services && tabToClose.services.length > 0);
      if (hasItems) {
        const confirmed = window.confirm(`"${tabToClose.title}" savatchasida mahsulot yoki xizmatlar mavjud. Ushbu chekni yopishni tasdiqlaysizmi?`);
        if (!confirmed) return prevTabs;
      }

      if (prevTabs.length <= 1) {
        const resetTabId = `tab_${Date.now()}`;
        setActiveTabId(resetTabId);
        return [{
          id: resetTabId,
          title: 'Chek #1',
          cart: [],
          services: [],
          createdAt: Date.now()
        }];
      }

      const closedIndex = prevTabs.findIndex(t => t.id === tabIdToClose);
      const newTabs = prevTabs.filter(t => t.id !== tabIdToClose);

      if (activeTabIdRef.current === tabIdToClose) {
        const nextActiveIndex = Math.max(0, closedIndex - 1);
        setActiveTabId(newTabs[nextActiveIndex]?.id || newTabs[0].id);
      }
      return newTabs;
    });
  }, []);

  const [editingTabTitleId, setEditingTabTitleId] = useState(null);
  const [tabTitleInput, setTabTitleInput] = useState('');

  const handleStartRename = (tab, e) => {
    if (e) e.stopPropagation();
    setEditingTabTitleId(tab.id);
    setTabTitleInput(tab.title || '');
  };

  const handleSaveRename = () => {
    if (!editingTabTitleId) return;
    const trimmed = tabTitleInput.trim();
    if (trimmed) {
      setTabs(prev => prev.map(t => t.id === editingTabTitleId ? { ...t, title: trimmed } : t));
    }
    setEditingTabTitleId(null);
  };

  const handleClearActiveTab = () => {
    if (cart.length === 0 && posServices.length === 0) return;
    if (window.confirm(`"${activeTab.title}" savatchasini tozalashni tasdiqlaysizmi?`)) {
      setCart([]);
      setPosServices([]);
      toast.success("Savatcha tozalandi");
    }
  };

  const handleCancelEdit = () => {
    setCart([]);
    setPosServices([]);
    sessionStorage.removeItem(`loaded_edit_${editId}`);
    setSearchParams({});
    navigate('/pos');
  };

  const handleCheckoutSuccess = () => {
    if (editId) {
      sessionStorage.removeItem(`loaded_edit_${editId}`);
      setSearchParams({});
      navigate('/sales');
    } else {
      setTabs(prevTabs => {
        if (prevTabs.length > 1) {
          const remaining = prevTabs.filter(t => t.id !== activeTabId);
          const nextActiveId = remaining[0]?.id || '';
          setActiveTabId(nextActiveId);
          return remaining;
        } else {
          return prevTabs.map(t => {
            if (t.id === activeTabId) {
              return { ...t, cart: [], services: [] };
            }
            return t;
          });
        }
      });
    }
    setIsCheckout(false);
    queryClient.invalidateQueries({ queryKey: ['shifts'] });
  };

  // Shift tracking in POS
  const { data: currentShiftData } = useQuery({
    queryKey: ['shifts', 'current'],
    queryFn: async () => {
      const res = await api.get('shifts/current/');
      return res.data;
    },
    refetchInterval: 10000,
  });
  const activeShift = currentShiftData?.active ? currentShiftData.shift : null;

  const [showPosOpenShift, setShowPosOpenShift] = useState(false);
  const [showPosCloseShift, setShowPosCloseShift] = useState(false);
  const [posStartingCash, setPosStartingCash] = useState(0);
  const [posActualCash, setPosActualCash] = useState('');
  const [posShiftNotes, setPosShiftNotes] = useState('');
  const [isSubmittingShift, setIsSubmittingShift] = useState(false);

  const handlePosOpenShift = async (e) => {
    e.preventDefault();
    setIsSubmittingShift(true);
    try {
      const res = await api.post('shifts/start/', {
        starting_cash: parseFloat(posStartingCash || 0),
        notes: posShiftNotes,
      });
      toast.success(`Smena #${res.data.id} ochildi!`);
      setShowPosOpenShift(false);
      setPosStartingCash(0);
      setPosShiftNotes('');
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Smenani ochishda xatolik");
    } finally {
      setIsSubmittingShift(false);
    }
  };

  const handlePosCloseShift = async (e) => {
    e.preventDefault();
    if (posActualCash === '' || isNaN(posActualCash)) {
      return toast.error("Kassadagi bor naqd pul miqdorini kiriting!");
    }
    if (!activeShift?.id) return;
    setIsSubmittingShift(true);
    try {
      const res = await api.post(`shifts/${activeShift.id}/close/`, {
        actual_cash: parseFloat(posActualCash),
        notes: posShiftNotes,
      });
      toast.success(`Smena #${res.data.id} yopildi!`);
      setShowPosCloseShift(false);
      setPosActualCash('');
      setPosShiftNotes('');
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Smenani yopishda xatolik");
    } finally {
      setIsSubmittingShift(false);
    }
  };

  const { data: editSale } = useQuery({
    queryKey: ['sale', editId],
    queryFn: async () => (await api.get(`sales/${editId}/`)).data,
    enabled: !!editId
  });

  const [debouncedSearch] = useDebounce(searchQuery, 300);
  const [barcodeBuffer, setBarcodeBuffer] = useState('');

  const { data: categories, isLoading: catsLoading } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  const { data: productsData, isLoading: prodsLoading } = useQuery({ 
    queryKey: ['products', debouncedSearch, activeCategory], 
    queryFn: async () => {
      let url = 'products/?page_size=100&ordering=-recent_sales_qty,-id&';
      if (debouncedSearch) url += `search=${encodeURIComponent(debouncedSearch)}&`;
      if (activeCategory === 'top_10_days') {
        url += 'most_sold_10_days=true&';
      } else if (activeCategory !== 'all') {
        url += `category=${activeCategory}&`;
      }
      const { data } = await api.get(url);
      return data.results;
    }
  });

  const { data: allProducts } = useQuery({
    queryKey: ['all-products'],
    queryFn: async () => (await api.get('products/?page_size=500')).data.results,
    enabled: !!editId
  });

  React.useEffect(() => {
    if (editSale && allProducts && cart.length === 0 && !sessionStorage.getItem(`loaded_edit_${editId}`)) {
      const editCart = editSale.items.map(item => {
        const p = allProducts.find(prod => prod.id === item.product);
        const q = parseFloat(item.quantity) || 1;
        const price = parseFloat(item.price) || 0;
        const lineTot = item.total != null ? Math.round(parseFloat(item.total)) : Math.round(price * q);
        return {
          id: item.product,
          name: p ? p.name : `Product #${item.product}`,
          qty: q,
          selling_price: price,
          line_total: lineTot
        };
      });
      setCart(editCart);
      if (editSale.services && editSale.services.length > 0) {
        setPosServices(editSale.services.map(s => ({
          worker: s.worker,
          worker_name: s.worker_name,
          service_name: s.service_name,
          amount: Math.round(parseFloat(s.amount) || 0)
        })));
      }
      sessionStorage.setItem(`loaded_edit_${editId}`, 'true');
    }
  }, [editSale, allProducts]);

  const filteredProducts = productsData || [];

  const addToCart = React.useCallback((product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => {
          if (item.id === product.id) {
            const newQty = (parseFloat(item.qty) || 0) + 1;
            const unitPrice = parseFloat(item.selling_price) || 0;
            return {
              ...item,
              qty: newQty,
              line_total: Math.round(unitPrice * newQty)
            };
          }
          return item;
        });
      }
      const initialPrice = parseFloat(product.selling_price) || 0;
      return [...prev, {
        ...product,
        qty: 1,
        selling_price: initialPrice,
        line_total: Math.round(initialPrice * 1)
      }];
    });
  }, []);

  React.useEffect(() => {
    let timeoutId;
    const handleKeyDown = (e) => {
      if (isCheckout) return;

      if (e.key === 'Enter') {
        if (barcodeBuffer.length > 2) {
          api.get(`products/?search=${barcodeBuffer}`).then(res => {
            if (res.data.results.length === 1) {
              addToCart(res.data.results[0]);
              toast.success(`Qo'shildi: ${res.data.results[0].name}`);
            } else if (res.data.results.length > 1) {
               // Let standard search handle it if there are variants/multiple matches
               setSearchQuery(barcodeBuffer);
            } else {
               toast.error('Mahsulot topilmadi');
            }
          });
          setBarcodeBuffer('');
          // Also prevent default form submission if they were focused on an input
          e.preventDefault();
        }
      } else if (e.key.length === 1) {
        // Scanners are fast. Manual typing is slow.
        setBarcodeBuffer(prev => prev + e.key);
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => setBarcodeBuffer(''), 100);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timeoutId);
    };
  }, [barcodeBuffer, isCheckout, addToCart]);

  // Keyboard shortcuts for Multi-Tab order switching (Alt+T / Alt+N: New, Alt+W: Close, Alt+1..9: Switch)
  React.useEffect(() => {
    const handleTabShortcuts = (e) => {
      if (isCheckout || showPosOpenShift || showPosCloseShift) return;

      if (e.altKey) {
        if (e.code === 'KeyT' || e.code === 'KeyN' || e.key === 't' || e.key === 'T' || e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          handleCreateTab();
          return;
        }

        if (e.code === 'KeyW' || e.key === 'w' || e.key === 'W') {
          e.preventDefault();
          handleCloseTab(activeTabId);
          return;
        }

        if ((e.key >= '1' && e.key <= '9') || (e.code && e.code.startsWith('Digit') && e.code[5] >= '1' && e.code[5] <= '9')) {
          const digit = parseInt(e.key || e.code[5], 10);
          const targetIndex = digit - 1;
          if (tabs[targetIndex]) {
            e.preventDefault();
            setActiveTabId(tabs[targetIndex].id);
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', handleTabShortcuts);
    return () => window.removeEventListener('keydown', handleTabShortcuts);
  }, [tabs, activeTabId, isCheckout, showPosOpenShift, showPosCloseShift, handleCreateTab, handleCloseTab]);

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const current = parseFloat(item.qty) || 0;
        const newQty = Math.round((current + delta) * 1000) / 1000;
        if (newQty <= 0) return item;
        const unitPrice = parseFloat(item.selling_price) || 0;
        return { 
          ...item, 
          qty: newQty,
          line_total: Math.round(unitPrice * newQty),
          total_override: undefined
        };
      }
      return item;
    }));
  };

  const updatePrice = (id, newPrice) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const qty = parseFloat(item.qty) || 1;
        const parsedPrice = parseFloat(newPrice);
        const newLineTotal = !isNaN(parsedPrice) ? Math.round(parsedPrice * qty) : item.line_total;
        return { 
          ...item, 
          selling_price: newPrice, 
          line_total: newLineTotal,
          total_override: undefined 
        };
      }
      return item;
    }));
  };

  const updateTotal = (id, newTotal) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const qty = parseFloat(item.qty) || 1;
        const totalNum = parseFloat(newTotal);
        if (!isNaN(totalNum)) {
          const roundedTotal = Math.round(totalNum);
          const rawUnitPrice = qty > 0 ? (roundedTotal / qty) : 0;
          const calculatedPrice = Number(rawUnitPrice.toFixed(2));
          return {
            ...item,
            line_total: roundedTotal,
            selling_price: calculatedPrice,
            total_override: newTotal
          };
        }
        return {
          ...item,
          total_override: newTotal
        };
      }
      return item;
    }));
  };

  const removeFromCart = (id) => setCart(prev => prev.filter(item => item.id !== id));

  const total = cart.reduce((sum, item) => {
    const lineTot = item.line_total !== undefined 
      ? Math.round(Number(item.line_total) || 0)
      : Math.round((parseFloat(item.selling_price) || 0) * (parseFloat(item.qty) || 0));
    return sum + lineTot;
  }, 0);
  const servicesTotal = posServices.reduce((sum, s) => sum + Math.round(parseFloat(s.amount) || 0), 0);
  const grandTotal = total + servicesTotal;

  return (
    <div className="pos-container">
      <main className="pos-main">
        <header className="pos-header" style={{ padding: '12px 24px' }}>
          <div className="search-bar">
            <Search size={20} color="var(--text-muted)" />
            <input 
              type="text" 
              placeholder="Mahsulotlarni chiziqli belgi (kod) orqali qidirish..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="user-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {activeShift ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '10px',
                fontSize: '0.82rem'
              }}>
                <span style={{ color: 'var(--success)', fontWeight: 700 }}>● Smena #{activeShift.id}</span>
                <span style={{ color: 'var(--text-muted)' }}>|</span>
                <span>Boshlang'ich: <strong>{Number(activeShift.starting_cash || 0).toLocaleString()}</strong></span>
                <span style={{ color: 'var(--text-muted)' }}>|</span>
                <span>Kutilgan: <strong style={{ color: 'var(--primary)' }}>{Number(activeShift.summary?.expected_cash || activeShift.starting_cash).toLocaleString()}</strong></span>
                <button
                  onClick={() => {
                    setPosActualCash('');
                    setPosShiftNotes('');
                    setShowPosCloseShift(true);
                  }}
                  className="btn btn-danger"
                  style={{ height: '26px', padding: '0 8px', fontSize: '0.72rem', marginLeft: '2px' }}
                >
                  Yopish
                </button>
              </div>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '10px',
                fontSize: '0.82rem'
              }}>
                <AlertTriangle size={15} color="var(--warning)" />
                <span style={{ color: 'var(--warning)', fontWeight: 600 }}>Smena ochilmagan</span>
                <button
                  onClick={() => {
                    setPosStartingCash(0);
                    setPosShiftNotes('');
                    setShowPosOpenShift(true);
                  }}
                  className="btn btn-primary"
                  style={{ height: '26px', padding: '0 8px', fontSize: '0.72rem' }}
                >
                  <Plus size={13} /> Ochish
                </button>
              </div>
            )}

            <button 
              className="btn" 
              style={{ backgroundColor: 'var(--surface)', color: 'var(--primary)', border: '1px solid var(--primary)', height: '36px' }} 
              onClick={() => navigate('/shifts')}
              title="Smenalar boshqaruvi"
            >
              <Clock size={16} /> Smenalar
            </button>

            <button className="btn" style={{ backgroundColor: 'var(--surface)', color: 'var(--text-main)', border: '1px solid var(--border)', height: '36px' }} onClick={() => navigate('/sales')}>
               Oxirgi sotuvlar
            </button>
          </div>
        </header>

        <div className="categories">
          {catsLoading ? (
            Array.from({ length: 5 }).map((_, i) => <div key={i} className="category-pill" style={{ width: '80px', height: '36px', backgroundColor: 'var(--border)', animation: 'pulse 1.5s infinite' }} />)
          ) : (
            categories?.map(c => (
              <div 
                key={c.id} 
                className={`category-pill ${activeCategory === c.id ? 'active' : ''}`}
                style={c.id === 'top_10_days' ? {
                  fontWeight: 700,
                  borderColor: activeCategory === 'top_10_days' ? '#ea580c' : 'rgba(234, 88, 12, 0.4)',
                  backgroundColor: activeCategory === 'top_10_days' ? '#ea580c' : 'rgba(234, 88, 12, 0.08)',
                  color: activeCategory === 'top_10_days' ? '#fff' : '#ea580c'
                } : {}}
                onClick={() => setActiveCategory(c.id)}
              >
                {c.name}
              </div>
            ))
          )}
        </div>

        <div className="product-grid">
          {prodsLoading ? (
            Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="product-card" style={{ animation: 'pulse 1.5s infinite', backgroundColor: 'var(--surface)', padding: '10px 12px', minHeight: '108px' }}>
                <div style={{ height: '14px', backgroundColor: 'var(--border)', borderRadius: '4px', marginBottom: '6px' }}></div>
                <div style={{ height: '14px', width: '70%', backgroundColor: 'var(--border)', borderRadius: '4px', marginBottom: '8px' }}></div>
                <div style={{ height: '12px', width: '90%', backgroundColor: 'var(--border)', borderRadius: '4px', marginBottom: '8px' }}></div>
                <div style={{ height: '16px', width: '55%', backgroundColor: 'var(--border)', borderRadius: '4px', marginTop: 'auto' }}></div>
              </div>
            ))
          ) : filteredProducts.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
              <PackageOpen size={64} style={{ opacity: 0.2, marginBottom: '16px' }} />
              <h3>Mahsulotlar topilmadi</h3>
              <p>Qidiruv yoki toifa filtrini o'zgartirib ko'ring.</p>
            </div>
          ) : (
            filteredProducts.map(p => {
              const stockQty = parseFloat(p.total_quantity || 0);
              const isOutOfStock = stockQty <= 0;
              const formattedQty = Number(stockQty.toFixed(2)) % 1 === 0 ? parseInt(stockQty) : stockQty;
              const costVal = parseFloat(p.cost_price || 0);
              const formattedCost = Math.round(costVal).toLocaleString();
              const sellingVal = parseFloat(p.selling_price || 0);
              const formattedSelling = Math.round(sellingVal).toLocaleString();

              return (
                <div key={p.id} className="product-card" onClick={() => addToCart(p)}>
                  {p.image && (
                    <img src={p.image} alt={p.name} className="product-card-img" />
                  )}
                  <div className="product-info">
                    <div className="product-name" title={p.name}>
                      {p.name || 'Nomsiz mahsulot'}
                    </div>
                    <div className="product-card-meta">
                      <span className="product-stock" style={{ color: isOutOfStock ? 'var(--danger)' : 'var(--text-muted)' }}>
                        Qoldiq: <strong style={{ color: isOutOfStock ? 'var(--danger)' : 'var(--text-main)' }}>{formattedQty} {p.unit_name || ''}</strong>
                      </span>
                      {costVal > 0 && (
                        <span className="product-cost" title={`Tan narxi: ${formattedCost} SO'M`}>
                          Tan: <strong>{formattedCost}</strong>
                        </span>
                      )}
                    </div>
                    <div className="product-card-footer">
                      <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                        {formattedSelling} SO'M
                      </span>
                      {parseFloat(p.recent_sales_qty || 0) > 0 && (
                        <div 
                          className="product-recent-sales-badge"
                          title={`Oxirgi 10 kunda ${p.recent_sales_qty} ta sotilgan`}
                        >
                          <span className="badge-flame">🔥</span>
                          <span className="badge-text">{Number(parseFloat(p.recent_sales_qty || 0).toFixed(0))} ta (10 kun)</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      <aside className="cart-sidebar">
        {/* Multi-Tab Order Bar */}
        {!editId && (
          <div className="pos-tabs-strip">
            {tabs.map((tab, index) => {
              const tabItemCount = (tab.cart || []).reduce((acc, it) => acc + (parseFloat(it.qty) || 1), 0) + (tab.services || []).length;
              const isActive = tab.id === activeTabId;
              const isRenaming = editingTabTitleId === tab.id;

              return (
                <div
                  key={tab.id}
                  className={`pos-tab-item ${isActive ? 'active' : ''}`}
                  onClick={() => !isRenaming && setActiveTabId(tab.id)}
                  onDoubleClick={(e) => handleStartRename(tab, e)}
                  title={`${tab.title} (Alt+${index + 1}). Nomini o'zgartirish uchun 2 marta bosing.`}
                >
                  {isRenaming ? (
                    <input
                      type="text"
                      value={tabTitleInput}
                      onChange={e => setTabTitleInput(e.target.value)}
                      onBlur={handleSaveRename}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveRename();
                        if (e.key === 'Escape') setEditingTabTitleId(null);
                      }}
                      autoFocus
                      onClick={e => e.stopPropagation()}
                      style={{
                        width: '80px',
                        padding: '2px 4px',
                        fontSize: '0.78rem',
                        border: '1px solid var(--primary)',
                        borderRadius: '4px',
                        background: 'var(--bg-color)',
                        color: 'var(--text-main)',
                        outline: 'none'
                      }}
                    />
                  ) : (
                    <>
                      <span className="pos-tab-title">{tab.title || `Chek #${index + 1}`}</span>
                      {tabItemCount > 0 && (
                        <span className="pos-tab-count">
                          {Number(tabItemCount.toFixed(1)) % 1 === 0 ? parseInt(tabItemCount) : tabItemCount.toFixed(1)}
                        </span>
                      )}
                    </>
                  )}

                  {tabs.length > 1 && (
                    <button
                      type="button"
                      className="pos-tab-close-btn"
                      onClick={(e) => handleCloseTab(tab.id, e)}
                      title="Chekni yopish (Alt+W)"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              className="pos-add-tab-btn"
              onClick={handleCreateTab}
              title="Yangi chek ochish (Alt+T yoki Alt+N)"
            >
              <Plus size={13} /> Yangi chek
            </button>
          </div>
        )}

        <div className="cart-header" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
              {editingTabTitleId === activeTab.id ? (
                <input
                  type="text"
                  value={tabTitleInput}
                  onChange={e => setTabTitleInput(e.target.value)}
                  onBlur={handleSaveRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveRename();
                    if (e.key === 'Escape') setEditingTabTitleId(null);
                  }}
                  autoFocus
                  style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: '1.5px solid var(--primary)',
                    background: 'var(--bg-color)',
                    color: 'var(--text-main)',
                    width: '100%',
                    maxWidth: '180px'
                  }}
                />
              ) : (
                <>
                  <h2 
                    style={{ 
                      fontSize: '1.05rem', 
                      fontWeight: 700, 
                      margin: 0, 
                      whiteSpace: 'nowrap', 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis',
                      cursor: editId ? 'default' : 'pointer'
                    }}
                    onClick={(e) => !editId && handleStartRename(activeTab, e)}
                    title={editId ? '' : "Nomini o'zgartirish uchun bosing"}
                  >
                    {editId ? `Sotuvni tahrirlash #${editId}` : (activeTab.title || 'Joriy chek')}
                  </h2>
                  {!editId && (
                    <button
                      type="button"
                      className="btn-icon"
                      style={{ color: 'var(--text-muted)', padding: '2px', cursor: 'pointer' }}
                      onClick={(e) => handleStartRename(activeTab, e)}
                      title="Chek nomini o'zgartirish (Mijoz yoki Mashina raqami)"
                    >
                      <Edit3 size={14} />
                    </button>
                  )}
                </>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {editId ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                  onClick={handleCancelEdit}
                >
                  Bekor qilish
                </button>
              ) : (
                (cart.length > 0 || posServices.length > 0) && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ 
                      padding: '4px 8px', 
                      fontSize: '0.76rem', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '4px',
                      color: 'var(--danger)',
                      borderColor: 'rgba(239, 68, 68, 0.25)'
                    }}
                    onClick={handleClearActiveTab}
                    title="Ushbu chekdagi mahsulotlarni tozalash"
                  >
                    <Trash2 size={13} /> Tozalash
                  </button>
                )
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span>
              {cart.length + posServices.length > 0 ? (
                <span>{cart.length} ta mahsulot{posServices.length > 0 ? `, ${posServices.length} ta xizmat` : ''}</span>
              ) : (
                <span>Savatcha bo'sh</span>
              )}
            </span>
            {!editId && tabs.length > 1 && (
              <span style={{ fontSize: '0.72rem', background: 'rgba(99, 102, 241, 0.1)', padding: '2px 6px', borderRadius: '4px', color: 'var(--primary)', fontWeight: 600 }}>
                {tabs.length} ta faol chek
              </span>
            )}
          </div>
        </div>
        
        <div className="cart-items">
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>
              <ShoppingCart size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
              <p>Savatcha bo'sh</p>
            </div>
          ) : (
            cart.map(item => {
              const costPriceVal = parseFloat(item.cost_price || 0);
              const formattedCostPrice = Math.round(costPriceVal).toLocaleString();
              const stockVal = parseFloat(item.total_quantity || 0);
              const formattedStock = Number(stockVal.toFixed(2)) % 1 === 0 ? parseInt(stockVal) : stockVal;

              return (
                <div key={item.id} className="cart-card">
                  <div className="cart-card-header">
                    <div className="cart-card-name" title={item.name}>
                      {item.name}
                    </div>
                    <button 
                      type="button"
                      className="cart-card-delete" 
                      onClick={() => removeFromCart(item.id)} 
                      title="O'chirish"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="cart-card-meta">
                    <span className="cart-card-cost" title={`Tan narxi: ${formattedCostPrice} SO'M`}>
                      Tan narxi: <strong>{formattedCostPrice} SO'M</strong>
                    </span>
                    {item.total_quantity !== undefined && (
                      <span className="cart-card-stock" style={{ color: stockVal <= 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                        Qoldiq: <strong style={{ color: stockVal <= 0 ? 'var(--danger)' : 'var(--text-main)' }}>{formattedStock} {item.unit_name || ''}</strong>
                      </span>
                    )}
                  </div>

                  <div className="cart-card-controls">
                    <div className="cart-field-col">
                      <label className="cart-field-label">Dona narxi</label>
                      <input 
                        type="number" 
                        step="any"
                        title="1 dona narxi"
                        value={item.selling_price} 
                        onChange={e => updatePrice(item.id, e.target.value)}
                        onBlur={e => {
                          const parsed = parseFloat(e.target.value);
                          const finalPrice = (!isNaN(parsed) && parsed >= 0) ? parsed : 0;
                          const qty = parseFloat(item.qty) || 1;
                          setCart(prev => prev.map(it => it.id === item.id ? {
                            ...it,
                            selling_price: finalPrice,
                            line_total: Math.round(finalPrice * qty),
                            total_override: undefined
                          } : it));
                        }}
                        className="cart-field-input"
                      />
                    </div>

                    <div className="cart-field-col cart-qty-col">
                      <label className="cart-field-label" style={{ textAlign: 'center' }}>Miqdor</label>
                      <div className="cart-qty-wrapper">
                        <button type="button" className="cart-qty-btn" onClick={() => updateQty(item.id, -1)}><Minus size={13} /></button>
                        <input
                          type="number"
                          step="any"
                          min="0.001"
                          title="Miqdor"
                          value={item.qty}
                          onChange={e => {
                            const val = e.target.value;
                            setCart(prev => prev.map(it => {
                              if (it.id === item.id) {
                                const parsedQty = parseFloat(val);
                                const unitPrice = parseFloat(it.selling_price) || 0;
                                const newLineTotal = (!isNaN(parsedQty) && parsedQty > 0) ? Math.round(unitPrice * parsedQty) : it.line_total;
                                return { ...it, qty: val, line_total: newLineTotal, total_override: undefined };
                              }
                              return it;
                            }));
                          }}
                          onBlur={e => {
                            const parsed = parseFloat(item.qty);
                            const finalQty = (!isNaN(parsed) && parsed > 0) ? parsed : 1;
                            const unitPrice = parseFloat(item.selling_price) || 0;
                            setCart(prev => prev.map(it => it.id === item.id ? { 
                              ...it, 
                              qty: finalQty, 
                              line_total: Math.round(unitPrice * finalQty),
                              total_override: undefined
                            } : it));
                          }}
                          className="cart-qty-val"
                        />
                        <button type="button" className="cart-qty-btn" onClick={() => updateQty(item.id, 1)}><Plus size={13} /></button>
                      </div>
                    </div>

                    <div className="cart-field-col cart-total-col">
                      <label className="cart-field-label" style={{ textAlign: 'right' }}>Jami summa</label>
                      <input
                        type="number"
                        step="any"
                        title="Umumiy summa (o'zgartirsangiz dona narxi avtomatik hisoblanadi)"
                        placeholder="Jami"
                        value={item.total_override !== undefined ? item.total_override : (item.line_total !== undefined ? item.line_total : (Math.round((parseFloat(item.selling_price) || 0) * (parseFloat(item.qty) || 0)) || ''))}
                        onChange={e => updateTotal(item.id, e.target.value)}
                        onBlur={() => {
                          setCart(prev => prev.map(it => {
                            if (it.id === item.id) {
                              const finalLineTotal = it.line_total !== undefined 
                                ? Math.round(Number(it.line_total) || 0) 
                                : Math.round((parseFloat(it.selling_price) || 0) * (parseFloat(it.qty) || 0));
                              const qty = parseFloat(it.qty) || 1;
                              const unitPrice = qty > 0 ? Number((finalLineTotal / qty).toFixed(2)) : 0;
                              return {
                                ...it,
                                line_total: finalLineTotal,
                                selling_price: unitPrice,
                                total_override: undefined
                              };
                            }
                            return it;
                          }));
                        }}
                        className="cart-field-input cart-total-input"
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {posServices.length > 0 && (
            <div style={{ marginTop: '12px', borderTop: '1px dashed var(--border)', paddingTop: '10px' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Wrench size={13} /> Xizmatlar:
              </div>
              {posServices.map((svc, idx) => (
                <div key={`svc-${idx}`} className="cart-item" style={{ borderLeft: '3px solid var(--primary)', padding: '8px 10px', marginBottom: '6px' }}>
                  <div className="item-info">
                    <div className="item-name" style={{ fontSize: '0.85rem' }}>
                      {svc.service_name || "Xizmat haqi"}
                    </div>
                    <div className="item-price" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {svc.worker_name ? `Usta: ${svc.worker_name}` : "Usta biriktirilgan"}
                    </div>
                  </div>
                  <div className="item-total" style={{ fontSize: '0.88rem', color: 'var(--primary)', fontWeight: 700 }}>
                    {(parseFloat(svc.amount) || 0).toLocaleString()}
                  </div>
                  <button className="btn-icon" onClick={() => setPosServices(prev => prev.filter((_, i) => i !== idx))} style={{ color: 'var(--danger)', marginLeft: '4px' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="cart-footer">
          <div className="cart-summary">
            <div className="summary-row">
              <span>Mahsulotlar</span>
              <span>{total.toLocaleString()} SO'M</span>
            </div>
            {servicesTotal > 0 && (
              <div className="summary-row" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                <span>Xizmat haqi</span>
                <span>+{servicesTotal.toLocaleString()} SO'M</span>
              </div>
            )}
            <div className="summary-row total">
              <span>Jami</span>
              <span>{grandTotal.toLocaleString()} SO'M</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            <button 
              type="button"
              onClick={() => {
                setPosServices(prev => [...prev, { worker: '', service_name: "Xizmat haqi", amount: '' }]);
                setIsCheckout(true);
              }}
              className="btn btn-secondary"
              style={{ flex: 1, padding: '10px 12px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Wrench size={16} /> + Xizmat qo'shish
            </button>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <button onClick={() => {
              if (cart.length === 0 && posServices.length === 0) return toast.error("Savatchada mahsulot yoki xizmat bo'lishi kerak!");
              setIsCheckout(true);
            }} className="btn btn-primary" style={{ flex: 1, padding: '16px', fontSize: '1.1rem' }}>
              To'lov qilish ({grandTotal.toLocaleString()} SO'M)
            </button>
          </div>
        </div>
      </aside>

      {isCheckout && (
        <CheckoutModal 
          cart={cart} 
          total={total} 
          services={posServices}
          setServices={setPosServices}
          user={user}
          editSale={editSale}
          activeShift={activeShift}
          onOpenShift={() => setShowPosOpenShift(true)}
          onClose={() => setIsCheckout(false)} 
          onSuccess={handleCheckoutSuccess} 
        />
      )}

      {/* POS Quick Open Shift Modal */}
      {showPosOpenShift && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowPosOpenShift(false); }}>
          <div className="modal-content" style={{ maxWidth: '440px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={20} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Smena ochish</h3>
              </div>
              <button className="btn-icon" onClick={() => setShowPosOpenShift(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePosOpenShift}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '6px' }}>
                  Boshlang'ich naqd pul (Starting Cash)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={posStartingCash}
                  onChange={(e) => setPosStartingCash(e.target.value)}
                  placeholder="0 so'm"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid var(--primary)',
                    backgroundColor: 'var(--bg-color)',
                    color: 'var(--text-main)',
                    fontSize: '1.2rem',
                    fontWeight: 700
                  }}
                  autoFocus
                  required
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                  {[0, 100000, 200000, 500000, 1000000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setPosStartingCash(amt)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: posStartingCash === amt ? 'var(--primary)' : 'var(--surface-hover)',
                        color: posStartingCash === amt ? 'white' : 'var(--text-main)',
                        fontSize: '0.75rem',
                        cursor: 'pointer'
                      }}
                    >
                      {amt === 0 ? "0 so'm" : `${(amt / 1000).toLocaleString()} ming`}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Izoh (Ixtiyoriy)
                </label>
                <textarea
                  rows="2"
                  value={posShiftNotes}
                  onChange={(e) => setPosShiftNotes(e.target.value)}
                  placeholder="Eslatma..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-color)',
                    color: 'var(--text-main)',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPosOpenShift(false)}>
                  Bekor qilish
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmittingShift}>
                  {isSubmittingShift ? "Ochilmoqda..." : "Smenani ochish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POS Quick Close Shift Modal */}
      {showPosCloseShift && activeShift && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowPosCloseShift(false); }}>
          <div className="modal-content" style={{ maxWidth: '480px', width: '92%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} color="var(--danger)" />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                  Smenani yopish (#{activeShift.id})
                </h3>
              </div>
              <button className="btn-icon" onClick={() => setShowPosCloseShift(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePosCloseShift}>
              <div style={{
                backgroundColor: 'rgba(0,0,0,0.02)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '14px 16px',
                marginBottom: '16px',
                fontSize: '0.88rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Boshlang'ich kassa:</span>
                  <span style={{ fontWeight: 600 }}>{Number(activeShift.starting_cash || 0).toLocaleString()} so'm</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Naqd tushum (Kirim):</span>
                  <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                    +{Number(activeShift.summary?.total_cash_income || 0).toLocaleString()} so'm
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Naqd chiqimlar:</span>
                  <span style={{ fontWeight: 600, color: 'var(--danger)' }}>
                    -{Number(activeShift.summary?.total_cash_expense || 0).toLocaleString()} so'm
                  </span>
                </div>
                <div style={{ borderTop: '1px dashed var(--border)', margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: 'var(--primary)' }}>Kutilayotgan naqd pul:</span>
                  <span style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--primary)' }}>
                    {Number(activeShift.summary?.expected_cash || activeShift.starting_cash).toLocaleString()} so'm
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, marginBottom: '6px' }}>
                  Kassadagi bor naqd pul (Sanalgan pul) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={posActualCash}
                  onChange={(e) => setPosActualCash(e.target.value)}
                  placeholder="Kassadagi bor naqd pulni kiriting..."
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '2px solid var(--primary)',
                    backgroundColor: 'var(--bg-color)',
                    color: 'var(--text-main)',
                    fontSize: '1.25rem',
                    fontWeight: 800
                  }}
                  autoFocus
                  required
                />

                {posActualCash !== '' && !isNaN(posActualCash) && (
                  <div style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    background: (parseFloat(posActualCash) - Number(activeShift.summary?.expected_cash || activeShift.starting_cash)) === 0 
                      ? 'var(--success-light)' 
                      : (parseFloat(posActualCash) - Number(activeShift.summary?.expected_cash || activeShift.starting_cash)) > 0 
                        ? 'rgba(99, 102, 241, 0.1)' 
                        : 'var(--danger-light)',
                    color: (parseFloat(posActualCash) - Number(activeShift.summary?.expected_cash || activeShift.starting_cash)) === 0 
                      ? 'var(--success)' 
                      : (parseFloat(posActualCash) - Number(activeShift.summary?.expected_cash || activeShift.starting_cash)) > 0 
                        ? 'var(--primary)' 
                        : 'var(--danger)'
                  }}>
                    <span>
                      {(parseFloat(posActualCash) - Number(activeShift.summary?.expected_cash || activeShift.starting_cash)) === 0
                        ? "Farq yo'q (To'g'ri)"
                        : (parseFloat(posActualCash) - Number(activeShift.summary?.expected_cash || activeShift.starting_cash)) > 0
                          ? "Ortiqcha pul:"
                          : "Kamomad mavjud:"}
                    </span>
                    <span>
                      {(parseFloat(posActualCash) - Number(activeShift.summary?.expected_cash || activeShift.starting_cash)) > 0 ? "+" : ""}
                      {(parseFloat(posActualCash) - Number(activeShift.summary?.expected_cash || activeShift.starting_cash)).toLocaleString()} so'm
                    </span>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Izoh (Ixtiyoriy)
                </label>
                <textarea
                  rows="2"
                  value={posShiftNotes}
                  onChange={(e) => setPosShiftNotes(e.target.value)}
                  placeholder="Eslatma yoki farq sababi..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-color)',
                    color: 'var(--text-main)',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPosCloseShift(false)}>
                  Bekor qilish
                </button>
                <button type="submit" className="btn btn-danger" disabled={isSubmittingShift}>
                  {isSubmittingShift ? "Yopilmoqda..." : "Smenani yopish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      <Receipt ref={receiptRef} cart={cart} services={posServices} total={grandTotal} user={user} />
    </div>
  );
}

export default POS;
