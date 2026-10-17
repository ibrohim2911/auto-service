import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Trash2, Edit, AlertCircle, X, Car, Building, User, Search, Filter } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import SearchableSelect from '../components/SearchableSelect';
import Pagination from '../components/Pagination';

function StatCard({ title, value, icon, color }) {
  return (
    <div style={{ backgroundColor: 'var(--surface)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '180px' }}>
      <div style={{ padding: '8px', borderRadius: '50%', backgroundColor: `${color}20`, color: color }}>
        {icon}
      </div>
      <div>
        <h3 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '2px' }}>{title}</h3>
        <p style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{value}</p>
      </div>
    </div>
  );
}

function Clients() {
  const [activeTab, setActiveTab] = useState('clients');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');

  const [clientsPage, setClientsPage] = useState(1);
  const [clientsPageSize, setClientsPageSize] = useState(20);
  const [carsPage, setCarsPage] = useState(1);
  const [carsPageSize, setCarsPageSize] = useState(20);

  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setClientsPage(1);
  }, [debouncedSearch, sortOrder, companyFilter]);

  useEffect(() => {
    setCarsPage(1);
  }, [debouncedSearch, sortOrder, ownerFilter]);

  const handleSort = (field) => {
    if (sortOrder === field) {
      setSortOrder(`-${field}`);
    } else {
      setSortOrder(field);
    }
  };

  const getSortIcon = (field) => {
    if (sortOrder === field) return ' ↑';
    if (sortOrder === `-${field}`) return ' ↓';
    return '';
  };

  const [formData, setFormData] = useState({});
  const [formErrors, setFormErrors] = useState({});

  // Stats query
  const { data: statsData } = useQuery({
    queryKey: ['clients-stats'],
    queryFn: async () => {
      const res = await api.get('clients/stats/');
      return res.data;
    }
  });

  const { data: clientsResponse, isLoading: clientsLoading } = useQuery({ 
    queryKey: ['clients', debouncedSearch, sortOrder, companyFilter, clientsPage, clientsPageSize], 
    queryFn: async () => {
      let url = `clients/?page=${clientsPage}&page_size=${clientsPageSize}&search=${encodeURIComponent(debouncedSearch)}&ordering=${sortOrder}&`;
      if (companyFilter !== '') url += `is_company=${companyFilter}&`;
      return (await api.get(url)).data;
    } 
  });
  const clientsData = clientsResponse?.results || (Array.isArray(clientsResponse) ? clientsResponse : []);
  
  const { data: carsResponse, isLoading: carsLoading } = useQuery({ 
    queryKey: ['cars', debouncedSearch, sortOrder, ownerFilter, carsPage, carsPageSize], 
    queryFn: async () => {
      let url = `cars/?page=${carsPage}&page_size=${carsPageSize}&search=${encodeURIComponent(debouncedSearch)}&ordering=${sortOrder}&`;
      if (ownerFilter) url += `owner=${ownerFilter}&`;
      return (await api.get(url)).data;
    }
  });
  const carsData = carsResponse?.results || (Array.isArray(carsResponse) ? carsResponse : []);

  const { data: clientOptionsData } = useQuery({
    queryKey: ['clients-options'],
    queryFn: async () => {
      const res = await api.get('clients/?page_size=500');
      return res.data?.results || (Array.isArray(res.data) ? res.data : []);
    }
  });
  const clientOptions = clientOptionsData || [];

  const deleteMutation = useMutation({
    mutationFn: async ({ id, endpoint }) => await api.delete(`${endpoint}/${id}/`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [variables.queryKey] });
      queryClient.invalidateQueries({ queryKey: ['clients-stats'] });
      queryClient.invalidateQueries({ queryKey: ['clients-options'] });
      toast.success('Muvaffaqiyatli o\'chirildi');
    },
    onError: () => toast.error('O\'chirishda xatolik')
  });

  const createMutation = useMutation({
    mutationFn: async ({ endpoint, payload }) => await api.post(`${endpoint}/`, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [variables.queryKey] });
      queryClient.invalidateQueries({ queryKey: ['clients-stats'] });
      queryClient.invalidateQueries({ queryKey: ['clients-options'] });
      toast.success('Muvaffaqiyatli yaratildi!');
      closeModal();
    },
    onError: (err) => {
      toast.error("Saqlashda xatolik. Iltimos, ma'lumotlarni tekshiring.");
      if (err.response?.data) setFormErrors(err.response.data);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, endpoint, payload }) => await api.patch(`${endpoint}/${id}/`, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [variables.queryKey] });
      queryClient.invalidateQueries({ queryKey: ['clients-stats'] });
      queryClient.invalidateQueries({ queryKey: ['clients-options'] });
      toast.success('Muvaffaqiyatli yangilandi!');
      closeModal();
    },
    onError: (err) => {
      toast.error('Yangilashda xatolik.');
      if (err.response?.data) setFormErrors(err.response.data);
    }
  });

  const handleDelete = (id, endpoint, queryKey) => {
    if (window.confirm("Haqiqatan ham o'chirmoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi.")) {
      deleteMutation.mutate({ id, endpoint, queryKey });
    }
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData(item);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setFormData({});
    setFormErrors({});
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (formErrors[name]) setFormErrors(prev => ({ ...prev, [name]: null }));
  };

  const validateForm = () => {
    let errors = {};
    if (activeTab === 'clients') {
      if (!formData.name) errors.name = 'Ism majburiy';
      if (!formData.phone_number) errors.phone_number = 'Telefon raqami majburiy';
    } else if (activeTab === 'cars') {
      if (!formData.plate_number) errors.plate_number = 'Davlat raqami majburiy';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    const endpoint = activeTab === 'clients' ? 'clients' : 'cars';
    const queryKey = activeTab === 'clients' ? 'clients' : 'cars';
    
    const payload = { ...formData };
    if (activeTab === 'cars' && !payload.owner) {
      payload.owner = null;
    }

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, endpoint, queryKey, payload });
    } else {
      createMutation.mutate({ endpoint, queryKey, payload });
    }
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-color)', color: 'var(--text-main)', fontSize: '1rem', marginTop: '6px' };
  const errorStyle = { color: 'var(--danger)', fontSize: '0.85rem', marginTop: '4px', display: 'block' };

  const stats = {
    totalClients: statsData?.total_clients ?? 0,
    totalCars: statsData?.total_cars ?? 0,
    companyClients: statsData?.company_clients ?? 0,
    personClients: statsData?.person_clients ?? 0,
  };

  return (
    <div style={{ padding: '16px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', color: 'var(--primary)', marginBottom: '4px' }}>Mijozlar va Avtomobillar</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Mijozlar bazasi va ro'yxatdan o'tgan avtomobillarni boshqarish.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={18} /> Yangi qo'shish
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        <StatCard 
          title="Jami mijozlar" 
          value={stats.totalClients} 
          icon={<Users size={20} />} 
          color="#4361ee" 
        />
        <StatCard 
          title="Jami avtomobillar" 
          value={stats.totalCars} 
          icon={<Car size={20} />} 
          color="#9b59b6" 
        />
        <StatCard 
          title="Yuridik mijozlar" 
          value={stats.companyClients} 
          icon={<Building size={20} />} 
          color="#f39c12" 
        />
        <StatCard 
          title="Jismoniy mijozlar" 
          value={stats.personClients} 
          icon={<User size={20} />} 
          color="#2ecc71" 
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)' }}>
        {['clients', 'cars'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '8px 16px', backgroundColor: 'transparent', border: 'none', borderBottom: activeTab === tab ? '3px solid var(--primary)' : '3px solid transparent', color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', textTransform: 'capitalize' }}>
            {tab === 'clients' ? <Users size={16} style={{ display: 'inline', marginRight: '6px' }} /> : <Car size={16} style={{ display: 'inline', marginRight: '6px' }} />}
            {tab}
          </button>
        ))}
      </div>

      {/* Filters and Controls Card */}
      <div className="card" style={{ marginBottom: '16px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="input-group" style={{ flex: '2 1 250px', marginBottom: 0 }}>
            <label>Qidirish</label>
            <div className="search-bar">
              <Search size={16} color="var(--text-muted)" />
              <input 
                type="text" 
                placeholder={`Qidirish...`} 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="input-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
            <label>Saralash</label>
            <select 
              value={sortOrder} 
              onChange={(e) => setSortOrder(e.target.value)}
              className="input-field"
            >
              <option value="">Standart saralash</option>
              <option value="-id">Yangi qo'shilganlar</option>
              <option value="id">Eski qo'shilganlar</option>
              {activeTab === 'clients' && (
                <>
                  <option value="name">Nomi (A-Z)</option>
                  <option value="-name">Nomi (Z-A)</option>
                </>
              )}
              {activeTab === 'cars' && (
                <>
                  <option value="plate_number">Davlat raqami (A-Z)</option>
                  <option value="-plate_number">Davlat raqami (Z-A)</option>
                </>
              )}
            </select>
          </div>

          {activeTab === 'clients' && (
            <div className="input-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
              <label>Mijoz turi</label>
              <select 
                value={companyFilter} 
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="input-field"
                
              >
                <option value="">Barcha mijozlar</option>
                <option value="false">Jismoniy mijozlar</option>
                <option value="true">Tashkilot / Tadbirkorlik</option>
              </select>
            </div>
          )}

          {activeTab === 'cars' && (
            <div className="input-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
              <label>Egasi bo'yicha filtrlash</label>
              <SearchableSelect
                value={ownerFilter}
                onChange={v => setOwnerFilter(v)}
                options={clientOptions?.map(c => ({ value: c.id, label: c.name })) || []}
                placeholder="Barcha egalar"
              />
            </div>
          )}

          <button 
            className="btn btn-secondary" 
            onClick={() => {
              setSearchTerm('');
              setSortOrder('');
              setCompanyFilter('');
              setOwnerFilter('');
            }}
            title="Filtrlarni tozalash"
            style={{ opacity: 0.8 }}
          >
            Tozalash
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Clients */}
        {activeTab === 'clients' && (
          clientsLoading ? <div style={{ padding: '48px', textAlign: 'center' }}>Mijozlar yuklanmoqda...</div> : 
          (!clientsData || clientsData.length === 0) ? <div style={{ padding: '48px', textAlign: 'center' }}>Mijozlar topilmadi</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ backgroundColor: 'var(--surface-hover)' }}>
                <tr>
                  <th onClick={() => handleSort('is_company')} style={{ cursor: 'pointer' }}>Turi{getSortIcon('is_company')}</th>
                  <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>Ism / Tashkilot{getSortIcon('name')}</th>
                  <th onClick={() => handleSort('phone_number')} style={{ cursor: 'pointer' }}>Telefon{getSortIcon('phone_number')}</th>
                  <th onClick={() => handleSort('account_number')} style={{ cursor: 'pointer' }}>Hisob raqami{getSortIcon('account_number')}</th>
                  <th style={{ textAlign: 'right' }}>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {clientsData.map(c => (
                  <tr key={c.id}>
                    <td>{c.is_company ? <span className="badge badge-primary">Yuridik shaxs</span> : <span className="badge" style={{ background: 'var(--surface-hover)' }}>Jismoniy shaxs</span>}</td>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>{c.phone_number}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{c.account_number || '-'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button className="btn-icon" onClick={() => openEditModal(c)}><Edit size={18} /></button>
                        <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(c.id, 'clients', 'clients')}><Trash2 size={18} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
        
        {/* Cars */}
        {activeTab === 'cars' && (
          carsLoading ? <div style={{ padding: '48px', textAlign: 'center' }}>Avtomobillar yuklanmoqda...</div> : 
          (!carsData || carsData.length === 0) ? <div style={{ padding: '48px', textAlign: 'center' }}>Avtomobillar topilmadi</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ backgroundColor: 'var(--surface-hover)' }}>
                <tr>
                  <th onClick={() => handleSort('plate_number')} style={{ cursor: 'pointer' }}>Davlat raqami{getSortIcon('plate_number')}</th>
                  <th onClick={() => handleSort('owner__name')} style={{ cursor: 'pointer' }}>Egasi{getSortIcon('owner__name')}</th>
                  <th onClick={() => handleSort('car_type')} style={{ cursor: 'pointer' }}>Avto turi{getSortIcon('car_type')}</th>
                  <th style={{ textAlign: 'right' }}>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {carsData.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600, letterSpacing: '1px' }}>{c.plate_number}</td>
                    <td>{c.owner_name || (clientOptions?.find(cl => cl.id === c.owner)?.name) || (c.owner ? c.owner : '-')}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{c.car_type || '-'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button className="btn-icon" onClick={() => openEditModal(c)}><Edit size={18} /></button>
                        <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(c.id, 'cars', 'cars')}><Trash2 size={18} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* Pagination */}
      {activeTab === 'clients' && (
        <Pagination
          currentPage={clientsResponse?.current_page || clientsPage}
          totalPages={clientsResponse?.total_pages || 1}
          totalCount={clientsResponse?.count || 0}
          pageSize={clientsPageSize}
          onPageChange={setClientsPage}
          onPageSizeChange={(newSize) => {
            setClientsPageSize(newSize);
            setClientsPage(1);
          }}
        />
      )}
      {activeTab === 'cars' && (
        <Pagination
          currentPage={carsResponse?.current_page || carsPage}
          totalPages={carsResponse?.total_pages || 1}
          totalCount={carsResponse?.count || 0}
          pageSize={carsPageSize}
          onPageChange={setCarsPage}
          onPageSizeChange={(newSize) => {
            setCarsPageSize(newSize);
            setCarsPage(1);
          }}
        />
      )}

      {/* MODAL */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="flex-between mb-4">
              <h2>{editingItem ? 'Tahrirlash' : 'Yangi qo\'shish'} {activeTab === 'clients' ? 'Mijoz' : 'Avtomobil'}</h2>
              <button className="btn-icon" onClick={closeModal}><X size={24} /></button>
            </div>
            
            <form onSubmit={handleSubmit}>
              
              {/* Client Form */}
              {activeTab === 'clients' && (
                <>
                  <div className="input-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-main)' }}>
                      <input type="checkbox" name="is_company" checked={formData.is_company || false} onChange={handleInputChange} style={{ width: '18px', height: '18px' }} />
                      <span style={{ fontWeight: 600 }}>Bu Tashkilotmi?</span>
                    </label>
                  </div>
                  <div className="input-group">
                    <label>{formData.is_company ? 'Tashkilot nomi' : 'To\'liq ism'}</label>
                    <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} className="input-field" placeholder="" />
                    {formErrors.name && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{formErrors.name}</span>}
                  </div>
                  <div className="input-group">
                    <label>Telefon raqami</label>
                    <input type="text" name="phone_number" value={formData.phone_number || ''} onChange={handleInputChange} className="input-field" placeholder="+998..." />
                    {formErrors.phone_number && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{formErrors.phone_number}</span>}
                  </div>
                  <div className="input-group" style={{ marginBottom: '24px' }}>
                    <label>Hisob raqami (Ixtiyoriy)</label>
                    <input type="text" name="account_number" value={formData.account_number || ''} onChange={handleInputChange} className="input-field" placeholder="" />
                  </div>
                </>
              )}

              {/* Car Form */}
              {activeTab === 'cars' && (
                <>
                  <div className="input-group">
                    <label>Davlat raqami</label>
                    <input type="text" name="plate_number" value={formData.plate_number || ''} onChange={handleInputChange} className="input-field" placeholder="01 A 123 AA" />
                    {formErrors.plate_number && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{formErrors.plate_number}</span>}
                  </div>
                  <div className="input-group">
                    <label>Egasi (Mijoz) - Ixtiyoriy</label>
                    <SearchableSelect
                      value={formData.owner}
                      onChange={v => setFormData({...formData, owner: v || null})}
                      options={clientOptions?.map(c => ({ value: c.id, label: c.name })) || []}
                      placeholder="Mijoz tanlanmagan (Biriktirilmagan)..."
                    />
                  </div>
                  <div className="input-group" style={{ marginBottom: '24px' }}>
                    <label>Avto turi (Ixtiyoriy)</label>
                    <input type="text" name="car_type" value={formData.car_type || ''} onChange={handleInputChange} className="input-field" placeholder="" />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={closeModal} className="btn btn-secondary">Bekor qilish</button>
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="btn btn-primary" style={{ opacity: (createMutation.isPending || updateMutation.isPending) ? 0.7 : 1 }}>
                  {createMutation.isPending || updateMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Clients;
