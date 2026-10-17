/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop Dedicated Administrator Dashboard (Part 6)
 * Features:
 * 1. Dedicated SHOP_ADMIN authentication
 * 2. Real-time statistics: orders, revenue, low stock alerts
 * 3. Full CRUD for Categories and Products (with variations, SKU, photo upload)
 * 4. Order management & payment proof verification
 * 5. Shipment tracking, airway bills, and cross-border milestones
 * 6. Store settings (open/close, QRIS, fees, minimum spend)
 * 7. Date-range transactional reports with export/print capability
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  ShopProduct, ShopCategory, ShopOrder, ShopConfig, 
  ShopPaymentStatus, ShopOrderStatus, ShopShipment, 
  ShopShipmentStatus, ShopShipmentScope, ShopProductVariation
} from '../types/shop';
import { 
  Store, ShoppingBag, Package, Truck, DollarSign, Calendar, TrendingUp, 
  AlertTriangle, CheckCircle2, XCircle, Clock, Search, Filter, Edit3, 
  Trash2, Plus, RefreshCw, Eye, ArrowLeft, LogOut, ShieldCheck, 
  Download, Printer, Upload, Image as ImageIcon, MapPin, Phone, 
  User, Globe, Check, AlertCircle, ChevronRight, X, Copy, ExternalLink,
  Lock, Tag, Layers
} from 'lucide-react';
import { compressImage } from '../utils/imageCompressor';

interface ShopAdminViewProps {
  onBackToCustomer?: () => void;
}

