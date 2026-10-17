import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Clock, Plus, CheckCircle, AlertTriangle, Printer, Eye, X, 
  Search, RefreshCw, ArrowUpRight, ArrowDownRight, Wallet, User as UserIcon, Calendar, FileText
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useReactToPrint } from 'react-to-print';
import api from '../api';
import useAuthStore from '../store';
import ShiftReceipt from '../components/ShiftReceipt';
import SearchableSelect from '../components/SearchableSelect';
import Pagination from '../components/Pagination';
import { useDebounce } from '../hooks/useDebounce';

const formatMoney = (amount) => {
  return Number(amount || 0).toLocaleString('uz-UZ') + " so'm";
};

export default function Shifts() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebounce(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, userFilter, startDate, endDate]);

  // Modals
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedShiftForClose, setSelectedShiftForClose] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedShiftForDetail, setSelectedShiftForDetail] = useState(null);

  // Open Shift Form
  const [openFormData, setOpenFormData] = useState({
    user: user?.id || '',
    starting_cash: 0,
    notes: ''
  });

  // Close Shift Form
  const [closeFormData, setCloseFormData] = useState({
    actual_cash: '',
    notes: ''
  });

  // Print Ref
  const printReceiptRef = useRef(null);
  const [shiftToPrint, setShiftToPrint] = useState(null);
  const handlePrint = useReactToPrint({
    contentRef: printReceiptRef,
  });

  const triggerPrintShift = (shift) => {
    setShiftToPrint(shift);
    setTimeout(() => {
      handlePrint();
    }, 150);
  };

  // Queries
  const { data: currentShiftData, isLoading: isCurrentLoading } = useQuery({
    queryKey: ['shifts', 'current'],
    queryFn: async () => {
      const res = await api.get('shifts/current/');
      return res.data;
    },
    refetchInterval: 10000,
  });

  const activeShift = currentShiftData?.active ? currentShiftData.shift : null;

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('users/?page_size=200');
      return res.data?.results || (Array.isArray(res.data) ? res.data : []);
    },
  });

  const { data: shiftsResponse, isLoading: isShiftsLoading } = useQuery({
    queryKey: ['shifts', debouncedSearch, statusFilter, userFilter, startDate, endDate, page, pageSize],
    queryFn: async () => {
      let url = `shifts/?page=${page}&page_size=${pageSize}&`;
      if (debouncedSearch) url += `search=${encodeURIComponent(debouncedSearch)}&`;
      if (statusFilter) url += `status=${statusFilter}&`;
      if (userFilter) url += `user=${userFilter}&`;
      if (startDate) url += `start_date=${startDate}&`;
      if (endDate) url += `end_date=${endDate}T23:59:59&`;
      const res = await api.get(url);
      return res.data;
    },
  });

  const shiftsData = shiftsResponse?.results || (Array.isArray(shiftsResponse) ? shiftsResponse : []);

  // Mutations
  const startShiftMutation = useMutation({
    mutationFn: async (payload) => {
      return (await api.post('shifts/start/', payload)).data;
    },
    onSuccess: (data) => {
      toast.success(`Smena #${data.id} muvaffaqiyatli ochildi!`);
      setShowOpenModal(false);
      setOpenFormData({ user: user?.id || '', starting_cash: 0, notes: '' });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (err) => {
      const msg = err.response?.data?.detail || "Smenani ochishda xatolik yuz berdi.";
      toast.error(msg);
    }
  });

  const closeShiftMutation = useMutation({
    mutationFn: async ({ shiftId, payload }) => {
      return (await api.post(`shifts/${shiftId}/close/`, payload)).data;
    },
    onSuccess: (data) => {
      toast.success(`Smena #${data.id} yopildi!`);
      setShowCloseModal(false);
      setSelectedShiftForClose(null);
      setCloseFormData({ actual_cash: '', notes: '' });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      // Ask if user wants to print report
      setSelectedShiftForDetail(data);
      setShowDetailModal(true);
    },
    onError: (err) => {
      const msg = err.response?.data?.detail || "Smenani yopishda xatolik yuz berdi.";
      toast.error(msg);
    }
  });

  const handleOpenShiftSubmit = (e) => {
    e.preventDefault();
    startShiftMutation.mutate({
      user: openFormData.user || user?.id,
      starting_cash: parseFloat(openFormData.starting_cash || 0),
      notes: openFormData.notes
    });
  };

  const handleCloseShiftSubmit = (e) => {
    e.preventDefault();
    if (closeFormData.actual_cash === '' || isNaN(closeFormData.actual_cash)) {
      return toast.error("Kassadagi bor naqd pul miqdorini kiriting!");
    }
    const shiftId = selectedShiftForClose?.id || activeShift?.id;
    if (!shiftId) return toast.error("Yopish uchun smena tanlanmagan.");

    closeShiftMutation.mutate({
      shiftId,
      payload: {
        actual_cash: parseFloat(closeFormData.actual_cash),
        notes: closeFormData.notes
      }
    });
  };

  // Close shift modal calculations
  const shiftToCloseSummary = selectedShiftForClose?.summary || activeShift?.summary;
  const expectedCashForClose = Number(shiftToCloseSummary?.expected_cash || 0);
  const enteredActualCash = closeFormData.actual_cash !== '' ? parseFloat(closeFormData.actual_cash) : null;
  const liveDiff = enteredActualCash !== null ? enteredActualCash - expectedCashForClose : 0;

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Hidden printable receipt */}
      <ShiftReceipt ref={printReceiptRef} shift={shiftToPrint} />

      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0, fontSize: '1.75rem', fontWeight: 700 }}>
            <Clock size={28} color="var(--primary)" /> Smenalar boshqaruvi
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '4px', fontSize: '0.9rem' }}>
            Kassa smenasini ochish (boshlang'ich pul), kutilgan pulni hisoblash va bor pul bilan smenani yopish
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => queryClient.invalidateQueries({ queryKey: ['shifts'] })}
            title="Yangilash"
          >
            <RefreshCw size={18} /> Yangilash
          </button>

          {activeShift ? (
            <button 
              className="btn btn-danger"
              onClick={() => {
                setSelectedShiftForClose(activeShift);
                setCloseFormData({ actual_cash: '', notes: '' });
                setShowCloseModal(true);
              }}
              style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <AlertTriangle size={18} /> Smenani yopish (#{activeShift.id})
            </button>
          ) : (
            <button 
              className="btn btn-primary"
              onClick={() => {
                setOpenFormData({ user: user?.id || '', starting_cash: 0, notes: '' });
                setShowOpenModal(true);
              }}
              style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={18} /> Yangi smena ochish
            </button>
          )}
        </div>
      </div>

      {/* Active Shift Banner / Highlight */}
      {activeShift ? (
        <div style={{ 
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(16, 185, 129, 0.08))', 
          border: '1.5px solid var(--primary)', 
          borderRadius: '16px', 
          padding: '20px 24px', 
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ 
              width: '48px', height: '48px', borderRadius: '12px', 
              background: 'var(--primary)', color: 'white', 
              display: 'flex', alignItems: 'center', justifyContent: 'center' 
            }}>
              <Clock size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                  Joriy smena #{activeShift.id}
                </span>
                <span style={{ 
                  background: 'var(--success-light)', color: 'var(--success)', 
                  padding: '3px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700 
                }}>
                  ● OCHIQ
                </span>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '2px' }}>
                Kassir: <strong>{activeShift.user_name || activeShift.username}</strong> | 
                Ochilgan vaqt: {new Date(activeShift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({activeShift.summary?.duration_str || ''})
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Boshlang'ich pul</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                {formatMoney(activeShift.starting_cash)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Naqd kirim</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)' }}>
                +{formatMoney(activeShift.summary?.total_cash_income || 0)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Naqd chiqim</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--danger)' }}>
                -{formatMoney(activeShift.summary?.total_cash_expense || 0)}
              </div>
            </div>

            <div style={{ padding: '8px 16px', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--primary)', textTransform: 'uppercase', fontWeight: 700 }}>Kutilayotgan naqd pul</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>
                {formatMoney(activeShift.summary?.expected_cash || activeShift.starting_cash)}
              </div>
            </div>

            <button
              className="btn btn-danger"
              onClick={() => {
                setSelectedShiftForClose(activeShift);
                setCloseFormData({ actual_cash: '', notes: '' });
                setShowCloseModal(true);
              }}
            >
              Yopish
            </button>
          </div>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'var(--surface)',
          border: '1px dashed var(--border)',
          borderRadius: '16px',
          padding: '20px 24px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '1rem' }}>Hozirda ochiq smena mavjud emas</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Savdo qilishdan oldin kassa smenasini boshlang'ich kassa summasi bilan oching.</div>
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              setOpenFormData({ user: user?.id || '', starting_cash: 0, notes: '' });
              setShowOpenModal(true);
            }}
          >
            <Plus size={18} /> Smena ochish
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{ 
        backgroundColor: 'var(--surface)', 
        border: '1px solid var(--border)', 
        borderRadius: '14px', 
        padding: '16px 20px', 
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        flexWrap: 'wrap'
      }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Kassir yoki izoh bo'yicha qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px 9px 38px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-color)',
              color: 'var(--text-main)',
              fontSize: '0.88rem'
            }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '9px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-color)',
            color: 'var(--text-main)',
            fontSize: '0.88rem'
          }}
        >
          <option value="">Barcha holatlar</option>
          <option value="OPEN">Faqat Ochiq</option>
          <option value="CLOSED">Faqat Yopiq</option>
        </select>

        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          style={{
            padding: '9px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-color)',
            color: 'var(--text-main)',
            fontSize: '0.88rem'
          }}
        >
          <option value="">Barcha xodimlar</option>
          {usersData?.map(u => (
            <option key={u.id} value={u.id}>{u.first_name || u.username} ({u.phone_number})</option>
          ))}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Dan:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-color)',
              color: 'var(--text-main)',
              fontSize: '0.85rem'
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Gacha:</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-color)',
              color: 'var(--text-main)',
              fontSize: '0.85rem'
            }}
          />
        </div>

        {(statusFilter || userFilter || startDate || endDate || searchQuery) && (
          <button
            className="btn btn-secondary"
            onClick={() => {
              setStatusFilter('');
              setUserFilter('');
              setStartDate('');
              setEndDate('');
              setSearchQuery('');
            }}
            style={{ fontSize: '0.82rem', height: '36px' }}
          >
            Tozalash
          </button>
        )}
      </div>

      {/* Shifts History Table */}
      <div style={{
        backgroundColor: 'var(--surface)',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'rgba(0,0,0,0.02)' }}>
                <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-muted)' }}>ID</th>
                <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-muted)' }}>Xodim</th>
                <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-muted)' }}>Ochilgan vaqt</th>
                <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-muted)' }}>Yopilgan vaqt</th>
                <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-muted)' }}>Boshlang'ich pul</th>
                <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-muted)' }}>Kutilgan pul</th>
                <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-muted)' }}>Bor pul (Sanalgan)</th>
                <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-muted)' }}>Farq (Rasnitsa)</th>
                <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-muted)' }}>Holati</th>
                <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right' }}>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {isShiftsLoading ? (
                <tr>
                  <td colSpan={10} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Yuklanmoqda...
                  </td>
                </tr>
              ) : !shiftsData || shiftsData.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Hech qanday smena topilmadi
                  </td>
                </tr>
              ) : (
                shiftsData.map((shift) => {
                  const isClosed = shift.status === 'CLOSED';
                  const expected = Number(shift.summary?.expected_cash ?? shift.expected_cash ?? 0);
                  const actual = Number(shift.actual_cash || 0);
                  const diff = isClosed ? Number(shift.difference || 0) : (actual > 0 ? actual - expected : 0);

                  return (
                    <tr 
                      key={shift.id} 
                      style={{ 
                        borderBottom: '1px solid var(--border)',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '14px 18px', fontWeight: 700 }}>
                        #{shift.id}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontWeight: 600 }}>{shift.user_name || shift.username}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{shift.user_phone}</div>
                      </td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                        {new Date(shift.opened_at).toLocaleDateString()} {new Date(shift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                        {shift.closed_at ? (
                          `${new Date(shift.closed_at).toLocaleDateString()} ${new Date(shift.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        ) : (
                          <span style={{ color: 'var(--warning)', fontWeight: 600 }}>Hali yopilmagan</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 600 }}>
                        {formatMoney(shift.starting_cash)}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--primary)' }}>
                        {formatMoney(expected)}
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 700 }}>
                        {isClosed ? formatMoney(shift.actual_cash) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        {isClosed ? (
                          diff === 0 ? (
                            <span style={{ 
                              padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700,
                              background: 'var(--success-light)', color: 'var(--success)' 
                            }}>
                              To'g'ri (0)
                            </span>
                          ) : diff > 0 ? (
                            <span style={{ 
                              padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700,
                              background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)' 
                            }}>
                              +{formatMoney(diff)} (Ortiqcha)
                            </span>
                          ) : (
                            <span style={{ 
                              padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700,
                              background: 'var(--danger-light)', color: 'var(--danger)' 
                            }}>
                              {formatMoney(diff)} (Kamomad)
                            </span>
                          )
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Hali hisoblanmadi</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        {shift.status === 'OPEN' ? (
                          <span style={{ 
                            padding: '4px 10px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700,
                            background: 'var(--success-light)', color: 'var(--success)' 
                          }}>
                            ● OCHIQ
                          </span>
                        ) : (
                          <span style={{ 
                            padding: '4px 10px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600,
                            background: 'var(--surface-hover)', color: 'var(--text-muted)' 
                          }}>
                            Yopiq
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button
                            className="btn-icon"
                            onClick={() => {
                              setSelectedShiftForDetail(shift);
                              setShowDetailModal(true);
                            }}
                            title="Tafsilotlar va hisobot"
                          >
                            <Eye size={18} />
                          </button>

                          <button
                            className="btn-icon"
                            onClick={() => triggerPrintShift(shift)}
                            title="Chekni chop etish (Z-Report)"
                          >
                            <Printer size={18} />
                          </button>

                          {shift.status === 'OPEN' && (
                            <button
                              className="btn btn-danger"
                              style={{ height: '32px', padding: '0 10px', fontSize: '0.8rem' }}
                              onClick={() => {
                                setSelectedShiftForClose(shift);
                                setCloseFormData({ actual_cash: '', notes: '' });
                                setShowCloseModal(true);
                              }}
                            >
                              Yopish
                            </button>
                          )}
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

      <Pagination
        currentPage={shiftsResponse?.current_page || page}
        totalPages={shiftsResponse?.total_pages || 1}
        totalCount={shiftsResponse?.count || 0}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
      />

      {/* MODAL 1: Open Shift Modal */}
      {showOpenModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowOpenModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '480px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Clock size={22} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Yangi smena ochish</h3>
              </div>
              <button className="btn-icon" onClick={() => setShowOpenModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleOpenShiftSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '6px' }}>
                  Kassir / Xodim
                </label>
                <select
                  value={openFormData.user}
                  onChange={(e) => setOpenFormData({ ...openFormData, user: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-color)',
                    color: 'var(--text-main)',
                    fontSize: '0.95rem'
                  }}
                  required
                >
                  {usersData?.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.first_name || u.username} ({u.phone_number}) {u.id === user?.id ? "(Siz)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '6px' }}>
                  Boshlang'ich naqd pul (Starting Cash)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={openFormData.starting_cash}
                  onChange={(e) => setOpenFormData({ ...openFormData, starting_cash: e.target.value })}
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
                  required
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                  {[0, 100000, 200000, 500000, 1000000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setOpenFormData({ ...openFormData, starting_cash: amt })}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: openFormData.starting_cash === amt ? 'var(--primary)' : 'var(--surface-hover)',
                        color: openFormData.starting_cash === amt ? 'white' : 'var(--text-main)',
                        fontSize: '0.78rem',
                        cursor: 'pointer'
                      }}
                    >
                      {amt === 0 ? "0 so'm" : `${(amt / 1000).toLocaleString()} ming`}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Smena boshlanishida kassada mavjud bo'lgan naqd pul (qaytim uchun).
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '6px' }}>
                  Izoh (Ixtiyoriy)
                </label>
                <textarea
                  rows="2"
                  value={openFormData.notes}
                  onChange={(e) => setOpenFormData({ ...openFormData, notes: e.target.value })}
                  placeholder="Masalan: Ertalabki smena..."
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-color)',
                    color: 'var(--text-main)',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowOpenModal(false)}>
                  Bekor qilish
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={startShiftMutation.isPending}
                >
                  {startShiftMutation.isPending ? "Ochilmoqda..." : "Smenani ochish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Close Shift Modal (Reconcile Expected vs Actual on Hand) */}
      {showCloseModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowCloseModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '580px', width: '95%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={22} color="var(--danger)" />
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                  Smenani yopish (#{selectedShiftForClose?.id || activeShift?.id})
                </h3>
              </div>
              <button className="btn-icon" onClick={() => setShowCloseModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCloseShiftSubmit}>
              {/* Financial Reconciliation Summary Box */}
              <div style={{
                backgroundColor: 'rgba(0,0,0,0.02)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '16px 20px',
                marginBottom: '20px',
                fontSize: '0.92rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Boshlang'ich kassa:</span>
                  <span style={{ fontWeight: 600 }}>{formatMoney(shiftToCloseSummary?.starting_cash || selectedShiftForClose?.starting_cash)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Naqd savdo va boshqa kirim:</span>
                  <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                    +{formatMoney(shiftToCloseSummary?.total_cash_income || 0)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Naqd chiqimlar:</span>
                  <span style={{ fontWeight: 600, color: 'var(--danger)' }}>
                    -{formatMoney(shiftToCloseSummary?.total_cash_expense || 0)}
                  </span>
                </div>
                <div style={{ borderTop: '1.5px dashed var(--border)', margin: '10px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--primary)' }}>
                    Kutilayotgan naqd pul:
                  </span>
                  <span style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--primary)' }}>
                    {formatMoney(expectedCashForClose)}
                  </span>
                </div>
              </div>

              {/* Input for Money on Hand (Actual Cash) */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.92rem', fontWeight: 700, marginBottom: '6px' }}>
                  Kassadagi bor naqd pul (Sanalgan pul / Money on hand) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={closeFormData.actual_cash}
                  onChange={(e) => setCloseFormData({ ...closeFormData, actual_cash: e.target.value })}
                  placeholder="Kassada sanalgan naqd pulni kiriting..."
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: '2px solid var(--primary)',
                    backgroundColor: 'var(--bg-color)',
                    color: 'var(--text-main)',
                    fontSize: '1.35rem',
                    fontWeight: 800
                  }}
                  autoFocus
                  required
                />

                {/* Quick Difference feedback badge */}
                {enteredActualCash !== null && (
                  <div style={{ 
                    marginTop: '10px', 
                    padding: '10px 14px', 
                    borderRadius: '8px', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    background: liveDiff === 0 ? 'var(--success-light)' : liveDiff > 0 ? 'rgba(99, 102, 241, 0.1)' : 'var(--danger-light)',
                    color: liveDiff === 0 ? 'var(--success)' : liveDiff > 0 ? 'var(--primary)' : 'var(--danger)'
                  }}>
                    <span style={{ fontWeight: 700 }}>
                      {liveDiff === 0 ? "Kassa to'g'ri (Farq yo'q)" : liveDiff > 0 ? "Ortiqcha pul:" : "Kamomad mavjud:"}
                    </span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                      {liveDiff > 0 ? `+${formatMoney(liveDiff)}` : formatMoney(liveDiff)}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '6px' }}>
                  Izoh / Farq sababi (Ixtiyoriy)
                </label>
                <textarea
                  rows="2"
                  value={closeFormData.notes}
                  onChange={(e) => setCloseFormData({ ...closeFormData, notes: e.target.value })}
                  placeholder="Agar kassa farqi bo'lsa, sababini yozing..."
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-color)',
                    color: 'var(--text-main)',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCloseModal(false)}>
                  Bekor qilish
                </button>
                <button 
                  type="submit" 
                  className="btn btn-danger"
                  disabled={closeShiftMutation.isPending}
                >
                  {closeShiftMutation.isPending ? "Yopilmoqda..." : "Smenani yopish va hisoblash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Shift Details & Z-Report View Modal */}
      {showDetailModal && selectedShiftForDetail && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowDetailModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '640px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={22} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                  Smena hisoboti #{selectedShiftForDetail.id}
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => triggerPrintShift(selectedShiftForDetail)}
                  style={{ height: '34px', padding: '0 12px', fontSize: '0.82rem' }}
                >
                  <Printer size={16} /> Chop etish
                </button>
                <button className="btn-icon" onClick={() => setShowDetailModal(false)}>
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Shift Breakdown Card */}
            {(() => {
              const s = selectedShiftForDetail.summary || selectedShiftForDetail;
              const isClosed = selectedShiftForDetail.status === 'CLOSED';
              const startingCash = Number(s.starting_cash || 0);
              const expectedCash = Number(s.expected_cash || 0);
              const actualCash = Number(s.actual_cash || 0);
              const diff = Number(s.difference || (actualCash - expectedCash));

              return (
                <div style={{ fontSize: '0.92rem' }}>
                  {/* Status Banner */}
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    marginBottom: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: isClosed ? 'var(--surface-hover)' : 'var(--success-light)',
                    color: isClosed ? 'var(--text-main)' : 'var(--success)'
                  }}>
                    <div>
                      <strong>Holati: {isClosed ? "Yopiq smena" : "Ochiq smena"}</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Kassir: {s.user_name || selectedShiftForDetail.username}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.82rem' }}>
                      <div>Ochilgan: {new Date(selectedShiftForDetail.opened_at).toLocaleString('uz-UZ')}</div>
                      {selectedShiftForDetail.closed_at && (
                        <div>Yopilgan: {new Date(selectedShiftForDetail.closed_at).toLocaleString('uz-UZ')}</div>
                      )}
                    </div>
                  </div>

                  {/* Cash Reconciliation Grid */}
                  <h4 style={{ margin: '14px 0 8px 0', fontSize: '0.95rem', color: 'var(--primary)', textTransform: 'uppercase' }}>
                    Naqd kassa hisob-kitobi
                  </h4>

                  <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>1. Boshlang'ich kassa:</span>
                      <span style={{ fontWeight: 600 }}>{formatMoney(startingCash)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>2. Naqd savdo tushumi:</span>
                      <span style={{ fontWeight: 600, color: 'var(--success)' }}>+{formatMoney(s.cash_sale_income || 0)}</span>
                    </div>
                    {Number(s.other_cash_income || 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>3. Boshqa naqd kirim:</span>
                        <span style={{ fontWeight: 600, color: 'var(--success)' }}>+{formatMoney(s.other_cash_income)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>4. Naqd chiqimlar:</span>
                      <span style={{ fontWeight: 600, color: 'var(--danger)' }}>-{formatMoney(s.total_cash_expense || 0)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: 'rgba(99, 102, 241, 0.05)', borderBottom: '1px solid var(--border)' }}>
                      <strong style={{ color: 'var(--primary)' }}>Kutilgan naqd pul:</strong>
                      <strong style={{ color: 'var(--primary)', fontSize: '1.1rem' }}>{formatMoney(expectedCash)}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <strong>Kassadagi bor pul (Sanalgan):</strong>
                      <strong style={{ fontSize: '1.1rem' }}>{formatMoney(actualCash)}</strong>
                    </div>

                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      padding: '12px 16px',
                      background: diff === 0 ? 'var(--success-light)' : diff > 0 ? 'rgba(99, 102, 241, 0.1)' : 'var(--danger-light)',
                      color: diff === 0 ? 'var(--success)' : diff > 0 ? 'var(--primary)' : 'var(--danger)'
                    }}>
                      <strong style={{ fontSize: '1rem' }}>
                        Farq / Rasnitsa:
                      </strong>
                      <strong style={{ fontSize: '1.15rem' }}>
                        {diff > 0 ? `+${formatMoney(diff)} (Ortiqcha)` : diff < 0 ? `${formatMoney(diff)} (Kamomad)` : `0 so'm (To'g'ri)`}
                      </strong>
                    </div>
                  </div>

                  {/* Payment Methods and Turnover */}
                  <h4 style={{ margin: '14px 0 8px 0', fontSize: '0.95rem', color: 'var(--text-main)', textTransform: 'uppercase' }}>
                    Savdo va boshqa to'lovlar
                  </h4>

                  <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
                    {s.payment_methods_summary && Object.keys(s.payment_methods_summary).length > 0 && (
                      Object.entries(s.payment_methods_summary).map(([method, amt]) => (
                        <div key={method} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ textTransform: 'capitalize' }}>{method}:</span>
                          <span style={{ fontWeight: 600 }}>{formatMoney(amt)}</span>
                        </div>
                      ))
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Savdolar soni:</span>
                      <span style={{ fontWeight: 600 }}>{s.sales_count || 0} ta</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', backgroundColor: 'var(--surface-hover)' }}>
                      <strong>Jami savdo summasi:</strong>
                      <strong style={{ fontSize: '1.05rem' }}>{formatMoney(s.total_sales_amount || 0)}</strong>
                    </div>
                  </div>

                  {/* Notes */}
                  {(selectedShiftForDetail.notes || s.notes) && (
                    <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'var(--bg-color)', border: '1px solid var(--border)', marginBottom: '16px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Izoh: </span>
                      <span>{selectedShiftForDetail.notes || s.notes}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                    <button className="btn btn-secondary" onClick={() => setShowDetailModal(false)}>
                      Yopish
                    </button>
                    <button className="btn btn-primary" onClick={() => triggerPrintShift(selectedShiftForDetail)}>
                      <Printer size={18} /> Chekni chiqarish
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
