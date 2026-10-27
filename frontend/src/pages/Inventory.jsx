import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Trash2, Edit, AlertCircle, X, Box, AlertTriangle, Layers, Search, Filter, Printer, Minus, Tag, ArrowRightLeft, ArrowRight, PackagePlus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import SearchableSelect from '../components/SearchableSelect';
import Pagination from '../components/Pagination';
import useAuthStore from '../store';

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

function Inventory() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('products');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortOrder, setSortOrder] = useState('');

  // Barcode Printing States
  const [barcodeModalProduct, setBarcodeModalProduct] = useState(null);
  const [barcodePrintQty, setBarcodePrintQty] = useState(1);
  const [selectedBarcode, setSelectedBarcode] = useState('');
  const [isPrintingBarcode, setIsPrintingBarcode] = useState(false);

  // Stock Transfer States
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({
    product: '',
    from_location: 'WAREHOUSE',
    to_location: 'STORE',
    quantity: '',
    note: ''
  });
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferFromFilter, setTransferFromFilter] = useState('');
  const [transferToFilter, setTransferToFilter] = useState('');

  const printViaBrowser = (labelContent, quantity = 1) => {
    if (!labelContent) {
      toast.error("Chop etish uchun etiketka topilmadi");
      return;
    }
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const isSvg = typeof labelContent === 'string' && labelContent.trim().startsWith('<svg');
    const singleLabelHtml = isSvg
      ? labelContent
      : `<img src="${labelContent}" alt="Barcode" />`;

    const pagesHtml = Array.from({ length: qty })
      .map(() => `
        <div class="label-page">
          ${singleLabelHtml}
        </div>
      `)
      .join('');

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title></title>
          <style>
            @page {
              size: 50mm 30mm;
              margin: 0 !important;
            }
            @media print {
              @page {
                size: 50mm 30mm;
                margin: 0 !important;
              }
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                width: 50mm !important;
                height: 30mm !important;
                overflow: hidden !important;
                background: #ffffff !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
            * {
              box-sizing: border-box;
            }
            html, body {
              margin: 0;
              padding: 0;
              background: #fff;
              width: 50mm;
              height: 30mm;
            }
            .label-page {
              width: 50mm;
              height: 30mm;
              page-break-after: always;
              break-after: page;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 0;
              margin: 0;
              overflow: hidden;
              background: #fff;
            }
            .label-page:last-child {
              page-break-after: auto;
              break-after: auto;
            }
            svg {
              width: 50mm;
              height: 30mm;
              display: block;
              shape-rendering: crispEdges;
            }
            img {
              width: 100%;
              height: 100%;
              object-fit: contain;
              image-rendering: -webkit-optimize-contrast;
              image-rendering: crisp-edges;
              image-rendering: pixelated;
            }
          </style>
        </head>
        <body>
          ${pagesHtml}
        </body>
      </html>
    `);
    doc.close();

    iframe.contentWindow.focus();
    setTimeout(() => {
      try {
        iframe.contentWindow.print();
      } catch (e) {
        console.error(e);
      }
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }, 300);
  };

  const handleOpenBarcodeModal = (p) => {
    setBarcodeModalProduct(p);
    setBarcodePrintQty(1);
    const parts = String(p.barcode || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    setSelectedBarcode(parts.length > 0 ? parts[0] : (p.barcode || ''));
  };

  const handlePrintBarcode = async (forceBrowser = false) => {
    if (!barcodeModalProduct) return;
    const qty = parseInt(barcodePrintQty, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Chop etish miqdori 1 yoki undan ortiq bo'lishi kerak");
      return;
    }

    const bcToPrint = selectedBarcode || (barcodeModalProduct.barcode ? String(barcodeModalProduct.barcode).split(',')[0].trim() : '');

    setIsPrintingBarcode(true);
    try {
      if (forceBrowser) {
        const res = await api.post('printers/print-barcode/', {
          product_id: barcodeModalProduct.id,
          quantity: qty,
          barcode: bcToPrint,
          skip_direct: true
        });
        const labelContent = res.data.label_svg || res.data.label_image;
        if (labelContent) {
          printViaBrowser(labelContent, qty);
          toast.success("Windows orqali chop etish oynasi ochildi");
          setBarcodeModalProduct(null);
        } else {
          toast.error("Etiketkani olib bo'lmadi");
        }
        return;
      }

      // 1. Look for direct print first (server or LAN TCP/IP)
      const res = await api.post('printers/print-barcode/', {
        product_id: barcodeModalProduct.id,
        quantity: qty,
        barcode: bcToPrint
      });

      if (res.data.success) {
        toast.success(res.data.detail || `${qty} dona chiziqli belgi printerga yuborildi!`);
        setBarcodeModalProduct(null);
      } else {
        // 2. Direct print not reachable/configured -> Fallback to Windows/Browser print
        toast.info("To'g'ridan-to'g'ri printer ulanmagan. Ushbu qurilma (Windows) orqali chop etilmoqda...");
        const labelContent = res.data.label_svg || res.data.label_image;
        if (labelContent) {
          printViaBrowser(labelContent, qty);
          setBarcodeModalProduct(null);
        } else {
          toast.error(res.data.error || "Printerga ulanib bo'lmadi");
        }
      }
    } catch (err) {
      const fallbackContent = err.response?.data?.label_svg || err.response?.data?.label_image;
      if (fallbackContent) {
        toast.info("To'g'ridan-to'g'ri printer ulanmagan. Windows orqali chop etilmoqda...");
        printViaBrowser(fallbackContent, qty);
        setBarcodeModalProduct(null);
      } else {
        toast.error(err.response?.data?.error || "Printerga yuborishda xatolik yuz berdi");
      }
    } finally {
      setIsPrintingBarcode(false);
    }
  };

  // Extended Filters
  const [categoryFilter, setCategoryFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

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

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedSearch, sortOrder, categoryFilter, unitFilter, minPrice, maxPrice, locationFilter, productFilter, transferFromFilter, transferToFilter]);

  // Backend Stats Query
  const { data: statsData } = useQuery({
    queryKey: ['inventory-stats'],
    queryFn: async () => (await api.get('inventories/stats/')).data
  });

  // Currency Settings Query
  const { data: currencyData } = useQuery({
    queryKey: ['currency-current'],
    queryFn: async () => (await api.get('currency-settings/current/')).data
  });
  const usdRate = parseFloat(currencyData?.rate_in_uzs) || 12500;

  // Dropdown options lists (uncapped up to 500)
  const { data: allCategoriesData } = useQuery({ 
    queryKey: ['all-categories'], 
    queryFn: async () => (await api.get('categories/?page_size=500')).data.results 
  });

  const { data: allUnitsData } = useQuery({ 
    queryKey: ['all-units'], 
    queryFn: async () => (await api.get('units/?page_size=500')).data.results 
  });

  const loadProductOptions = async (inputValue) => {
    try {
      const res = await api.get(`products/?search=${encodeURIComponent(inputValue || '')}&page_size=50`);
      return (res.data.results || []).map(p => {
        const costUsd = p.cost_price_usd ? parseFloat(p.cost_price_usd) : (parseFloat(p.cost_price) / usdRate);
        const sellUsd = p.selling_price_usd ? parseFloat(p.selling_price_usd) : (parseFloat(p.selling_price) / usdRate);
        return {
          value: p.id,
          label: `${p.name}${p.barcode ? ` (${p.barcode})` : ''} - Tan: $${costUsd.toFixed(2)} (${parseFloat(p.cost_price).toLocaleString()} so'm) / Sotuv: $${sellUsd.toFixed(2)} (${parseFloat(p.selling_price).toLocaleString()} so'm)`,
          product: p
        };
      });
    } catch (e) {
      return [];
    }
  };

  // Paginated Queries
  const { data: productsResponse, isLoading: prodsLoading } = useQuery({ 
    queryKey: ['products', debouncedSearch, sortOrder, categoryFilter, unitFilter, minPrice, maxPrice, page, pageSize], 
    queryFn: async () => {
      let url = `products/?page=${page}&page_size=${pageSize}&search=${encodeURIComponent(debouncedSearch)}&ordering=${sortOrder}&`;
      if (categoryFilter) url += `category=${categoryFilter}&`;
      if (unitFilter) url += `unit=${unitFilter}&`;
      if (minPrice) url += `min_price=${minPrice}&`;
      if (maxPrice) url += `max_price=${maxPrice}&`;
      return (await api.get(url)).data;
    }
  });
  const productsData = productsResponse?.results || [];
  
  const { data: categoriesResponse, isLoading: catsLoading } = useQuery({ 
    queryKey: ['categories', debouncedSearch, sortOrder, page, pageSize], 
    queryFn: async () => (await api.get(`categories/?page=${page}&page_size=${pageSize}&search=${encodeURIComponent(debouncedSearch)}&ordering=${sortOrder}`)).data 
  });
  const categoriesData = categoriesResponse?.results || [];

  const { data: inventoryResponse, isLoading: invLoading } = useQuery({ 
    queryKey: ['inventories', debouncedSearch, sortOrder, locationFilter, productFilter, page, pageSize], 
    queryFn: async () => {
      let url = `inventories/?page=${page}&page_size=${pageSize}&search=${encodeURIComponent(debouncedSearch)}&ordering=${sortOrder}&`;
      if (locationFilter) url += `location=${locationFilter}&`;
      if (productFilter) url += `product=${productFilter}&`;
      return (await api.get(url)).data;
    } 
  });
  const inventoryData = inventoryResponse?.results || [];

  const { data: unitsResponse, isLoading: unitsLoading } = useQuery({ 
    queryKey: ['units', debouncedSearch, sortOrder, page, pageSize], 
    queryFn: async () => (await api.get(`units/?page=${page}&page_size=${pageSize}&search=${encodeURIComponent(debouncedSearch)}&ordering=${sortOrder}`)).data 
  });
  const unitsData = unitsResponse?.results || [];

  const { data: transfersResponse, isLoading: transfersLoading } = useQuery({ 
    queryKey: ['stock-transfers', debouncedSearch, sortOrder, transferFromFilter, transferToFilter, productFilter, page, pageSize], 
    queryFn: async () => {
      let url = `stock-transfers/?page=${page}&page_size=${pageSize}&search=${encodeURIComponent(debouncedSearch)}&ordering=${sortOrder}&`;
      if (transferFromFilter) url += `from_location=${transferFromFilter}&`;
      if (transferToFilter) url += `to_location=${transferToFilter}&`;
      if (productFilter) url += `product=${productFilter}&`;
      return (await api.get(url)).data;
    } 
  });
  const transfersData = transfersResponse?.results || [];

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: async ({ id, endpoint }) => await api.delete(`${endpoint}/${id}/`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [variables.queryKey] });
      queryClient.invalidateQueries({ queryKey: ['inventories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stats'] });
      toast.success("Muvaffaqiyatli o'chirildi");
    },
    onError: () => toast.error("O'chirishda xatolik yuz berdi")
  });

  const createMutation = useMutation({
    mutationFn: async ({ endpoint, payload }) => await api.post(`${endpoint}/`, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [variables.queryKey] });
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['inventories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stats'] });
      queryClient.invalidateQueries({ queryKey: ['all-categories'] });
      queryClient.invalidateQueries({ queryKey: ['all-units'] });
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
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['inventories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stats'] });
      queryClient.invalidateQueries({ queryKey: ['all-categories'] });
      queryClient.invalidateQueries({ queryKey: ['all-units'] });
      toast.success('Muvaffaqiyatli yangilandi!');
      closeModal();
    },
    onError: (err) => {
      toast.error('Yangilashda xatolik.');
      if (err.response?.data) setFormErrors(err.response.data);
    }
  });

  const handleDelete = (id, endpoint, queryKey) => {
    if (window.confirm("Ushbu elementni o'chirishga ishonchingiz komilmi? Bu amalni ortga qaytarib bo'lmaydi.")) {
      deleteMutation.mutate({ id, endpoint, queryKey });
    }
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    if (activeTab === 'products') {
      const cost_usd = item.cost_price_usd ? parseFloat(item.cost_price_usd) : (item.cost_price ? parseFloat((item.cost_price / usdRate).toFixed(4)) : '');
      const sell_usd = item.selling_price_usd ? parseFloat(item.selling_price_usd) : (item.selling_price ? parseFloat((item.selling_price / usdRate).toFixed(4)) : '');
      setFormData({
        ...item,
        cost_price: item.cost_price || '',
        selling_price: item.selling_price || '',
        cost_price_usd: cost_usd,
        selling_price_usd: sell_usd,
      });
    } else {
      setFormData(item);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setFormData({});
    setFormErrors({});
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors(prev => ({ ...prev, [name]: null }));
  };

  const handlePriceChange = (field, value) => {
    if (field === 'cost_price_usd') {
      const val = value;
      const uzs = val !== '' && !isNaN(val) ? Math.round(parseFloat(val) * usdRate) : '';
      setFormData(prev => ({ ...prev, cost_price_usd: val, cost_price: uzs }));
      if (formErrors.cost_price) setFormErrors(prev => ({ ...prev, cost_price: null }));
    } else if (field === 'cost_price') {
      const val = value;
      const usd = val !== '' && !isNaN(val) && usdRate ? parseFloat((parseFloat(val) / usdRate).toFixed(4)) : '';
      setFormData(prev => ({ ...prev, cost_price: val, cost_price_usd: usd }));
      if (formErrors.cost_price) setFormErrors(prev => ({ ...prev, cost_price: null }));
    } else if (field === 'selling_price_usd') {
      const val = value;
      const uzs = val !== '' && !isNaN(val) ? Math.round(parseFloat(val) * usdRate) : '';
      setFormData(prev => ({ ...prev, selling_price_usd: val, selling_price: uzs }));
      if (formErrors.selling_price) setFormErrors(prev => ({ ...prev, selling_price: null }));
    } else if (field === 'selling_price') {
      const val = value;
      const usd = val !== '' && !isNaN(val) && usdRate ? parseFloat((parseFloat(val) / usdRate).toFixed(4)) : '';
      setFormData(prev => ({ ...prev, selling_price: val, selling_price_usd: usd }));
      if (formErrors.selling_price) setFormErrors(prev => ({ ...prev, selling_price: null }));
    }
  };

  const validateForm = () => {
    let errors = {};
    if (activeTab === 'categories') {
      if (!formData.name) errors.name = 'Toifa nomi majburiy';
    } else if (activeTab === 'units') {
      if (!formData.name) errors.name = 'Birlik nomi majburiy';
      if (!formData.short_name) errors.short_name = 'Qisqartma nomi majburiy';
    } else if (activeTab === 'products') {
      if (!formData.name) errors.name = 'Mahsulot nomi majburiy';
      if (!formData.category) errors.category = 'Toifa majburiy';
      if (!formData.unit) errors.unit = 'Birlik majburiy';
      const cost = parseFloat(formData.cost_price || 0);
      const cost_usd = parseFloat(formData.cost_price_usd || 0);
      if (cost <= 0 && cost_usd <= 0) errors.cost_price = 'To\'g\'ri tan narx kiritilishi shart';
      const sell = parseFloat(formData.selling_price || 0);
      const sell_usd = parseFloat(formData.selling_price_usd || 0);
      if (sell <= 0 && sell_usd <= 0) errors.selling_price = 'To\'g\'ri sotuv narx kiritilishi shart';
    } else if (activeTab === 'stock') {
      if (!formData.product) errors.product = 'Mahsulot majburiy';
      if (!formData.location) errors.location = 'Joylashuv majburiy';
      if (!formData.quantity || parseFloat(formData.quantity) <= 0) errors.quantity = 'To\'g\'ri miqdor kiritilishi shart';
      const cost = parseFloat(formData.cost_price || 0);
      const cost_usd = parseFloat(formData.cost_price_usd || 0);
      if (cost <= 0 && cost_usd <= 0) errors.cost_price = 'To\'g\'ri tan narx kiritilishi shart';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    let endpoint = activeTab;
    let queryKey = activeTab;
    let payload = { ...formData };
    
    if (activeTab === 'products') {
      if (payload.cost_price_usd && !payload.cost_price) {
        payload.cost_price = Math.round(parseFloat(payload.cost_price_usd) * usdRate);
      } else if (payload.cost_price && !payload.cost_price_usd) {
        payload.cost_price_usd = parseFloat((parseFloat(payload.cost_price) / usdRate).toFixed(4));
      }
      if (payload.selling_price_usd && !payload.selling_price) {
        payload.selling_price = Math.round(parseFloat(payload.selling_price_usd) * usdRate);
      } else if (payload.selling_price && !payload.selling_price_usd) {
        payload.selling_price_usd = parseFloat((parseFloat(payload.selling_price) / usdRate).toFixed(4));
      }
    } else if (activeTab === 'stock') {
      const finalCost = payload.cost_price || (payload.cost_price_usd ? Math.round(parseFloat(payload.cost_price_usd) * usdRate) : 0);
      const finalCostUsd = payload.cost_price_usd || (payload.cost_price ? parseFloat((parseFloat(payload.cost_price) / usdRate).toFixed(4)) : 0);

      if (editingItem) {
        endpoint = 'inventories';
        queryKey = 'inventories';
      } else {
        endpoint = 'receipts';
        queryKey = 'inventories';
        payload = {
          user: user?.id || null, 
          note: formData.note || '',
          items: [{
            product: formData.product,
            location: formData.location,
            quantity: formData.quantity,
            cost_price: finalCost,
            cost_price_usd: finalCostUsd,
          }]
        };
      }
    }

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, endpoint, queryKey, payload });
    } else {
      createMutation.mutate({ endpoint, queryKey, payload });
    }
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-color)', color: 'var(--text-main)', fontSize: '1rem', marginTop: '6px' };
  const errorStyle = { color: 'var(--danger)', fontSize: '0.85rem', marginTop: '4px', display: 'block' };

  const { data: transferProductStock } = useQuery({
    queryKey: ['transfer-product-stock', transferForm.product],
    queryFn: async () => (await api.get(`inventories/?product=${transferForm.product}&page_size=10`)).data.results,
    enabled: !!transferForm.product
  });

  const selectedProductStock = useMemo(() => {
    if (!transferForm.product || !transferProductStock) return null;
    const warehouse = transferProductStock.find(i => i.location === 'WAREHOUSE')?.quantity || 0;
    const store = transferProductStock.find(i => i.location === 'STORE')?.quantity || 0;
    return {
      warehouse: parseFloat(warehouse),
      store: parseFloat(store),
      total: parseFloat(warehouse) + parseFloat(store)
    };
  }, [transferForm.product, transferProductStock]);

  const maxAvailableQty = useMemo(() => {
    if (!selectedProductStock) return 0;
    if (transferForm.from_location === 'EXTERNAL') return 999999999;
    return transferForm.from_location === 'WAREHOUSE' 
      ? selectedProductStock.warehouse 
      : selectedProductStock.store;
  }, [selectedProductStock, transferForm.from_location]);

  const openTransferModal = (inventoryItem = null, defaultFrom = 'WAREHOUSE') => {
    if (inventoryItem) {
      const fromLoc = inventoryItem.location;
      const toLoc = fromLoc === 'WAREHOUSE' ? 'STORE' : 'WAREHOUSE';
      setTransferForm({
        product: inventoryItem.product,
        from_location: fromLoc,
        to_location: toLoc,
        quantity: '',
        note: ''
      });
    } else {
      setTransferForm({
        product: '',
        from_location: defaultFrom,
        to_location: defaultFrom === 'STORE' ? 'WAREHOUSE' : (defaultFrom === 'EXTERNAL' ? 'WAREHOUSE' : 'STORE'),
        quantity: '',
        note: ''
      });
    }
    setIsTransferModalOpen(true);
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    if (!transferForm.product) {
      return toast.error("Iltimos, mahsulotni tanlang");
    }
    const qty = parseFloat(transferForm.quantity);
    if (isNaN(qty) || qty <= 0) {
      return toast.error("Miqdor 0 dan katta bo'lishi kerak");
    }
    const isFromExternal = transferForm.from_location === 'EXTERNAL';
    if (!isFromExternal && qty > maxAvailableQty) {
      const locName = transferForm.from_location === 'WAREHOUSE' ? 'Sklad' : 'Magazin';
      return toast.error(`${locName}da yetarli qoldiq yo'q! Mavjud: ${maxAvailableQty}`);
    }

    setTransferLoading(true);
    try {
      const payload = {
        product: parseInt(transferForm.product),
        from_location: transferForm.from_location,
        to_location: transferForm.to_location,
        quantity: qty,
        note: transferForm.note || ''
      };
      await api.post('stock-transfers/', payload);
      await queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      await queryClient.invalidateQueries({ queryKey: ['inventories'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory-stats'] });
      await queryClient.invalidateQueries({ queryKey: ['transfer-product-stock'] });
      toast.success(isFromExternal ? "Yangi kirim muvaffaqiyatli saqlandi!" : "Mahsulot muvaffaqiyatli o'tkazildi!");
      setIsTransferModalOpen(false);
      setTransferForm({ product: '', from_location: 'WAREHOUSE', to_location: 'STORE', quantity: '', note: '' });
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || "O'tkazishda xatolik yuz berdi";
      toast.error(msg);
    } finally {
      setTransferLoading(false);
    }
  };

  const stats = useMemo(() => {
    const totalProducts = statsData?.total_products ?? 0;
    const totalCategories = statsData?.total_categories ?? 0;
    const totalStock = statsData?.total_stock ?? 0;
    const lowStock = statsData?.low_stock ?? 0;
    const totalTransfers = statsData?.total_transfers ?? 0;
    return { totalProducts, totalCategories, totalStock, lowStock, totalTransfers };
  }, [statsData]);

  return (
    <div style={{ padding: '16px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', color: 'var(--primary)', marginBottom: '4px' }}>Ombor boshqaruvi</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Mahsulotlar, toifalar, qoldiqlar, yangi kirimlar va o'tkazmalarni boshqarish.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => openTransferModal()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowRightLeft size={16} /> Mahsulot o'tkazish / Kirim
          </button>
          <button 
            className="btn btn-primary" 
            onClick={() => {
              if (activeTab === 'transfers') {
                openTransferModal();
              } else {
                setIsModalOpen(true);
              }
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={18} /> {activeTab === 'transfers' ? "O'tkazma / Kirim qilish" : "Yangi qo'shish"}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        <StatCard 
          title="Jami mahsulotlar" 
          value={stats.totalProducts} 
          icon={<Package size={20} />} 
          color="#4361ee" 
        />
        <StatCard 
          title="Jami toifalar" 
          value={stats.totalCategories} 
          icon={<Layers size={20} />} 
          color="#9b59b6" 
        />
        <StatCard 
          title="Ombordagi jami mahsulotlar" 
          value={stats.totalStock.toLocaleString()} 
          icon={<Box size={20} />} 
          color="#2ecc71" 
        />
        <StatCard 
          title="Kam qoldiq ogohlantirishlari" 
          value={stats.lowStock} 
          icon={<AlertTriangle size={20} />} 
          color="#e74c3c" 
        />
        <StatCard 
          title="Harakatlar tarixi" 
          value={stats.totalTransfers} 
          icon={<ArrowRightLeft size={20} />} 
          color="#8b5cf6" 
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)' }}>
        {['mahsulotlar', 'toifalar', 'birliklar', 'qoldiqlar', "harakatlar tarixi"].map((tab, idx) => {
          const tabKey = ['products', 'categories', 'units', 'stock', 'transfers'][idx];
          return (
          <button key={tabKey} onClick={() => setActiveTab(tabKey)} style={{ padding: '8px 16px', backgroundColor: 'transparent', border: 'none', borderBottom: activeTab === tabKey ? '3px solid var(--primary)' : '3px solid transparent', color: activeTab === tabKey ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {tabKey === 'transfers' && <ArrowRightLeft size={15} />}
            {tab}
          </button>
        )})}
      </div>

      {/* Filters and Controls Bar */}
      <div className="card" style={{ marginBottom: '16px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {/* Search */}
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

          {/* Sorting */}
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
              {activeTab === 'products' && (
                <>
                  <option value="name">Nomi (A-Z)</option>
                  <option value="-name">Nomi (Z-A)</option>
                  <option value="-selling_price">Narx (Qimmatdan arzonga)</option>
                  <option value="selling_price">Narx (Arzondan qimmatga)</option>
                </>
              )}
              {activeTab === 'stock' && (
                <>
                  <option value="-quantity">Eng ko'p qoldiq</option>
                  <option value="quantity">Eng kam qoldiq</option>
                </>
              )}
              {activeTab === 'transfers' && (
                <>
                  <option value="-id">Yangi o'tkazilganlar</option>
                  <option value="id">Eski o'tkazilganlar</option>
                  <option value="-quantity">Katta miqdor</option>
                  <option value="quantity">Kichik miqdor</option>
                </>
              )}
            </select>
          </div>

          {/* Products Specific Filters */}
          {activeTab === 'products' && (
            <>
              <div className="input-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
                <label>Toifa</label>
                <SearchableSelect
                  value={categoryFilter}
                  onChange={v => setCategoryFilter(v)}
                  options={allCategoriesData?.map(c => ({ value: c.id, label: c.name })) || []}
                  placeholder="Barcha toifalar"
                />
              </div>

              <div className="input-group" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                <label>O'lchov birligi</label>
                <SearchableSelect
                  value={unitFilter}
                  onChange={v => setUnitFilter(v)}
                  options={allUnitsData?.map(u => ({ value: u.id, label: `${u.name} (${u.short_name})` })) || []}
                  placeholder="Barcha birliklar"
                />
              </div>

              <button 
                className="btn btn-secondary"
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{ whiteSpace: 'nowrap' }}
              >
                Narx oralig'i {showAdvanced ? '▲' : '▼'}
              </button>
            </>
          )}

          {/* Stock Specific Filters */}
          {activeTab === 'stock' && (
            <>
              <div className="input-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
                <label>Joylashuv</label>
                <select 
                  value={locationFilter}
                  onChange={e => setLocationFilter(e.target.value)}
                  className="input-field"
                >
                  <option value="">Barcha joylashuvlar</option>
                  <option value="WAREHOUSE">Sklad</option>
                  <option value="STORE">Magazin</option>
                </select>
              </div>

              <div className="input-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                <label>Mahsulot</label>
                <SearchableSelect
                  value={productFilter}
                  onChange={v => setProductFilter(v)}
                  isAsync
                  loadOptions={loadProductOptions}
                  placeholder="Barcha mahsulotlar"
                />
              </div>
            </>
          )}

          {/* Transfers Specific Filters */}
          {activeTab === 'transfers' && (
            <>
              <div className="input-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
                <label>Qayerdan / Manba</label>
                <select 
                  value={transferFromFilter}
                  onChange={e => setTransferFromFilter(e.target.value)}
                  className="input-field"
                >
                  <option value="">Barchasi</option>
                  <option value="EXTERNAL">Tashqaridan (Yangi kirim)</option>
                  <option value="WAREHOUSE">Sklad</option>
                  <option value="STORE">Magazin</option>
                </select>
              </div>

              <div className="input-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
                <label>Qayerga</label>
                <select 
                  value={transferToFilter}
                  onChange={e => setTransferToFilter(e.target.value)}
                  className="input-field"
                >
                  <option value="">Barchasi</option>
                  <option value="STORE">Magazin</option>
                  <option value="WAREHOUSE">Sklad</option>
                </select>
              </div>

              <div className="input-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                <label>Mahsulot</label>
                <SearchableSelect
                  value={productFilter}
                  onChange={v => setProductFilter(v)}
                  isAsync
                  loadOptions={loadProductOptions}
                  placeholder="Barcha mahsulotlar"
                />
              </div>
            </>
          )}

          <button 
            className="btn btn-secondary" 
            onClick={() => {
              setSearchTerm('');
              setSortOrder('');
              setCategoryFilter('');
              setUnitFilter('');
              setMinPrice('');
              setMaxPrice('');
              setLocationFilter('');
              setProductFilter('');
              setTransferFromFilter('');
              setTransferToFilter('');
            }}
            title="Filtrlarni tozalash"
            style={{ opacity: 0.8 }}
          >
            Tozalash
          </button>
        </div>

        {/* Collapsible Price Range for Products */}
        {activeTab === 'products' && showAdvanced && (
          <div style={{ display: 'flex', gap: '16px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            <div className="input-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
              <label>Eng kam sotuv narxi (SO'M)</label>
              <input 
                type="number" 
                placeholder="Min..." 
                value={minPrice} 
                onChange={e => setMinPrice(e.target.value)} 
                className="input-field"
              />
            </div>
            <div className="input-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
              <label>Eng ko'p sotuv narxi (SO'M)</label>
              <input 
                type="number" 
                placeholder="Max..." 
                value={maxPrice} 
                onChange={e => setMaxPrice(e.target.value)} 
                className="input-field"
              />
            </div>
          </div>
        )}
      </div>

      {/* Tables... */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Products */}
        {activeTab === 'products' && (
          prodsLoading ? <div style={{ padding: '48px', textAlign: 'center' }}>Mahsulotlar yuklanmoqda...</div> : 
          (!productsData || productsData.length === 0) ? <div style={{ padding: '48px', textAlign: 'center' }}>Mahsulotlar topilmadi</div> : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ backgroundColor: 'var(--surface-hover)' }}>
                  <tr>
                    <th onClick={() => handleSort('name')} style={{ cursor: 'pointer', padding: '16px' }}>Nomi{getSortIcon('name')}</th>
                    <th onClick={() => handleSort('barcode')} style={{ cursor: 'pointer', padding: '16px' }}>Chiziqli belgi{getSortIcon('barcode')}</th>
                    <th onClick={() => handleSort('cost_price')} style={{ cursor: 'pointer', padding: '16px' }}>Tan narxi ($ / UZS){getSortIcon('cost_price')}</th>
                    <th onClick={() => handleSort('selling_price')} style={{ cursor: 'pointer', padding: '16px' }}>Sotuv narxi ($ / UZS){getSortIcon('selling_price')}</th>
                    <th onClick={() => handleSort('total_quantity')} style={{ cursor: 'pointer', padding: '16px' }}>Jami qoldiq{getSortIcon('total_quantity')}</th>
                    <th style={{ textAlign: 'right', padding: '16px' }}>Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {productsData.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ fontWeight: 600, padding: '16px' }}>{p.name}</td>
                      <td style={{ color: 'var(--text-muted)', padding: '16px' }}>{p.barcode || '-'}</td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                          ${parseFloat(p.cost_price_usd || (parseFloat(p.cost_price) / usdRate)).toFixed(2)}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {parseFloat(p.cost_price).toLocaleString()} so'm
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--primary)' }}>
                          ${parseFloat(p.selling_price_usd || (parseFloat(p.selling_price) / usdRate)).toFixed(2)}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {parseFloat(p.selling_price).toLocaleString()} so'm
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{ padding: '4px 12px', borderRadius: '16px', backgroundColor: parseFloat(p.total_quantity) > parseFloat(p.low_stock_threshold || 10) ? 'rgba(46, 204, 113, 0.2)' : 'rgba(231, 76, 60, 0.2)', color: parseFloat(p.total_quantity) > parseFloat(p.low_stock_threshold || 10) ? '#2ecc71' : '#e74c3c', fontWeight: 'bold' }}>
                          {parseFloat(p.total_quantity)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', padding: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button 
                            className="btn-icon" 
                            title="Chiziqli belgi (Barcode) chop etish"
                            style={{ color: 'var(--primary)' }}
                            onClick={() => handleOpenBarcodeModal(p)}
                          >
                            <Printer size={18} />
                          </button>
                          <button className="btn-icon" onClick={() => openEditModal(p)}><Edit size={18} /></button>
                          <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(p.id, 'products', 'products')}><Trash2 size={18} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                currentPage={productsResponse?.current_page || page}
                totalPages={productsResponse?.total_pages || 1}
                totalItems={productsResponse?.count || 0}
                pageSize={pageSize}
                onPageChange={(p) => setPage(p)}
                onPageSizeChange={(sz) => { setPageSize(sz); setPage(1); }}
              />
            </>
          )
        )}
        
        {/* Categories */}
        {activeTab === 'categories' && (
          catsLoading ? <div style={{ padding: '48px', textAlign: 'center' }}>Yuklanmoqda...</div> : 
          (!categoriesData || categoriesData.length === 0) ? <div style={{ padding: '48px', textAlign: 'center' }}>Toifalar topilmadi</div> : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ backgroundColor: 'var(--bg-color)', color: 'var(--text-muted)' }}>
                  <tr>
                    <th onClick={() => handleSort('id')} style={{ padding: '16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>ID{getSortIcon('id')}</th>
                    <th onClick={() => handleSort('name')} style={{ padding: '16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>Nomi{getSortIcon('name')}</th>
                    <th onClick={() => handleSort('products_count')} style={{ padding: '16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>Mahsulotlar soni{getSortIcon('products_count')}</th>
                    <th style={{ padding: '16px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {categoriesData.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '16px', color: 'var(--text-muted)' }}>#{c.id}</td>
                      <td style={{ padding: '16px', fontWeight: 500 }}>{c.name}</td>
                      <td style={{ padding: '16px' }}>{c.products_count}</td>
                      <td style={{ padding: '16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button className="btn-icon" onClick={() => openEditModal(c)}><Edit size={18} /></button>
                          <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(c.id, 'categories', 'categories')}><Trash2 size={18} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                currentPage={categoriesResponse?.current_page || page}
                totalPages={categoriesResponse?.total_pages || 1}
                totalItems={categoriesResponse?.count || 0}
                pageSize={pageSize}
                onPageChange={(p) => setPage(p)}
                onPageSizeChange={(sz) => { setPageSize(sz); setPage(1); }}
              />
            </>
          )
        )}

        {/* Units */}
        {activeTab === 'units' && (
          unitsLoading ? <div style={{ padding: '48px', textAlign: 'center' }}>Yuklanmoqda...</div> : 
          (!unitsData || unitsData.length === 0) ? <div style={{ padding: '48px', textAlign: 'center' }}>Birliklar topilmadi</div> : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ backgroundColor: 'var(--bg-color)', color: 'var(--text-muted)' }}>
                  <tr>
                    <th onClick={() => handleSort('name')} style={{ padding: '16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>Nomi{getSortIcon('name')}</th>
                    <th onClick={() => handleSort('short_name')} style={{ padding: '16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>Qisqartma{getSortIcon('short_name')}</th>
                    <th style={{ padding: '16px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {unitsData.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '16px', fontWeight: 500 }}>{u.name}</td>
                      <td style={{ padding: '16px', color: 'var(--text-muted)' }}>{u.short_name}</td>
                      <td style={{ padding: '16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button className="btn-icon" onClick={() => openEditModal(u)}><Edit size={18} /></button>
                          <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(u.id, 'units', 'units')}><Trash2 size={18} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                currentPage={unitsResponse?.current_page || page}
                totalPages={unitsResponse?.total_pages || 1}
                totalItems={unitsResponse?.count || 0}
                pageSize={pageSize}
                onPageChange={(p) => setPage(p)}
                onPageSizeChange={(sz) => { setPageSize(sz); setPage(1); }}
              />
            </>
          )
        )}

        {/* Stock */}
        {activeTab === 'stock' && (
          invLoading ? <div style={{ padding: '48px', textAlign: 'center' }}>Yuklanmoqda...</div> : 
          (!inventoryData || inventoryData.length === 0) ? <div style={{ padding: '48px', textAlign: 'center' }}>Qoldiqlar topilmadi</div> : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ backgroundColor: 'var(--bg-color)', color: 'var(--text-muted)' }}>
                  <tr>
                    <th onClick={() => handleSort('product__name')} style={{ padding: '16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>Mahsulot{getSortIcon('product__name')}</th>
                    <th onClick={() => handleSort('location')} style={{ padding: '16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>Joylashuv{getSortIcon('location')}</th>
                    <th onClick={() => handleSort('quantity')} style={{ padding: '16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>Miqdor{getSortIcon('quantity')}</th>
                    <th style={{ padding: '16px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryData.map(i => (
                    <tr key={i.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '16px', fontWeight: 500 }}>
                        <div>{i.product_name || i.product}</div>
                        {i.product_barcode && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {i.product_barcode}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{ 
                          padding: '3px 10px', 
                          borderRadius: '6px', 
                          backgroundColor: i.location === 'WAREHOUSE' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(139, 92, 246, 0.12)',
                          color: i.location === 'WAREHOUSE' ? '#3b82f6' : '#8b5cf6',
                          fontWeight: 600,
                          fontSize: '0.85rem'
                        }}>
                          {i.location === 'WAREHOUSE' ? 'Sklad' : 'Magazin'}
                        </span>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{ padding: '4px 12px', borderRadius: '16px', backgroundColor: i.quantity > 10 ? 'rgba(46, 204, 113, 0.2)' : 'rgba(231, 76, 60, 0.2)', color: i.quantity > 10 ? '#2ecc71' : '#e74c3c', fontWeight: 'bold' }}>
                          {i.quantity} {i.unit_name}
                        </span>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button 
                            className="btn-icon" 
                            style={{ color: 'var(--primary)' }}
                            title="Boshqa joylashuvga o'tkazish"
                            onClick={() => openTransferModal(i)}
                          >
                            <ArrowRightLeft size={18} />
                          </button>
                          <button className="btn-icon" onClick={() => openEditModal(i)}><Edit size={18} /></button>
                          <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(i.id, 'inventories', 'inventories')}><Trash2 size={18} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                currentPage={inventoryResponse?.current_page || page}
                totalPages={inventoryResponse?.total_pages || 1}
                totalItems={inventoryResponse?.count || 0}
                pageSize={pageSize}
                onPageChange={(p) => setPage(p)}
                onPageSizeChange={(sz) => { setPageSize(sz); setPage(1); }}
              />
            </>
          )
        )}

        {/* Transfers & Inflows */}
        {activeTab === 'transfers' && (
          transfersLoading ? <div style={{ padding: '48px', textAlign: 'center' }}>Harakatlar tarixi yuklanmoqda...</div> : 
          (!transfersData || transfersData.length === 0) ? (
            <div style={{ padding: '48px', textAlign: 'center' }}>
              <div style={{ marginBottom: '12px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'center' }}>
                <ArrowRightLeft size={36} />
              </div>
              <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '1.1rem' }}>Hozircha harakatlar tarixi mavjud emas</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>Sklad va Magazin o'rtasida o'tkazish yoki tashqaridan yangi kirim qilish uchun yangi harakat yarating.</p>
              <button className="btn btn-primary" onClick={() => openTransferModal()}>
                <Plus size={16} /> Birinchi harakatni amalga oshirish
              </button>
            </div>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ backgroundColor: 'var(--bg-color)', color: 'var(--text-muted)' }}>
                  <tr>
                    <th onClick={() => handleSort('id')} style={{ padding: '16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      Sana va vaqt{getSortIcon('id')}
                    </th>
                    <th onClick={() => handleSort('product__name')} style={{ padding: '16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      Mahsulot{getSortIcon('product__name')}
                    </th>
                    <th style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
                      Yo'nalish / Manba
                    </th>
                    <th onClick={() => handleSort('quantity')} style={{ padding: '16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      Miqdori{getSortIcon('quantity')}
                    </th>
                    <th style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
                      Xodim
                    </th>
                    <th style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
                      Izoh / Tafsilot
                    </th>
                    <th style={{ padding: '16px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                      Amallar
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transfersData.map(t => {
                    const dateStr = t.created_at ? new Date(t.created_at).toLocaleString('uz-UZ', {
                      year: 'numeric', month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit'
                    }) : '-';
                    const isInflow = t.from_location === 'EXTERNAL' || t.is_inflow;
                    const fromBadge = t.from_location === 'WAREHOUSE' ? 'Sklad' : (t.from_location === 'STORE' ? 'Magazin' : 'Tashqaridan');
                    const toBadge = t.to_location === 'STORE' ? 'Magazin' : 'Sklad';

                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                          {dateStr}
                        </td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ fontWeight: 600 }}>{t.product_name}</div>
                          {t.product_barcode && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              {t.product_barcode}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '16px' }}>
                          {isInflow ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 10px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: '0.85rem' }}>
                              <span style={{ fontWeight: 600, color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <PackagePlus size={14} /> Tashqaridan (Kirim)
                              </span>
                              <ArrowRight size={14} color="var(--text-muted)" />
                              <span style={{ fontWeight: 600, color: t.to_location === 'STORE' ? '#8b5cf6' : '#3b82f6' }}>
                                {toBadge}
                              </span>
                            </div>
                          ) : (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 10px', borderRadius: '8px', backgroundColor: 'var(--surface-hover)', fontSize: '0.85rem' }}>
                              <span style={{ fontWeight: 600, color: t.from_location === 'WAREHOUSE' ? '#3b82f6' : '#8b5cf6' }}>
                                {fromBadge}
                              </span>
                              <ArrowRight size={14} color="var(--text-muted)" />
                              <span style={{ fontWeight: 600, color: t.to_location === 'STORE' ? '#8b5cf6' : '#3b82f6' }}>
                                {toBadge}
                              </span>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '16px' }}>
                          <span style={{ 
                            padding: '4px 12px', 
                            borderRadius: '16px', 
                            backgroundColor: isInflow ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)', 
                            color: isInflow ? '#059669' : 'var(--primary)', 
                            fontWeight: 'bold',
                            fontSize: '0.9rem'
                          }}>
                            {isInflow ? '+' : ''}{parseFloat(t.quantity).toLocaleString()} {t.unit_name}
                          </span>
                        </td>
                        <td style={{ padding: '16px', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                          {t.user_name || '-'}
                        </td>
                        <td style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '240px' }}>
                          {t.note || '-'}
                        </td>
                        <td style={{ padding: '16px', textAlign: 'right' }}>
                          <button 
                            className="btn-icon" 
                            style={{ color: 'var(--danger)' }} 
                            title="O'chirish"
                            onClick={() => {
                              if (window.confirm(isInflow ? "Haqiqatan ham bu kirim yozuvini o'chirmoqchimisiz? Agar qoldiq ruxsat bersa, qabul qilingan miqdor ombordan qaytarib ayirib tashlanadi." : "Haqiqatan ham bu o'tkazmani o'chirmoqchimisiz? Agar qoldiq ruxsat bersa, mahsulot asl joyiga qaytariladi.")) {
                                deleteMutation.mutate({ id: t.id, endpoint: 'stock-transfers', queryKey: 'stock-transfers' });
                              }
                            }}
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination
                currentPage={transfersResponse?.current_page || page}
                totalPages={transfersResponse?.total_pages || 1}
                totalItems={transfersResponse?.count || 0}
                pageSize={pageSize}
                onPageChange={(p) => setPage(p)}
                onPageSizeChange={(sz) => { setPageSize(sz); setPage(1); }}
              />
            </>
          )
        )}
      </div>

      {/* CREATE MODAL */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="flex-between mb-4">
              <h2>{editingItem ? 'Tahrirlash' : 'Yangi qo\'shish'} {activeTab === 'categories' ? 'Toifa' : activeTab === 'units' ? 'Birlik' : activeTab === 'products' ? 'Mahsulot' : 'Kirim'}</h2>
              <button className="btn-icon" onClick={closeModal}><X size={24} /></button>
            </div>
            
            <form onSubmit={handleSubmit}>
              
              {/* Category Form */}
              {activeTab === 'categories' && (
                <div className="input-group">
                  <label>Toifa nomi</label>
                  <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} className="input-field" placeholder="M-n. Motor moylari" />
                  {formErrors.name && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{formErrors.name}</span>}
                </div>
              )}

              {/* Unit Form */}
              {activeTab === 'units' && (
                <>
                  <div className="input-group">
                    <label>Birlik nomi</label>
                    <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} className="input-field" placeholder="M-n. Kilogramm" />
                    {formErrors.name && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{formErrors.name}</span>}
                  </div>
                  <div className="input-group">
                    <label>Qisqartma</label>
                    <input type="text" name="short_name" value={formData.short_name || ''} onChange={handleInputChange} className="input-field" placeholder="M-n. kg" />
                    {formErrors.short_name && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{formErrors.short_name}</span>}
                  </div>
                </>
              )}

              {/* Product Form */}
              {activeTab === 'products' && (
                <>
                  <div className="input-group">
                    <label>Mahsulot nomi</label>
                    <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} className="input-field" placeholder="M-n. Castrol 5W-30" />
                    {formErrors.name && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{formErrors.name}</span>}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                    <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label>Toifa</label>
                      <SearchableSelect
                        value={formData.category}
                        onChange={v => setFormData({...formData, category: v})}
                        options={allCategoriesData?.map(c => ({ value: c.id, label: c.name })) || []}
                        placeholder="Toifani tanlang..."
                      />
                      {formErrors.category && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{formErrors.category}</span>}
                    </div>
                    <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label>O'lchov birligi</label>
                      <SearchableSelect
                        value={formData.unit}
                        onChange={v => setFormData({...formData, unit: v})}
                        options={allUnitsData?.map(u => ({ value: u.id, label: `${u.name} (${u.short_name})` })) || []}
                        placeholder="Birlikni tanlang..."
                      />
                      {formErrors.unit && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{formErrors.unit}</span>}
                    </div>
                  </div>

                  {/* Exchange Rate Badge */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    marginBottom: '16px',
                    fontSize: '0.85rem'
                  }}>
                    <span style={{ color: 'var(--text-muted)' }}>Faol valyuta kursi:</span>
                    <strong style={{ color: 'var(--primary)' }}>1 USD = {usdRate.toLocaleString()} UZS</strong>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    {/* Cost Price Dual Box */}
                    <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                      <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '6px' }}>
                        Tan narxi (Kirim)
                      </label>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>USD ($)</span>
                          <input 
                            type="number" 
                            step="0.0001"
                            name="cost_price_usd" 
                            value={formData.cost_price_usd ?? ''} 
                            onChange={(e) => handlePriceChange('cost_price_usd', e.target.value)} 
                            className="input-field" 
                            placeholder="0.00"
                            style={{ marginTop: '2px', marginBottom: 0 }} 
                          />
                        </div>
                        <div style={{ flex: 1.2 }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>So'm (UZS)</span>
                          <input 
                            type="number" 
                            name="cost_price" 
                            value={formData.cost_price ?? ''} 
                            onChange={(e) => handlePriceChange('cost_price', e.target.value)} 
                            className="input-field" 
                            placeholder="0"
                            style={{ marginTop: '2px', marginBottom: 0 }} 
                          />
                        </div>
                      </div>
                      {formErrors.cost_price && <span style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>{formErrors.cost_price}</span>}
                    </div>

                    {/* Selling Price Dual Box */}
                    <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                      <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '6px' }}>
                        Sotuv narxi
                      </label>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>USD ($)</span>
                          <input 
                            type="number" 
                            step="0.0001"
                            name="selling_price_usd" 
                            value={formData.selling_price_usd ?? ''} 
                            onChange={(e) => handlePriceChange('selling_price_usd', e.target.value)} 
                            className="input-field" 
                            placeholder="0.00"
                            style={{ marginTop: '2px', marginBottom: 0 }} 
                          />
                        </div>
                        <div style={{ flex: 1.2 }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>So'm (UZS)</span>
                          <input 
                            type="number" 
                            name="selling_price" 
                            value={formData.selling_price ?? ''} 
                            onChange={(e) => handlePriceChange('selling_price', e.target.value)} 
                            className="input-field" 
                            placeholder="0"
                            style={{ marginTop: '2px', marginBottom: 0 }} 
                          />
                        </div>
                      </div>
                      {formErrors.selling_price && <span style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>{formErrors.selling_price}</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                    <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label>Chiziqli belgi (Ixtiyoriy)</label>
                      <input type="text" name="barcode" value={formData.barcode || ''} onChange={handleInputChange} className="input-field" placeholder="Chiziqli belgini o'qitish..." />
                    </div>
                    <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label>Kam qoldiq chegarasi (Ixtiyoriy)</label>
                      <input type="number" name="low_stock_threshold" value={formData.low_stock_threshold || ''} onChange={handleInputChange} className="input-field" placeholder="10" />
                    </div>
                  </div>
                </>
              )}

              {/* Stock Form */}
              {activeTab === 'stock' && (
                <>
                  <div className="input-group">
                    <label>Mahsulot</label>
                    <SearchableSelect
                      value={formData.product}
                      onChange={(v, selected) => {
                        const prod = selected?.product;
                        setFormData(prev => ({
                          ...prev,
                          product: v,
                          cost_price: prod ? prod.cost_price : prev.cost_price,
                          cost_price_usd: prod ? (prod.cost_price_usd || parseFloat((parseFloat(prod.cost_price) / usdRate).toFixed(4))) : prev.cost_price_usd
                        }));
                      }}
                      isAsync
                      loadOptions={loadProductOptions}
                      placeholder="Mahsulotni tanlang..."
                    />
                    {formErrors.product && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{formErrors.product}</span>}
                  </div>

                  {/* Exchange Rate Badge */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    marginBottom: '16px',
                    fontSize: '0.85rem'
                  }}>
                    <span style={{ color: 'var(--text-muted)' }}>Faol valyuta kursi:</span>
                    <strong style={{ color: 'var(--primary)' }}>1 USD = {usdRate.toLocaleString()} UZS</strong>
                  </div>

                  <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                    <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label>Joylashuv</label>
                      <SearchableSelect
                        value={formData.location}
                        onChange={v => setFormData({...formData, location: v})}
                        options={[
                          { value: 'WAREHOUSE', label: 'Sklad' },
                          { value: 'STORE', label: 'Magazin' }
                        ]}
                        placeholder="Joylashuvni tanlang..."
                      />
                      {formErrors.location && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{formErrors.location}</span>}
                    </div>
                    <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label>Miqdor</label>
                      <input type="number" name="quantity" value={formData.quantity || ''} onChange={handleInputChange} className="input-field" placeholder="0" />
                      {formErrors.quantity && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{formErrors.quantity}</span>}
                    </div>
                  </div>

                  {/* Dual Price inputs for Stock Inflow */}
                  <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)', marginBottom: '16px' }}>
                    <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '6px' }}>
                      Kirim tan narxi (Dona uchun)
                    </label>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>USD ($)</span>
                        <input 
                          type="number" 
                          step="0.0001"
                          name="cost_price_usd" 
                          value={formData.cost_price_usd ?? ''} 
                          onChange={(e) => handlePriceChange('cost_price_usd', e.target.value)} 
                          className="input-field" 
                          placeholder="0.00"
                          style={{ marginTop: '2px', marginBottom: 0 }} 
                        />
                      </div>
                      <div style={{ flex: 1.2 }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>So'm (UZS)</span>
                        <input 
                          type="number" 
                          name="cost_price" 
                          value={formData.cost_price ?? ''} 
                          onChange={(e) => handlePriceChange('cost_price', e.target.value)} 
                          className="input-field" 
                          placeholder="0"
                          style={{ marginTop: '2px', marginBottom: 0 }} 
                        />
                      </div>
                    </div>
                    {formErrors.cost_price && <span style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>{formErrors.cost_price}</span>}

                    {/* Total Value Live Calculation */}
                    {formData.quantity > 0 && (formData.cost_price > 0 || formData.cost_price_usd > 0) && (
                      <div style={{ marginTop: '10px', fontSize: '0.85rem', color: 'var(--text-main)', display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border)', paddingTop: '8px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Jami kirim summasi:</span>
                        <strong>
                          ${(parseFloat(formData.quantity) * (parseFloat(formData.cost_price_usd) || (parseFloat(formData.cost_price) / usdRate))).toFixed(2)} ({Math.round(parseFloat(formData.quantity) * (parseFloat(formData.cost_price) || (parseFloat(formData.cost_price_usd) * usdRate))).toLocaleString()} so'm)
                        </strong>
                      </div>
                    )}
                  </div>
                  <div className="input-group" style={{ marginBottom: '24px' }}>
                    <label>Izoh / Manba (Ixtiyoriy)</label>
                    <input 
                      type="text" 
                      name="note" 
                      value={formData.note || ''} 
                      onChange={handleInputChange} 
                      className="input-field" 
                      placeholder="Masalan: Yetkazib beruvchidan yoki boshqa joydan keltirildi..." 
                    />
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

      {/* DYNAMIC BARCODE PRINT MODAL */}
      {barcodeModalProduct && (() => {
        const barcodeList = String(barcodeModalProduct.barcode || '')
          .split(',')
          .map(b => b.trim())
          .filter(Boolean);

        return (
          <div className="modal-overlay" onClick={() => setBarcodeModalProduct(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
              <div className="flex-between mb-4">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Printer style={{ color: 'var(--primary)' }} size={22} />
                  <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Chiziqli belgi chop etish</h2>
                </div>
                <button className="btn-icon" onClick={() => setBarcodeModalProduct(null)}>
                  <X size={18} />
                </button>
              </div>

              {/* Product Info Card */}
              <div style={{
                backgroundColor: 'var(--surface-hover)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '16px',
                border: '1px solid var(--border)'
              }}>
                <div style={{ fontWeight: 600, fontSize: '1.05rem', marginBottom: '8px', color: 'var(--text-main)' }}>
                  {barcodeModalProduct.name}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.9rem', flexWrap: 'wrap', gap: '4px' }}>
                  <span>Tanlangan kod: <strong style={{ color: 'var(--primary)', fontFamily: 'monospace', fontSize: '1rem' }}>{selectedBarcode || 'Avtomatik'}</strong></span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Etiketka: <strong>Narxsiz</strong></span>
                </div>
              </div>

              {/* Multiple Barcode Selection (If product has more than 1 barcode/artikul) */}
              {barcodeList.length > 1 && (
                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                    Qaysi shtrix-kod chop etilsin? ({barcodeList.length} ta kod mavjud):
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {barcodeList.map((bc, idx) => {
                      const isSelected = selectedBarcode === bc;
                      return (
                        <div
                          key={idx}
                          onClick={() => setSelectedBarcode(bc)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                            backgroundColor: isSelected ? 'rgba(52, 152, 219, 0.12)' : 'var(--bg-card)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease-in-out'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                              type="radio"
                              name="selected_barcode_option"
                              checked={isSelected}
                              onChange={() => setSelectedBarcode(bc)}
                              style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                            />
                            <div>
                              <span style={{
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                fontSize: '1rem',
                                color: isSelected ? 'var(--primary)' : 'var(--text-main)'
                              }}>
                                {bc}
                              </span>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                                {idx === 0 ? "(Asosiy shtrix-kod)" : "(Артикул / Qo'shimcha)"}
                              </span>
                            </div>
                          </div>
                          {isSelected && (
                            <span style={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: 'var(--primary)',
                              backgroundColor: 'rgba(52, 152, 219, 0.2)',
                              padding: '2px 8px',
                              borderRadius: '12px'
                            }}>
                              Tanlangan
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Dynamic Quantity Selector */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>
                  Chop etish soni (dona etiketka):
                </label>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    style={{ width: '42px', height: '42px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setBarcodePrintQty(prev => Math.max(1, prev - 1))}
                  >
                    <Minus size={18} />
                  </button>
                  
                  <input 
                    type="number" 
                    min="1"
                    max="1000"
                    value={barcodePrintQty}
                    onChange={e => setBarcodePrintQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="input-field"
                    style={{ textAlign: 'center', fontSize: '1.2rem', fontWeight: 'bold', marginBottom: 0, height: '42px' }}
                  />

                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    style={{ width: '42px', height: '42px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setBarcodePrintQty(prev => prev + 1)}
                  >
                    <Plus size={18} />
                  </button>
                </div>

                {/* Quick presets */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[1, 5, 10, 20, 50].map(qty => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => setBarcodePrintQty(qty)}
                      style={{
                        flex: 1,
                        padding: '6px',
                        borderRadius: '6px',
                        border: barcodePrintQty === qty ? '2px solid var(--primary)' : '1px solid var(--border)',
                        backgroundColor: barcodePrintQty === qty ? 'rgba(52, 152, 219, 0.1)' : 'var(--bg-card)',
                        color: barcodePrintQty === qty ? 'var(--primary)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontWeight: 500,
                        fontSize: '0.85rem'
                      }}
                    >
                      {qty} ta
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions: Direct Print (First) with Fallback, and Direct Windows Print */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ flex: 1 }}
                    onClick={() => setBarcodeModalProduct(null)}
                  >
                    Bekor qilish
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-primary" 
                    style={{ flex: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    onClick={() => handlePrintBarcode(false)}
                    disabled={isPrintingBarcode}
                    title="Avval to'g'ridan-to'g'ri printerni qidiradi, bo'lmasa Windows orqali chiqaradi"
                  >
                    <Printer size={16} />
                    {isPrintingBarcode ? "Yuborilmoqda..." : `Chop etish (${barcodePrintQty} ta)`}
                  </button>
                </div>

                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{
                    width: '100%',
                    fontSize: '0.85rem',
                    color: 'var(--text-muted)',
                    borderColor: 'var(--border)',
                    padding: '8px'
                  }}
                  onClick={() => handlePrintBarcode(true)}
                  disabled={isPrintingBarcode}
                  title="Ushbu kompyuterdagi mahalliy / LAN printer orqali Windows oynasida chop etish"
                >
                  Ushbu kompyuter (Windows) orqali chop etish
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* STOCK TRANSFER MODAL */}
      {isTransferModalOpen && (
        <div className="modal-overlay" onClick={() => setIsTransferModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="flex-between mb-4">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {transferForm.from_location === 'EXTERNAL' ? (
                  <PackagePlus style={{ color: '#10b981' }} size={22} />
                ) : (
                  <ArrowRightLeft style={{ color: 'var(--primary)' }} size={22} />
                )}
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>
                  {transferForm.from_location === 'EXTERNAL' ? "Yangi mahsulot kirimi" : "Mahsulot qoldig'ini o'tkazish"}
                </h2>
              </div>
              <button className="btn-icon" onClick={() => setIsTransferModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleTransferSubmit}>
              <div className="input-group">
                <label>Mahsulot <span style={{ color: 'var(--danger)' }}>*</span></label>
                <SearchableSelect
                  value={transferForm.product}
                  onChange={v => setTransferForm({ ...transferForm, product: v })}
                  isAsync
                  loadOptions={loadProductOptions}
                  placeholder="Mahsulotni tanlang..."
                />
              </div>

              {/* Live stock display for selected product */}
              {selectedProductStock && (
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  backgroundColor: 'var(--surface-hover)',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  marginBottom: '16px',
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sklad qoldig'i:</div>
                    <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#3b82f6' }}>
                      {selectedProductStock.warehouse} dona
                    </div>
                  </div>
                  <div style={{ width: '1px', backgroundColor: 'var(--border)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Magazin qoldig'i:</div>
                    <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#8b5cf6' }}>
                      {selectedProductStock.store} dona
                    </div>
                  </div>
                  <div style={{ width: '1px', backgroundColor: 'var(--border)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Jami qoldiq:</div>
                    <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#2ecc71' }}>
                      {selectedProductStock.total} dona
                    </div>
                  </div>
                </div>
              )}

              {/* From and To Locations */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
                <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label>Qayerdan / Manba <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select
                    className="input-field"
                    value={transferForm.from_location}
                    onChange={e => {
                      const from = e.target.value;
                      let to = transferForm.to_location;
                      if (from === 'EXTERNAL') {
                        if (to === 'EXTERNAL') to = 'WAREHOUSE';
                      } else if (from === 'WAREHOUSE') {
                        to = 'STORE';
                      } else if (from === 'STORE') {
                        to = 'WAREHOUSE';
                      }
                      setTransferForm({ ...transferForm, from_location: from, to_location: to });
                    }}
                  >
                    <option value="WAREHOUSE">Sklad</option>
                    <option value="STORE">Magazin</option>
                    <option value="EXTERNAL">Tashqaridan (Yangi kirim / Boshqa joydan)</option>
                  </select>
                </div>

                <div style={{ paddingTop: '20px', color: 'var(--text-muted)' }}>
                  <ArrowRight size={20} />
                </div>

                <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label>Qayerga <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select
                    className="input-field"
                    value={transferForm.to_location}
                    onChange={e => {
                      const to = e.target.value;
                      setTransferForm({ ...transferForm, to_location: to });
                    }}
                  >
                    {transferForm.from_location !== 'WAREHOUSE' && <option value="WAREHOUSE">Sklad</option>}
                    {transferForm.from_location !== 'STORE' && <option value="STORE">Magazin</option>}
                  </select>
                </div>
              </div>

              {/* Quantity */}
              <div className="input-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ margin: 0 }}>
                    {transferForm.from_location === 'EXTERNAL' ? "Kirim miqdori" : "O'tkazish miqdori"} <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  {transferForm.from_location !== 'EXTERNAL' && maxAvailableQty > 0 && (
                    <button
                      type="button"
                      onClick={() => setTransferForm({ ...transferForm, quantity: maxAvailableQty })}
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--primary)',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      Barchasini olish (Max: {maxAvailableQty})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  required
                  value={transferForm.quantity}
                  onChange={e => setTransferForm({ ...transferForm, quantity: e.target.value })}
                  className="input-field"
                  placeholder="0"
                />
              </div>

              {/* Note */}
              <div className="input-group" style={{ marginBottom: '24px' }}>
                <label>
                  {transferForm.from_location === 'EXTERNAL' ? "Manba / Yetkazib beruvchi / Izoh (Ixtiyoriy)" : "Izoh / Sabab (Ixtiyoriy)"}
                </label>
                <input
                  type="text"
                  value={transferForm.note}
                  onChange={e => setTransferForm({ ...transferForm, note: e.target.value })}
                  className="input-field"
                  placeholder={transferForm.from_location === 'EXTERNAL' ? "Masalan: Bozordan yoki yetkazib beruvchidan keltirildi..." : "Masalan: Magazinga vitrinaga chiqarish uchun..."}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsTransferModalOpen(false)}
                  disabled={transferLoading}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={transferLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {transferForm.from_location === 'EXTERNAL' ? <PackagePlus size={16} /> : <ArrowRightLeft size={16} />}
                  {transferLoading ? "Saqlanmoqda..." : (transferForm.from_location === 'EXTERNAL' ? "Kirimni tasdiqlash" : "O'tkazishni tasdiqlash")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Inventory;