export default function ShopAdminView({ onBackToCustomer }: ShopAdminViewProps) {
  // Auth State
  const [token, setToken] = useState<string>(() => localStorage.getItem('tumpang_shop_token') || '');
  const [adminUser, setAdminUser] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('tumpang_shop_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Login form states
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'products' | 'categories' | 'shipments' | 'reports' | 'settings'>('overview');

  // Core Data States
  const [metrics, setMetrics] = useState<any | null>(null);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [shipments, setShipments] = useState<ShopShipment[]>([]);
  const [config, setConfig] = useState<ShopConfig | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Order Filter & Detail States
  const [orderFilterPayment, setOrderFilterPayment] = useState<string>('all');
  const [orderFilterStatus, setOrderFilterStatus] = useState<string>('all');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<ShopOrder | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);

  // Product CRUD Modal States
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ShopProduct | null>(null);
  const [productForm, setProductForm] = useState<{
    name: string;
    sku: string;
    categoryId: string;
    description: string;
    basePrice: number;
    stock: number;
    unit: string;
    isActive: boolean;
    images: string[];
    variations: ShopProductVariation[];
  }>({
    name: '',
    sku: '',
    categoryId: '',
    description: '',
    basePrice: 0,
    stock: 0,
    unit: 'pcs',
    isActive: true,
    images: [],
    variations: []
  });
  const [imageInputUrl, setImageInputUrl] = useState('');
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  // Category CRUD Modal States
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ShopCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState<{
    name: string;
    slug: string;
    description: string;
    icon: string;
    isActive: boolean;
  }>({
    name: '',
    slug: '',
    description: '',
    icon: 'Package',
    isActive: true
  });
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Shipment Update Modal States
  const [selectedShipment, setSelectedShipment] = useState<ShopShipment | null>(null);
  const [newShipmentStatus, setNewShipmentStatus] = useState<ShopShipmentStatus>(ShopShipmentStatus.PROCESSING);
  const [shipmentLocation, setShipmentLocation] = useState('');
  const [shipmentDescription, setShipmentDescription] = useState('');
  const [isUpdatingShipment, setIsUpdatingShipment] = useState(false);

  // Create Shipment Modal States
  const [isCreateShipmentOpen, setIsCreateShipmentOpen] = useState(false);
  const [shipmentOrderTarget, setShipmentOrderTarget] = useState<ShopOrder | null>(null);
  const [createShipmentCourier, setCreateShipmentCourier] = useState('TUMPANG_LOCAL');
  const [createShipmentCustomResi, setCreateShipmentCustomResi] = useState('');

  // Settings Form States
  const [settingsForm, setSettingsForm] = useState<ShopConfig | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Reports Form States
  const [reportStartDate, setReportStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [reportEndDate, setReportEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportData, setReportData] = useState<any | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  // Auto-dismiss notification
  useEffect(() => {
    if (feedbackMessage) {
      const timer = setTimeout(() => setFeedbackMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [feedbackMessage]);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setFeedbackMessage({ type, text });
  };

  // Helper fetch with authentication header
  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
      // Invalid or expired token
      localStorage.removeItem('tumpang_shop_token');
      localStorage.removeItem('tumpang_shop_user');
      setToken('');
      setAdminUser(null);
      throw new Error('Sesi Admin telah berakhir. Silakan login kembali.');
    }
    return res;
  }, [token]);

  // Load all admin data
  const loadDashboardData = useCallback(async () => {
    if (!token) return;
    setIsLoadingData(true);
    try {
      const [metricsRes, ordersRes, productsRes, categoriesRes, shipmentsRes, configRes] = await Promise.all([
        authFetch('/api/shop/reports/summary'),
        authFetch('/api/shop/orders'),
        authFetch('/api/shop/admin/products'),
        authFetch('/api/shop/admin/categories'),
        authFetch('/api/shop/admin/shipments'),
        fetch('/api/shop/config')
      ]);

      if (metricsRes.ok) setMetrics(await metricsRes.json());
      if (ordersRes.ok) setOrders(await ordersRes.json());
      if (productsRes.ok) setProducts(await productsRes.json());
      if (categoriesRes.ok) setCategories(await categoriesRes.json());
      if (shipmentsRes.ok) setShipments(await shipmentsRes.json());
      if (configRes.ok) {
        const conf = await configRes.json();
        setConfig(conf);
        setSettingsForm(conf);
      }
    } catch (err: any) {
      console.error('Error loading admin data:', err);
      showNotification('error', err.message || 'Gagal memuat data dashboard.');
    } finally {
      setIsLoadingData(false);
    }
  }, [token, authFetch]);

  // Load on mount and when token changes
  useEffect(() => {
    if (token) {
      loadDashboardData();
    }
  }, [token, loadDashboardData]);

  // Load Reports when activeTab becomes 'reports'
  const loadTransactionReport = useCallback(async () => {
    if (!token) return;
    setIsLoadingReport(true);
    try {
      const res = await authFetch(`/api/shop/reports/transactions?startDate=${reportStartDate}&endDate=${reportEndDate}`);
      if (res.ok) {
        setReportData(await res.json());
      }
    } catch (err: any) {
      showNotification('error', err.message || 'Gagal memuat laporan transaksi.');
    } finally {
      setIsLoadingReport(false);
    }
  }, [token, authFetch, reportStartDate, reportEndDate]);

  useEffect(() => {
    if (activeTab === 'reports' && token) {
      loadTransactionReport();
    }
  }, [activeTab, token, loadTransactionReport]);

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    try {
      const res = await fetch('/api/shop/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login gagal. Periksa kembali email dan password.');
      }

      setToken(data.token);
      setAdminUser(data.user);
      localStorage.setItem('tumpang_shop_token', data.token);
      localStorage.setItem('tumpang_shop_user', JSON.stringify(data.user));
      showNotification('success', `Selamat datang, ${data.user?.name || 'Administrator'}!`);
    } catch (err: any) {
      setLoginError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Logout
  const handleLogout = () => {
    if (window.confirm('Apakah Anda yakin ingin keluar dari Portal Admin Tumpang Shop?')) {
      localStorage.removeItem('tumpang_shop_token');
      localStorage.removeItem('tumpang_shop_user');
      setToken('');
      setAdminUser(null);
      showNotification('success', 'Anda telah berhasil logout.');
    }
  };

  // Quick Toggle Store Open/Close
  const handleToggleStoreOpen = async () => {
    if (!config) return;
    try {
      const res = await authFetch('/api/shop/config', {
        method: 'PUT',
        body: JSON.stringify({ isOpen: !config.isOpen })
      });
      if (!res.ok) throw new Error('Gagal mengubah status toko.');
      const updated = await res.json();
      setConfig(updated);
      setSettingsForm(updated);
      showNotification('success', `Status toko berhasil diubah menjadi: ${updated.isOpen ? 'BUKA' : 'TUTUP'}`);
      loadDashboardData();
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // Handle Payment Verification (Approve / Reject)
  const handleVerifyPayment = async (orderId: string, approved: boolean) => {
    setIsProcessingOrder(true);
    try {
      const res = await authFetch(`/api/shop/orders/${orderId}/verify-payment`, {
        method: 'POST',
        body: JSON.stringify({
          approved,
          reason: !approved ? rejectReason : undefined
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Gagal memproses verifikasi pembayaran.');
      }

      showNotification('success', approved ? 'Pembayaran berhasil disetujui (LUNAS)!' : 'Pembayaran ditolak.');
      setShowRejectInput(false);
      setRejectReason('');
      setSelectedOrder(null);
      loadDashboardData();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setIsProcessingOrder(false);
    }
  };

  // Handle Order Status Update
  const handleUpdateOrderStatus = async (orderId: string, status: ShopOrderStatus) => {
    setIsProcessingOrder(true);
    try {
      const res = await authFetch(`/api/shop/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Gagal mengubah status pesanan.');
      }
      showNotification('success', `Status pesanan berhasil diubah menjadi: ${status}`);
      setSelectedOrder(null);
      loadDashboardData();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setIsProcessingOrder(false);
    }
  };

  // Handle Category Save (Create / Update)
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCategory(true);
    try {
      const isEdit = !!editingCategory;
      const url = isEdit ? `/api/shop/categories/${editingCategory.id}` : '/api/shop/categories';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        body: JSON.stringify(categoryForm)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Gagal menyimpan kategori.');
      }

      showNotification('success', `Kategori berhasil ${isEdit ? 'diperbarui' : 'ditambahkan'}!`);
      setIsCategoryModalOpen(false);
      setEditingCategory(null);
      loadDashboardData();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setIsSavingCategory(false);
    }
  };

  // Handle Category Delete
  const handleDeleteCategory = async (categoryId: string, name: string) => {
    if (!window.confirm(`Yakin ingin menghapus kategori "${name}"?`)) return;
    try {
      const res = await authFetch(`/api/shop/categories/${categoryId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Gagal menghapus kategori.');
      }
      showNotification('success', 'Kategori berhasil dihapus.');
      loadDashboardData();
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // Handle Product Save (Create / Update)
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.name || !productForm.categoryId) {
      showNotification('error', 'Nama produk dan kategori wajib diisi.');
      return;
    }

    setIsSavingProduct(true);
    try {
      const isEdit = !!editingProduct;
      const url = isEdit ? `/api/shop/products/${editingProduct.id}` : '/api/shop/products';
      const method = isEdit ? 'PUT' : 'POST';

      const payload = {
        ...productForm,
        basePrice: Number(productForm.basePrice),
        stock: Number(productForm.stock)
      };

      const res = await authFetch(url, {
        method,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Gagal menyimpan produk.');
      }

      showNotification('success', `Produk berhasil ${isEdit ? 'diperbarui' : 'ditambahkan'}!`);
      setIsProductModalOpen(false);
      setEditingProduct(null);
      loadDashboardData();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setIsSavingProduct(false);
    }
  };

  // Handle Product Delete
  const handleDeleteProduct = async (productId: string, name: string) => {
    if (!window.confirm(`Hapus produk "${name}" secara permanen?`)) return;
    try {
      const res = await authFetch(`/api/shop/products/${productId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal menghapus produk.');
      showNotification('success', 'Produk berhasil dihapus.');
      loadDashboardData();
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // Handle Product Photo File Upload with compression
  const handleProductPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImage(file, 800, 800, 0.7);
      setProductForm(prev => ({
        ...prev,
        images: [compressed, ...prev.images]
      }));
      showNotification('success', 'Foto produk berhasil ditambahkan!');
    } catch (err: any) {
      showNotification('error', 'Gagal memproses foto produk.');
    }
  };

  // Handle QRIS Photo Upload with compression
  const handleQrisPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImage(file, 800, 800, 0.75);
      setSettingsForm(prev => prev ? ({ ...prev, qrisImage: compressed }) : prev);
      showNotification('success', 'Gambar QRIS berhasil dimuat!');
    } catch (err: any) {
      showNotification('error', 'Gagal memproses gambar QRIS.');
    }
  };

  // Handle Shipment Status Update
  const handleUpdateShipmentStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShipment) return;

    setIsUpdatingShipment(true);
    try {
      const res = await authFetch(`/api/shop/admin/shipments/${selectedShipment.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: newShipmentStatus,
          location: shipmentLocation.trim() || undefined,
          description: shipmentDescription.trim() || undefined
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Gagal memperbarui status pengiriman.');
      }

      showNotification('success', `Status paket berhasil diubah menjadi: ${newShipmentStatus}`);
      setSelectedShipment(null);
      setShipmentLocation('');
      setShipmentDescription('');
      loadDashboardData();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setIsUpdatingShipment(false);
    }
  };

  // Handle Create Shipment for an Order
  const handleCreateShipmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shipmentOrderTarget) return;

    setIsUpdatingShipment(true);
    try {
      const res = await authFetch('/api/shop/admin/shipments', {
        method: 'POST',
        body: JSON.stringify({
          orderId: shipmentOrderTarget.id,
          courierCode: createShipmentCourier,
          trackingNumber: createShipmentCustomResi.trim() || undefined
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Gagal membuat data pengiriman.');
      }

      showNotification('success', 'Data pengiriman berhasil dibuat!');
      setIsCreateShipmentOpen(false);
      setShipmentOrderTarget(null);
      setCreateShipmentCustomResi('');
      loadDashboardData();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setIsUpdatingShipment(false);
    }
  };

  // Handle Settings Save
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm) return;

    setIsSavingSettings(true);
    try {
      const res = await authFetch('/api/shop/config', {
        method: 'PUT',
        body: JSON.stringify({
          ...settingsForm,
          defaultDeliveryFee: Number(settingsForm.defaultDeliveryFee),
          serviceFee: Number(settingsForm.serviceFee),
          minOrderAmount: Number(settingsForm.minOrderAmount)
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Gagal menyimpan pengaturan toko.');
      }

      const updated = await res.json();
      setConfig(updated);
      setSettingsForm(updated);
      showNotification('success', 'Pengaturan toko berhasil diperbarui!');
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Filtered Orders Memo
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesPayment = orderFilterPayment === 'all' || o.paymentStatus === orderFilterPayment;
      const matchesStatus = orderFilterStatus === 'all' || o.orderStatus === orderFilterStatus;
      const matchesSearch = !orderSearchQuery.trim() || 
        o.orderNumber.toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
        o.customerName.toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
        o.customerPhone.includes(orderSearchQuery);
      return matchesPayment && matchesStatus && matchesSearch;
    });
  }, [orders, orderFilterPayment, orderFilterStatus, orderSearchQuery]);

  // ==========================================
  // VIEW: UNATUHENTICATED / SECURE LOGIN SCREEN
  // ==========================================
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans text-slate-100">
        <div className="bg-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-700/80 flex flex-col gap-5">
          {/* Top Logo / Icon */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Store className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-400">Portal Terisolasi</span>
                <h3 className="font-extrabold text-lg text-white">Admin Tumpang Shop</h3>
              </div>
            </div>

            {onBackToCustomer && (
              <button
                type="button"
                onClick={onBackToCustomer}
                className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Customer</span>
              </button>
            )}
          </div>

          <div className="p-3 bg-blue-950/40 border border-blue-800/40 rounded-xl text-[11px] text-blue-200 leading-relaxed">
            <p className="font-bold flex items-center gap-1.5 text-blue-300">
              <Lock className="w-3.5 h-3.5" />
              Keamanan Terisolasi RBAC:
            </p>
            <p className="mt-0.5 text-slate-300">
              Portal ini khusus Administrator Tumpang Shop. Kredensial terpisah dari Tumpang Food.
            </p>
          </div>

          {loginError && (
            <div className="p-3 bg-rose-950/50 border border-rose-800/50 text-rose-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Email / Username Admin Shop
              </label>
              <input
                type="text"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="shopadmin@tumpanggo.com"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:border-blue-500 text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Kata Sandi (Password)
              </label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:border-blue-500 text-white"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="mt-2 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-extrabold py-3 rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memverifikasi Kredensial...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Masuk ke Dashboard Shop</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Credential Helper in development */}
          <div className="text-[10px] text-slate-500 text-center border-t border-slate-700/60 pt-3">
            Kredensial Default: <code className="text-slate-400">shopadmin@tumpanggo.com</code> / <code className="text-slate-400">shopadmin123</code>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW: MAIN AUTHENTICATED SHOP ADMIN DASHBOARD
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans pb-24">
      {/* Toast Notification */}
      {feedbackMessage && (
        <div className={`fixed top-4 right-4 z-[200] px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold text-white transition-all animate-fadeIn ${
          feedbackMessage.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
        }`}>
          {feedbackMessage.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="bg-slate-900 text-white sticky top-0 z-50 border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black shadow-sm">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-sm sm:text-base leading-tight tracking-tight">
                  Tumpang Shop Admin
                </h1>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/20">
                  PORTAL TOKO
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Manajemen Toko Sembako, Pengiriman Lokal & Impor China
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Store Open/Close Toggle */}
            {config && (
              <button
                type="button"
                onClick={handleToggleStoreOpen}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  config.isOpen 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30' 
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
                }`}
                title="Klik untuk mengubah status operasional toko"
              >
                <span className={`w-2 h-2 rounded-full ${config.isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                <span>{config.isOpen ? 'Toko Buka' : 'Toko Tutup'}</span>
              </button>
            )}

            {/* Refresh Data */}
            <button
              type="button"
              onClick={loadDashboardData}
              disabled={isLoadingData}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              title="Segarkan Data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingData ? 'animate-spin text-blue-400' : ''}`} />
            </button>

            {/* Logout */}
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Logout dari Admin Shop"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation Navigation Bar */}
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-1 overflow-x-auto scrollbar-none border-t border-slate-800/80">
          {[
            { id: 'overview', label: 'Ringkasan', icon: TrendingUp },
            { id: 'orders', label: 'Pesanan', icon: ShoppingBag, badge: metrics?.pendingPaymentVerifications },
            { id: 'products', label: 'Produk & Stok', icon: Package, badge: metrics?.lowStockProducts },
            { id: 'categories', label: 'Kategori', icon: Layers },
            { id: 'shipments', label: 'Pengiriman & Tracking', icon: Truck, badge: metrics?.pendingShipmentCount },
            { id: 'reports', label: 'Laporan Omzet', icon: Calendar },
            { id: 'settings', label: 'Pengaturan & QRIS', icon: Store }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-2.5 px-3.5 text-xs font-bold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
                  isActive 
                    ? 'border-blue-500 text-blue-400 bg-blue-500/10' 
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-500 text-white">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 pt-6">
        {/* ========================================== */}
        {/* TAB 1: OVERVIEW & DASHBOARD METRICS */}
        {/* ========================================== */}
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
              {/* Card 1: Omzet Lunas */}
              <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[11px] font-black uppercase tracking-wider">Omzet Lunas</span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <h3 className="font-black text-xl sm:text-2xl text-slate-900">
                    Rp {(metrics?.totalRevenue || 0).toLocaleString('id-ID')}
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Hari ini: Rp {(metrics?.todayRevenue || 0).toLocaleString('id-ID')}
                  </p>
                </div>
              </div>

              {/* Card 2: Total Pesanan */}
              <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[11px] font-black uppercase tracking-wider">Total Pesanan</span>
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <h3 className="font-black text-xl sm:text-2xl text-slate-900">
                    {metrics?.totalOrders || 0}
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {metrics?.paidOrderCount || 0} lunas • {metrics?.todayOrderCount || 0} hari ini
                  </p>
                </div>
              </div>

              {/* Card 3: Menunggu Verifikasi */}
              <div 
                onClick={() => {
                  setOrderFilterPayment('WAITING_VERIFICATION');
                  setActiveTab('orders');
                }}
                className="bg-white p-4 sm:p-5 rounded-3xl border border-amber-200 shadow-xs flex flex-col justify-between cursor-pointer hover:bg-amber-50/40 transition-colors"
              >
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-700">Verifikasi Bayar</span>
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <h3 className="font-black text-xl sm:text-2xl text-amber-900">
                    {metrics?.pendingPaymentVerifications || 0}
                  </h3>
                  <p className="text-[10px] text-amber-700 font-semibold mt-0.5">
                    Klik untuk meninjau bukti transfer ➔
                  </p>
                </div>
              </div>

              {/* Card 4: Pengiriman Berjalan */}
              <div 
                onClick={() => setActiveTab('shipments')}
                className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[11px] font-black uppercase tracking-wider">Pengiriman Aktif</span>
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Truck className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <h3 className="font-black text-xl sm:text-2xl text-slate-900">
                    {metrics?.pendingShipmentCount || 0}
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Dalam proses pengantaran & kargo ➔
                  </p>
                </div>
              </div>
            </div>

            {/* Low Stock Warning Section */}
            {metrics?.lowStockList && metrics.lowStockList.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-800">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <h4 className="font-extrabold text-sm">Peringatan: Stok Produk Menipis ({metrics.lowStockList.length} Item)</h4>
                  </div>
                  <button
                    onClick={() => setActiveTab('products')}
                    className="text-xs font-bold text-amber-800 underline hover:text-amber-900 cursor-pointer"
                  >
                    Kelola Semua Produk
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {metrics.lowStockList.map((item: any) => (
                    <div key={item.id} className="bg-white p-3 rounded-2xl border border-amber-200/70 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <p className="font-bold text-xs text-slate-800 truncate">{item.name}</p>
                        <p className="text-[10px] font-mono text-slate-400">SKU: {item.sku}</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-rose-100 text-rose-700 whitespace-nowrap">
                        Sisa {item.stock} {item.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Orders Overview */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">Pesanan Belanja Terkini</h3>
                  <p className="text-xs text-slate-400">Daftar transaksi pesanan marketplace Tumpang Shop</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('orders')}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer flex items-center gap-1"
                >
                  <span>Lihat Semua Pesanan</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {orders.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Belum ada pesanan belanja masuk.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 text-[10px] font-black uppercase">
                        <th className="py-2.5 px-3">No. Pesanan</th>
                        <th className="py-2.5 px-3">Pelanggan</th>
                        <th className="py-2.5 px-3">Metode Kirim</th>
                        <th className="py-2.5 px-3">Status Bayar</th>
                        <th className="py-2.5 px-3">Status Alur</th>
                        <th className="py-2.5 px-3 text-right">Total</th>
                        <th className="py-2.5 px-3 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {orders.slice(0, 5).map(order => (
                        <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-3 font-mono font-bold text-slate-900">{order.orderNumber}</td>
                          <td className="py-3 px-3">
                            <p className="font-bold text-slate-800">{order.customerName}</p>
                            <p className="text-[10px] text-slate-400">{order.customerPhone}</p>
                          </td>
                          <td className="py-3 px-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                              {order.shippingMethodLabel || order.shippingMethod}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                              order.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                              order.paymentStatus === 'WAITING_VERIFICATION' ? 'bg-amber-100 text-amber-800' :
                              'bg-rose-100 text-rose-800'
                            }`}>
                              {order.paymentStatus}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800">
                              {order.orderStatus}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-extrabold text-right text-slate-900">
                            Rp {order.total.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrder(order);
                                setActiveTab('orders');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-[11px] transition-colors cursor-pointer"
                            >
                              Detail
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 2: ORDER MANAGEMENT & PAYMENT PROOF */}
        {/* ========================================== */}
        {activeTab === 'orders' && (
          <div className="flex flex-col gap-5 animate-fadeIn">
            {/* Filter & Search Bar */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Cari nomor pesanan, nama, atau telepon WhatsApp..."
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={orderFilterPayment}
                  onChange={(e) => setOrderFilterPayment(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-700 cursor-pointer"
                >
                  <option value="all">Semua Status Bayar</option>
                  <option value="UNPAID">Belum Dibayar (UNPAID)</option>
                  <option value="WAITING_VERIFICATION">Menunggu Verifikasi Bukti</option>
                  <option value="PAID">Lunas (PAID)</option>
                  <option value="EXPIRED">Kedaluwarsa (EXPIRED)</option>
                  <option value="REJECTED">Ditolak (REJECTED)</option>
                </select>

                <select
                  value={orderFilterStatus}
                  onChange={(e) => setOrderFilterStatus(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-700 cursor-pointer"
                >
                  <option value="all">Semua Alur Pesanan</option>
                  <option value="NEW">Pesanan Baru (NEW)</option>
                  <option value="PROCESSING">Diproses</option>
                  <option value="PACKED">Dikemas</option>
                  <option value="SHIPPED">Dikirim</option>
                  <option value="COMPLETED">Selesai</option>
                  <option value="CANCELLED">Dibatalkan</option>
                </select>
              </div>
            </div>

            {/* Orders Table */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-extrabold text-sm text-slate-900">
                  Daftar Pesanan ({filteredOrders.length})
                </h3>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  Tidak ada pesanan yang sesuai dengan filter pencarian.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 text-[10px] font-black uppercase">
                        <th className="py-2.5 px-3">No. Pesanan & Waktu</th>
                        <th className="py-2.5 px-3">Pelanggan</th>
                        <th className="py-2.5 px-3">Alamat & Kecamatan</th>
                        <th className="py-2.5 px-3">Pengiriman & Resi</th>
                        <th className="py-2.5 px-3">Status Bayar</th>
                        <th className="py-2.5 px-3">Status Pesanan</th>
                        <th className="py-2.5 px-3 text-right">Total Tagihan</th>
                        <th className="py-2.5 px-3 text-center">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredOrders.map(order => (
                        <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-3">
                            <span className="font-mono font-bold text-slate-900 block">{order.orderNumber}</span>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              {new Date(order.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <p className="font-bold text-slate-800">{order.customerName}</p>
                            <a 
                              href={`https://wa.me/${order.customerPhone.replace(/[^0-9]/g, '')}`} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-[10px] text-emerald-600 hover:underline flex items-center gap-1 mt-0.5"
                            >
                              <Phone className="w-3 h-3" />
                              <span>{order.customerPhone}</span>
                            </a>
                          </td>
                          <td className="py-3 px-3 max-w-xs">
                            <p className="text-[11px] text-slate-700 truncate">{order.deliveryAddress}</p>
                            <span className="text-[10px] text-slate-400">{order.customerDistrict}</span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-bold text-[10px] text-slate-800 block">
                              {order.shippingMethodLabel || order.shippingMethod}
                            </span>
                            {order.shipment ? (
                              <span className="font-mono text-[10px] text-blue-600 mt-0.5 block">
                                Resi: {order.shipment.trackingNumber}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setShipmentOrderTarget(order);
                                  setIsCreateShipmentOpen(true);
                                }}
                                className="text-[10px] text-blue-600 underline font-bold mt-0.5 block"
                              >
                                + Buat Resi
                              </button>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${
                              order.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                              order.paymentStatus === 'WAITING_VERIFICATION' ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300' :
                              'bg-rose-100 text-rose-800'
                            }`}>
                              {order.paymentStatus}
                            </span>
                            {order.paymentProof && (
                              <span className="text-[9px] text-blue-600 block mt-1 font-semibold">
                                *Ada bukti bayar
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800">
                              {order.orderStatus}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-black text-right text-slate-900">
                            Rp {order.total.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedOrder(order)}
                              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
                            >
                              Tinjau
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 3: PRODUCTS & STOCKS CRUD */}
        {/* ========================================== */}
        {activeTab === 'products' && (
          <div className="flex flex-col gap-5 animate-fadeIn">
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">Katalog Produk & Stok Toko</h3>
                <p className="text-xs text-slate-400">Kelola harga, foto, variasi kemasan, SKU, dan ketersediaan stok</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingProduct(null);
                  setProductForm({
                    name: '',
                    sku: `TS-${Date.now().toString().slice(-4)}`,
                    categoryId: categories[0]?.id || '',
                    description: '',
                    basePrice: 10000,
                    stock: 50,
                    unit: 'pcs',
                    isActive: true,
                    images: [],
                    variations: []
                  });
                  setIsProductModalOpen(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-4 py-2.5 rounded-2xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/10"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Produk Baru</span>
              </button>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map(product => {
                const isLowStock = product.stock <= 5;
                const cat = categories.find(c => c.id === product.categoryId);

                return (
                  <div key={product.id} className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between gap-3">
                    <div className="flex gap-3">
                      <img
                        src={product.images[0] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60'}
                        alt={product.name}
                        className="w-18 h-18 rounded-2xl object-cover bg-slate-100 shrink-0 border border-slate-200"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-slate-400 font-semibold">{product.sku}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${product.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                            {product.isActive ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </div>
                        <h4 className="font-extrabold text-xs text-slate-900 mt-0.5 line-clamp-2 leading-tight">
                          {product.name}
                        </h4>
                        <span className="text-[10px] text-blue-600 font-bold block mt-1">
                          {cat?.name || 'Kategori Umum'}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold">Harga Dasar:</span>
                        <span className="font-black text-slate-900">
                          Rp {product.basePrice.toLocaleString('id-ID')}
                        </span>
                        <span className="text-[10px] text-slate-400">/{product.unit}</span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block font-bold">Stok:</span>
                        <span className={`font-black ${isLowStock ? 'text-rose-600' : 'text-slate-900'}`}>
                          {product.stock} {product.unit}
                        </span>
                        {isLowStock && (
                          <span className="text-[9px] text-rose-500 font-bold block">*Menipis</span>
                        )}
                      </div>
                    </div>

                    {/* Variations Preview if any */}
                    {product.variations && product.variations.length > 0 && (
                      <div className="p-2 bg-slate-50 rounded-xl text-[10px] text-slate-600">
                        <span className="font-bold text-slate-500">Variasi ({product.variations[0].options.length} pilihan): </span>
                        <span>{product.variations[0].options.map(o => o.name).join(', ')}</span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProduct(product);
                          setProductForm({
                            name: product.name,
                            sku: product.sku,
                            categoryId: product.categoryId,
                            description: product.description,
                            basePrice: product.basePrice,
                            stock: product.stock,
                            unit: product.unit,
                            isActive: product.isActive,
                            images: product.images || [],
                            variations: product.variations || []
                          });
                          setIsProductModalOpen(true);
                        }}
                        className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(product.id, product.name)}
                        className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 4: CATEGORIES CRUD */}
        {/* ========================================== */}
        {activeTab === 'categories' && (
          <div className="flex flex-col gap-5 animate-fadeIn">
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">Kategori Toko Tumpang Shop</h3>
                <p className="text-xs text-slate-400">Atur kategori etalase produk belanja untuk memudahkan pelanggan</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingCategory(null);
                  setCategoryForm({
                    name: '',
                    slug: '',
                    description: '',
                    icon: 'Package',
                    isActive: true
                  });
                  setIsCategoryModalOpen(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-4 py-2.5 rounded-2xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/10"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Kategori Baru</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {categories.map(cat => {
                const productCount = products.filter(p => p.categoryId === cat.id).length;

                return (
                  <div key={cat.id} className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-slate-400">slug: {cat.slug}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${cat.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                          {cat.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                      <h4 className="font-extrabold text-sm text-slate-900 mt-2">{cat.name}</h4>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{cat.description}</p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-bold">
                        {productCount} Produk Terkait
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategory(cat);
                            setCategoryForm({
                              name: cat.name,
                              slug: cat.slug,
                              description: cat.description,
                              icon: cat.icon,
                              isActive: cat.isActive
                            });
                            setIsCategoryModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                          title="Edit Kategori"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat.id, cat.name)}
                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors cursor-pointer"
                          title="Hapus Kategori"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 5: SHIPMENTS & AIRWAY BILL TRACKING */}
        {/* ========================================== */}
        {activeTab === 'shipments' && (
          <div className="flex flex-col gap-5 animate-fadeIn">
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">Manajemen Pengiriman & Nomor Resi</h3>
                <p className="text-xs text-slate-400">Pembaruan status kargo lokal & jalur internasional China 🇨🇳 → Indonesia 🇮🇩</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-bold">Total: {shipments.length} Paket</span>
              </div>
            </div>

            {shipments.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center text-slate-400 text-xs border border-slate-200/80 shadow-xs">
                Belum ada data pengiriman paket.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {shipments.map(shipment => (
                  <div key={shipment.id} className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between gap-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Truck className="w-4 h-4 text-blue-600" />
                          <span className="font-bold text-xs text-slate-800">{shipment.courierName}</span>
                        </div>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                          shipment.scope === 'INTERNATIONAL' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {shipment.scope === 'INTERNATIONAL' ? 'Impor China 🇨🇳' : 'Lokal 🇮🇩'}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 block uppercase">Nomor Resi:</span>
                          <span className="font-mono font-black text-sm text-slate-900">{shipment.trackingNumber}</span>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-600 text-white shadow-2xs">
                          {shipment.statusLabel}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                        <div>
                          <span className="text-slate-400 text-[10px] block font-bold">No. Pesanan:</span>
                          <span className="font-mono font-bold text-slate-800">{shipment.orderNumber}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[10px] block font-bold">Estimasi Tiba:</span>
                          <span className="font-bold text-slate-800">{shipment.estimatedArrival}</span>
                        </div>
                      </div>

                      <div className="mt-2 text-[11px] text-slate-600">
                        <span className="text-slate-400 text-[10px] block font-bold">Rute Pengiriman:</span>
                        <span className="font-bold text-slate-800">{shipment.originCity} ➔ {shipment.destinationCity}</span>
                      </div>

                      {/* Last Event Milestone */}
                      {shipment.trackingHistory && shipment.trackingHistory.length > 0 && (
                        <div className="mt-3 p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-[11px]">
                          <span className="text-[10px] font-black text-blue-800 uppercase block">Pembaruan Terkini:</span>
                          <p className="text-slate-700 font-medium mt-0.5">{shipment.trackingHistory[0].description}</p>
                          <span className="text-[10px] text-slate-400 block mt-1">
                            📍 {shipment.trackingHistory[0].location} • {new Date(shipment.trackingHistory[0].timestamp).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-400 italic">
                        {shipment.trackingHistory?.length || 0} riwayat tercatat
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedShipment(shipment);
                          setNewShipmentStatus(shipment.status);
                          setShipmentLocation(shipment.originCity);
                          setShipmentDescription('');
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Update Status & Resi</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 6: REPORTS & TRANSACTIONS BY DATE */}
        {/* ========================================== */}
        {activeTab === 'reports' && (
          <div className="flex flex-col gap-5 animate-fadeIn">
            {/* Date Range Selector Header */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">Laporan Transaksi & Omzet</h3>
                <p className="text-xs text-slate-400">Pilih rentang tanggal untuk menganalisis pendapatan dan pesanan lunas</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Dari Tanggal:</label>
                  <input
                    type="date"
                    value={reportStartDate}
                    onChange={(e) => setReportStartDate(e.target.value)}
                    className="px-3 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Sampai Tanggal:</label>
                  <input
                    type="date"
                    value={reportEndDate}
                    onChange={(e) => setReportEndDate(e.target.value)}
                    className="px-3 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-bold focus:outline-none"
                  />
                </div>

                <div className="self-end">
                  <button
                    type="button"
                    onClick={loadTransactionReport}
                    disabled={isLoadingReport}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingReport ? 'animate-spin' : ''}`} />
                    <span>Terapkan</span>
                  </button>
                </div>

                <div className="self-end">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                    title="Cetak Laporan"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Cetak</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Report Metric Summary */}
            {reportData && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                <div className="bg-white p-4.5 rounded-3xl border border-slate-200/80 shadow-xs">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Omzet Lunas Periode Ini</span>
                  <h3 className="font-black text-xl text-emerald-600 mt-1">
                    Rp {(reportData.summary?.totalRevenue || 0).toLocaleString('id-ID')}
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {reportData.summary?.paidOrdersCount || 0} pesanan terverifikasi
                  </p>
                </div>

                <div className="bg-white p-4.5 rounded-3xl border border-slate-200/80 shadow-xs">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total Transaksi</span>
                  <h3 className="font-black text-xl text-slate-900 mt-1">
                    {reportData.summary?.totalOrders || 0}
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {reportData.summary?.cancelledOrdersCount || 0} batal / gagal
                  </p>
                </div>

                <div className="bg-white p-4.5 rounded-3xl border border-slate-200/80 shadow-xs">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Barang Terjual</span>
                  <h3 className="font-black text-xl text-blue-600 mt-1">
                    {reportData.summary?.totalItemsSold || 0} item
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Akumulasi produk lunas
                  </p>
                </div>

                <div className="bg-white p-4.5 rounded-3xl border border-slate-200/80 shadow-xs">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Rata-rata Order</span>
                  <h3 className="font-black text-xl text-slate-900 mt-1">
                    Rp {(reportData.summary?.averageOrderValue || 0).toLocaleString('id-ID')}
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Basket size per transaksi
                  </p>
                </div>
              </div>
            )}

            {/* Report Orders Table */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs">
              <h4 className="font-extrabold text-sm text-slate-900 mb-3">
                Rincian Transaksi ({reportData?.orders?.length || 0})
              </h4>

              {reportData?.orders?.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Tidak ada transaksi pada rentang tanggal yang dipilih.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 text-[10px] font-black uppercase">
                        <th className="py-2.5 px-3">Tanggal</th>
                        <th className="py-2.5 px-3">No. Pesanan</th>
                        <th className="py-2.5 px-3">Pelanggan</th>
                        <th className="py-2.5 px-3">Layanan Pengiriman</th>
                        <th className="py-2.5 px-3">Status Bayar</th>
                        <th className="py-2.5 px-3">Status Pesanan</th>
                        <th className="py-2.5 px-3 text-right">Nilai Transaksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reportData?.orders?.map((order: ShopOrder) => (
                        <tr key={order.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                            {new Date(order.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-900">{order.orderNumber}</td>
                          <td className="py-3 px-3 font-bold text-slate-800">{order.customerName}</td>
                          <td className="py-3 px-3 text-slate-600">{order.shippingMethodLabel || order.shippingMethod}</td>
                          <td className="py-3 px-3">
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                              order.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                              order.paymentStatus === 'WAITING_VERIFICATION' ? 'bg-amber-100 text-amber-800' :
                              'bg-rose-100 text-rose-800'
                            }`}>
                              {order.paymentStatus}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-bold text-blue-700">{order.orderStatus}</td>
                          <td className="py-3 px-3 font-black text-right text-slate-900">
                            Rp {order.total.toLocaleString('id-ID')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 7: SETTINGS, QRIS, & SHIPPING FEES */}
        {/* ========================================== */}
        {activeTab === 'settings' && settingsForm && (
          <div className="max-w-2xl mx-auto flex flex-col gap-6 animate-fadeIn">
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col gap-4">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">Pengaturan Toko & Konfigurasi Tarif</h3>
                <p className="text-xs text-slate-400">Konfigurasi alamat toko, nomor resmi, gambar QRIS, dan tarif dasar</p>
              </div>

              <form onSubmit={handleSaveSettings} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nama Toko Tumpang Shop
                  </label>
                  <input
                    type="text"
                    required
                    value={settingsForm.storeName}
                    onChange={(e) => setSettingsForm({ ...settingsForm, storeName: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Alamat Lengkap Toko / Titik Penjemputan
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={settingsForm.storeAddress}
                    onChange={(e) => setSettingsForm({ ...settingsForm, storeAddress: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nomor Telepon / WhatsApp Resmi
                    </label>
                    <input
                      type="tel"
                      required
                      value={settingsForm.storePhone}
                      onChange={(e) => setSettingsForm({ ...settingsForm, storePhone: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Status Buka Toko
                    </label>
                    <select
                      value={settingsForm.isOpen ? 'open' : 'closed'}
                      onChange={(e) => setSettingsForm({ ...settingsForm, isOpen: e.target.value === 'open' })}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800"
                    >
                      <option value="open">🟢 Toko Buka (Menerima Pesanan)</option>
                      <option value="closed">🔴 Toko Tutup (Pesanan Ditutup)</option>
                    </select>
                  </div>
                </div>

                {/* Fees Configuration */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col gap-3">
                  <h4 className="font-extrabold text-xs text-slate-800">Tarif & Batasan Belanja Toko</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Ongkir Instan Default (Rp)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="500"
                        required
                        value={settingsForm.defaultDeliveryFee}
                        onChange={(e) => setSettingsForm({ ...settingsForm, defaultDeliveryFee: Number(e.target.value) })}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Biaya Layanan (Rp)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="500"
                        required
                        value={settingsForm.serviceFee}
                        onChange={(e) => setSettingsForm({ ...settingsForm, serviceFee: Number(e.target.value) })}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Min. Belanja (Rp)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        required
                        value={settingsForm.minOrderAmount}
                        onChange={(e) => setSettingsForm({ ...settingsForm, minOrderAmount: Number(e.target.value) })}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* QRIS Image Configuration */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col gap-3">
                  <h4 className="font-extrabold text-xs text-slate-800">Gambar QRIS Toko</h4>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <img
                      src={settingsForm.qrisImage || 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=400&auto=format&fit=crop&q=60'}
                      alt="Pratinjau QRIS"
                      className="w-32 h-32 rounded-2xl object-cover bg-white border border-slate-200 shrink-0"
                    />

                    <div className="flex-1 w-full flex flex-col gap-2">
                      <label className="block text-[11px] font-bold text-slate-600">
                        Upload Foto QRIS Baru
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleQrisPhotoUpload}
                        className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                      />
                      <p className="text-[10px] text-slate-400">
                        Foto akan dikompresi otomatis agar ukuran kecil dan terbaca jelas oleh aplikasi perbankan/e-wallet.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="mt-2 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold py-3 rounded-2xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSavingSettings ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Menyimpan Pengaturan...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Simpan Seluruh Pengaturan</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* ========================================== */}
      {/* MODAL 1: ORDER DETAIL & VERIFICATION */}
      {/* ========================================== */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 border border-slate-200 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400">Rincian Pesanan Pelanggan</span>
                <h3 className="font-mono font-black text-lg text-slate-900">{selectedOrder.orderNumber}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="p-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status Badges */}
            <div className="flex items-center gap-2">
              <span className={`text-xs font-black px-3 py-1 rounded-full ${
                selectedOrder.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                selectedOrder.paymentStatus === 'WAITING_VERIFICATION' ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300' :
                'bg-rose-100 text-rose-800'
              }`}>
                Bayar: {selectedOrder.paymentStatus}
              </span>
              <span className="text-xs font-black px-3 py-1 rounded-full bg-blue-100 text-blue-800">
                Alur: {selectedOrder.orderStatus}
              </span>
            </div>

            {/* Customer Details */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Nama:</span>
                <span className="font-black text-slate-800">{selectedOrder.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">WhatsApp:</span>
                <a 
                  href={`https://wa.me/${selectedOrder.customerPhone.replace(/[^0-9]/g, '')}`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="font-bold text-emerald-600 hover:underline flex items-center gap-1"
                >
                  <Phone className="w-3 h-3" />
                  <span>{selectedOrder.customerPhone}</span>
                </a>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Alamat:</span>
                <span className="font-medium text-slate-800 text-right max-w-xs">{selectedOrder.deliveryAddress}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Kecamatan:</span>
                <span className="font-bold text-slate-800">{selectedOrder.customerDistrict}</span>
              </div>
              {selectedOrder.deliveryNotes && (
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Catatan:</span>
                  <span className="text-slate-600 italic text-right max-w-xs">{selectedOrder.deliveryNotes}</span>
                </div>
              )}
            </div>

            {/* Items Ordered */}
            <div>
              <h5 className="text-[11px] font-black uppercase text-slate-400 mb-2">Item Belanja ({selectedOrder.items.length})</h5>
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                {selectedOrder.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1.5 border-b border-slate-100 text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{item.name}</p>
                      {item.selectedVariation && (
                        <p className="text-[10px] text-blue-600 font-medium">Varian: {item.selectedVariation.optionName}</p>
                      )}
                      <p className="text-[10px] text-slate-400">{item.quantity} x Rp {item.price.toLocaleString('id-ID')}</p>
                    </div>
                    <span className="font-extrabold text-slate-900">Rp {item.subtotal.toLocaleString('id-ID')}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bill Summary */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal Produk:</span>
                <span>Rp {selectedOrder.subtotal.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Ongkir ({selectedOrder.shippingMethodLabel || selectedOrder.shippingMethod}):</span>
                <span>Rp {selectedOrder.deliveryFee.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Biaya Layanan:</span>
                <span>Rp {selectedOrder.serviceFee.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Kode Unik:</span>
                <span>+{selectedOrder.uniqueCode}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between font-black text-sm text-slate-900">
                <span>Total Tagihan:</span>
                <span className="text-blue-700">Rp {selectedOrder.total.toLocaleString('id-ID')}</span>
              </div>
            </div>

            {/* Payment Proof Section */}
            {selectedOrder.paymentProof && (
              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl flex flex-col gap-2">
                <span className="text-[11px] font-black uppercase text-amber-800 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Bukti Transfer Pembayaran Pelanggan:
                </span>
                <a 
                  href={selectedOrder.paymentProof} 
                  target="_blank" 
                  rel="noreferrer"
                  className="block relative group overflow-hidden rounded-xl border border-amber-200"
                >
                  <img
                    src={selectedOrder.paymentProof}
                    alt="Bukti Transfer"
                    className="w-full max-h-56 object-cover bg-white"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                    <ExternalLink className="w-4 h-4" />
                    <span>Klik untuk melihat foto ukuran penuh</span>
                  </div>
                </a>
              </div>
            )}

            {/* Verification Actions */}
            {selectedOrder.paymentStatus === 'WAITING_VERIFICATION' && (
              <div className="flex flex-col gap-2 p-3 bg-amber-50 rounded-2xl border border-amber-200">
                <p className="text-xs font-bold text-amber-900">Tindakan Verifikasi Pembayaran:</p>
                
                {showRejectInput ? (
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="Masukkan alasan penolakan bukti bayar..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="px-3 py-2 text-xs rounded-xl bg-white border border-rose-300 focus:outline-none"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleVerifyPayment(selectedOrder.id, false)}
                        disabled={isProcessingOrder}
                        className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                      >
                        Konfirmasi Tolak
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRejectInput(false)}
                        className="py-2 px-3 bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleVerifyPayment(selectedOrder.id, true)}
                      disabled={isProcessingOrder}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Setujui Pembayaran (LUNAS)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRejectInput(true)}
                      className="py-2.5 px-4 bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      Tolak Bukti
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Order Flow Status Changer */}
            <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
              <span className="text-[11px] font-bold text-slate-500">Ubah Alur Status Pesanan:</span>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {[
                  ShopOrderStatus.NEW,
                  ShopOrderStatus.PROCESSING,
                  ShopOrderStatus.PACKED,
                  ShopOrderStatus.SHIPPED,
                  ShopOrderStatus.COMPLETED
                ].map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleUpdateOrderStatus(selectedOrder.id, st)}
                    disabled={selectedOrder.orderStatus === st || isProcessingOrder}
                    className={`py-1.5 text-[10px] font-extrabold rounded-lg border transition-colors cursor-pointer ${
                      selectedOrder.orderStatus === st 
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs' 
                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {selectedOrder.orderStatus !== ShopOrderStatus.CANCELLED && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Batalkan pesanan ini? Stok produk akan dikembalikan otomatis.')) {
                      handleUpdateOrderStatus(selectedOrder.id, ShopOrderStatus.CANCELLED);
                    }
                  }}
                  className="mt-1 text-xs text-rose-600 hover:text-rose-800 font-bold text-left cursor-pointer"
                >
                  ✕ Batalkan Pesanan Ini (Kembalikan Stok)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 2: PRODUCT CREATE / EDIT */}
      {/* ========================================== */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 border border-slate-200 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-base text-slate-900">
                {editingProduct ? 'Edit Produk Belanja' : 'Tambah Produk Belanja Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setIsProductModalOpen(false)}
                className="p-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Produk <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Beras Premium Petani Tumpang 5kg"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    SKU Kode Produk <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="TS-SBK-001"
                    value={productForm.sku}
                    onChange={(e) => setProductForm({ ...productForm, sku: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Kategori <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={productForm.categoryId}
                    onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-800"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Harga Dasar (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="100"
                    step="500"
                    required
                    value={productForm.basePrice}
                    onChange={(e) => setProductForm({ ...productForm, basePrice: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 font-black text-blue-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Stok Tersedia <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={productForm.stock}
                    onChange={(e) => setProductForm({ ...productForm, stock: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 font-black text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Satuan Unit
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="kg / pcs / liter"
                    value={productForm.unit}
                    onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Deskripsi Lengkap
                </label>
                <textarea
                  rows={2}
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  placeholder="Keterangan mutu produk, saran penyimpanan, berat bersih..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none"
                />
              </div>

              {/* Photos Management */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col gap-2">
                <span className="text-xs font-bold text-slate-700">Foto Produk:</span>
                
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleProductPhotoUpload}
                    className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white cursor-pointer"
                  />
                </div>

                {productForm.images.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto py-1">
                    {productForm.images.map((img, i) => (
                      <div key={i} className="relative group shrink-0">
                        <img src={img} alt="Foto" className="w-14 h-14 rounded-xl object-cover border border-slate-200" />
                        <button
                          type="button"
                          onClick={() => setProductForm(prev => ({ ...prev, images: prev.images.filter((_, idx) => idx !== i) }))}
                          className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full p-0.5 shadow-xs cursor-pointer"
                          title="Hapus Foto"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status Switcher */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-700">Status Produk Aktif:</span>
                <input
                  type="checkbox"
                  checked={productForm.isActive}
                  onChange={(e) => setProductForm({ ...productForm, isActive: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingProduct}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-black text-xs rounded-xl cursor-pointer flex items-center gap-1.5 shadow-md shadow-blue-600/10"
                >
                  {isSavingProduct ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Simpan Produk</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 3: CATEGORY CREATE / EDIT */}
      {/* ========================================== */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 border border-slate-200 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-base text-slate-900">
                {editingCategory ? 'Edit Kategori' : 'Tambah Kategori Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="p-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Kategori <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Sembako & Kebutuhan Pokok"
                  value={categoryForm.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                    setCategoryForm({ ...categoryForm, name, slug: editingCategory ? categoryForm.slug : slug });
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Slug URL <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={categoryForm.slug}
                  onChange={(e) => setCategoryForm({ ...categoryForm, slug: e.target.value.toLowerCase() })}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Deskripsi Kategori
                </label>
                <textarea
                  rows={2}
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  placeholder="Keterangan kategori..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-700">Status Aktif:</span>
                <input
                  type="checkbox"
                  checked={categoryForm.isActive}
                  onChange={(e) => setCategoryForm({ ...categoryForm, isActive: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingCategory}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-black text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
                >
                  {isSavingCategory ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Simpan Kategori</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 4: UPDATE SHIPMENT STATUS & EVENTS */}
      {/* ========================================== */}
      {selectedShipment && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 border border-slate-200 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400">Pembaruan Paket</span>
                <h3 className="font-mono font-black text-base text-slate-900">{selectedShipment.trackingNumber}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedShipment(null)}
                className="p-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateShipmentStatus} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Status Pengiriman Baru <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={newShipmentStatus}
                  onChange={(e) => setNewShipmentStatus(e.target.value as ShopShipmentStatus)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 font-bold text-blue-700"
                >
                  <option value={ShopShipmentStatus.WAITING_DISPATCH}>Menunggu Pengiriman (WAITING_DISPATCH)</option>
                  <option value={ShopShipmentStatus.PROCESSING}>Diproses di Gudang (PROCESSING)</option>
                  <option value={ShopShipmentStatus.DISPATCHED}>Dikirim dari Asal (DISPATCHED)</option>
                  <option value={ShopShipmentStatus.IN_TRANSIT}>Dalam Perjalanan Transit (IN_TRANSIT)</option>
                  <option value={ShopShipmentStatus.ARRIVED_INDONESIA}>Tiba di Indonesia Port CGK (ARRIVED_INDONESIA)</option>
                  <option value={ShopShipmentStatus.CUSTOMS_CLEARANCE}>Pemeriksaan Bea Cukai (CUSTOMS_CLEARANCE)</option>
                  <option value={ShopShipmentStatus.CUSTOMS_HOLD}>Tertahan Bea Cukai (CUSTOMS_HOLD)</option>
                  <option value={ShopShipmentStatus.TRANSFERRED_LOCAL_COURIER}>Diteruskan Kurir Lokal (TRANSFERRED_LOCAL_COURIER)</option>
                  <option value={ShopShipmentStatus.OUT_FOR_DELIVERY}>Dalam Pengantaran ke Rumah (OUT_FOR_DELIVERY)</option>
                  <option value={ShopShipmentStatus.DELIVERED}>Terkirim ke Penerima (DELIVERED)</option>
                  <option value={ShopShipmentStatus.FAILED_DELIVERY}>Gagal Dikirim (FAILED_DELIVERY)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Lokasi Posisi Saat Ini
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Terminal Kargo CGK / Gudang Tumpang"
                  value={shipmentLocation}
                  onChange={(e) => setShipmentLocation(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Keterangan / Catatan Linimasa
                </label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Paket telah selesai proses customs clearance dan diserahkan ke armada pengantaran."
                  value={shipmentDescription}
                  onChange={(e) => setShipmentDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none"
                />
              </div>

              {/* Existing History */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-black uppercase text-slate-400 block mb-2">
                  Riwayat Tahapan ({selectedShipment.trackingHistory.length})
                </span>
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                  {selectedShipment.trackingHistory.map((evt, i) => (
                    <div key={i} className="text-[11px] pb-1.5 border-b border-slate-100 last:border-0">
                      <div className="flex items-center justify-between font-bold text-slate-800">
                        <span>{evt.statusLabel}</span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(evt.timestamp).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-0.5">{evt.description}</p>
                      <span className="text-[9.5px] text-slate-400">📍 {evt.location}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedShipment(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingShipment}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-black text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
                >
                  {isUpdatingShipment ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Simpan Status Baru</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 5: CREATE SHIPMENT FOR ORDER */}
      {/* ========================================== */}
      {isCreateShipmentOpen && shipmentOrderTarget && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 border border-slate-200 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400">Buat Resi Pengiriman</span>
                <h3 className="font-mono font-black text-base text-slate-900">{shipmentOrderTarget.orderNumber}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateShipmentOpen(false)}
                className="p-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateShipmentSubmit} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Pilih Layanan Kurir / Jalur
                </label>
                <select
                  value={createShipmentCourier}
                  onChange={(e) => setCreateShipmentCourier(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800"
                >
                  <option value="TUMPANG_LOCAL">Kurir Toko Tumpang Go (Lokal)</option>
                  <option value="DOMESTIC_EXPEDITION">Ekspedisi Domestik Reguler (J&T / JNE)</option>
                  <option value="CHINA_ID_CROSSBORDER">Layanan Impor China 🇨🇳 → Indonesia 🇮🇩</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nomor Resi Kustom (Kosongkan untuk otomatis)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: TS-EXP-20261011-001"
                  value={createShipmentCustomResi}
                  onChange={(e) => setCreateShipmentCustomResi(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateShipmentOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingShipment}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Terbitkan Resi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
