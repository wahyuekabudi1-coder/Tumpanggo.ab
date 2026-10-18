/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Admin Dashboard
 * Comprehensive operational management portal for system administration,
 * order tracking, payment verification, partner governance, and financial settlements.
 */

import React, { useState, useEffect } from 'react';
import { 
  Order, OrderStatus, Merchant, Driver, Settlement, SettlementStatus, SystemConfig 
} from '../types.ts';
import { safeStorage } from '../utils/safeStorage.ts';
import { apiFetch as fetch, extractArrayResponse } from '../utils/apiClient.ts';
import { 
  ShieldCheck, CheckSquare, ClipboardList, Store, Users, DollarSign, Settings, 
  Check, X, FileText, AlertTriangle, Truck, RefreshCw, ZoomIn, Eye,
  UserPlus, Search, ArrowUpRight, Clock, Phone, MapPin, Building,
  CheckCircle2, XCircle, ChevronRight, Sliders, ArrowDownRight, Wallet, LogOut,
  QrCode, ExternalLink
} from 'lucide-react';

interface AdminViewProps {
  onLogout: () => void;
  systemConfig: SystemConfig;
  onUpdateConfig: (config: SystemConfig) => void;
}

export default function AdminView({ onLogout, systemConfig, onUpdateConfig }: AdminViewProps) {
  // Tabs: 'verify' | 'orders' | 'merchants' | 'drivers' | 'partners' | 'settlements' | 'settings'
  const [activeTab, setActiveTab] = useState<'verify' | 'orders' | 'merchants' | 'drivers' | 'partners' | 'settlements' | 'settings'>('verify');
  const [orders, setOrders] = useState<Order[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [partnerRegistrations, setPartnerRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');
  const [merchantSearchQuery, setMerchantSearchQuery] = useState('');

  // States for editing merchant email
  const [editingMerchantId, setEditingMerchantId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  // States for editing driver email
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const [editingDriverEmail, setEditingDriverEmail] = useState('');
  const [savingDriverEmail, setSavingDriverEmail] = useState(false);

  // Modal / Selection states
  const [paymentRejectModal, setPaymentRejectModal] = useState<{ orderId: string; reason: string } | null>(null);
  const [assignDriverModal, setAssignDriverModal] = useState<{ orderId: string; selectedDriverId: string } | null>(null);
  const [showImageModal, setShowImageModal] = useState<string | null>(null);

  // Settlement creation form states
  const [selectedSettlementMerchantId, setSelectedSettlementMerchantId] = useState('');
  const [previewSettlement, setPreviewSettlement] = useState<{ orderCount: number; totalSales: number; commission: number; netAmount: number; eligibleOrders: Order[] } | null>(null);

  // Config settings form states
  const [qrisInput, setQrisInput] = useState(systemConfig.qrisImage || '');
  const [deliveryFeeInput, setDeliveryFeeInput] = useState(systemConfig.defaultDeliveryFee || 5000);
  const [serviceFeeInput, setServiceFeeInput] = useState(systemConfig.serviceFee || 2000);
  const [commissionPercentInput, setCommissionPercentInput] = useState(systemConfig.commissionPercent || 10);
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [ordData, merData, drData, setData, prData] = await Promise.all([
        fetch('/api/orders').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/merchants').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/drivers').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/settlements').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/partner-registrations').then(r => r.ok ? r.json() : []).catch(() => [])
      ]);
      setOrders(extractArrayResponse<Order>(ordData, 'orders'));
      setMerchants(extractArrayResponse<Merchant>(merData, 'merchants'));
      setDrivers(extractArrayResponse<Driver>(drData, 'drivers'));
      setSettlements(extractArrayResponse<Settlement>(setData, 'settlements'));
      setPartnerRegistrations(extractArrayResponse<any>(prData, 'partnerRegistrations'));
    } catch (e) {
      console.error('Failed to fetch admin data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleApprovePartner = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menyetujui pendaftaran mitra ini? Toko/Kurir baru akan otomatis aktif di sistem.')) return;
    try {
      const reg = partnerRegistrations.find(r => r.id === id);
      const res = await fetch(`/api/partner-registrations/${id}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'admin' })
      });
      if (res.ok) {
        const approvedData = await res.json();
        const approvedReg = approvedData.registration;

        if (reg && reg.type === 'MERCHANT') {
          const simulatedEmail = {
            id: 'email_' + Math.random().toString(36).substr(2, 9),
            to: reg.email,
            from: 'Tumpang Go Admin <admin@tumpanggo.com>',
            subject: `🎉 Pendaftaran Toko ${approvedReg?.storeName || reg.storeName || reg.name} Disetujui!`,
            body: `Halo ${approvedReg?.name || reg.name},\n\nSelamat! Pendaftaran kemitraan Anda untuk "${approvedReg?.storeName || reg.storeName || (reg.name + ' Store')}" telah disetujui.\n\nAkun Anda telah aktif secara otomatis. Berikut adalah data akses portal merchant Anda:\n\nEmail: ${approvedReg?.email || reg.email}\nKata Sandi: ${approvedReg?.password || 'TF-1234'}\n\nSilakan masuk melalui portal merchant:\n${window.location.origin}/?role=merchant&id=${approvedReg?.storeId || ''}`,
            linkUrl: `?role=merchant&id=${approvedReg?.storeId || ''}`,
            createdAt: new Date().toISOString(),
            read: false
          };
          const existingEmailsStr = safeStorage.getItem('tumpang_simulated_emails') || '[]';
          const existingEmails = JSON.parse(existingEmailsStr);
          existingEmails.unshift(simulatedEmail);
          safeStorage.setItem('tumpang_simulated_emails', JSON.stringify(existingEmails));
          window.dispatchEvent(new Event('tumpang_new_email'));
        }

        alert(`Pendaftaran disetujui! Kata sandi baru: ${approvedReg?.password || 'Tersimpan otomatis'}.`);
        fetchAdminData();
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal menyetujui pendaftaran.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat menyetujui pendaftaran.');
    }
  };

  const handleRejectPartner = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menolak pendaftaran mitra ini?')) return;
    try {
      const res = await fetch(`/api/partner-registrations/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'admin' })
      });
      if (res.ok) {
        alert('Pendaftaran telah ditolak.');
        fetchAdminData();
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal menolak pendaftaran.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat menolak pendaftaran.');
    }
  };

  const handleSaveMerchantEmail = async (merchantId: string) => {
    setSavingEmail(true);
    try {
      const res = await fetch(`/api/merchants/${merchantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: editingEmail, userId: 'admin', role: 'ADMIN' })
      });
      if (res.ok) {
        setEditingMerchantId(null);
        setEditingEmail('');
        fetchAdminData();
      } else {
        alert('Gagal memperbarui email merchant.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat menyimpan email.');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSaveDriverEmail = async (driverId: string) => {
    setSavingDriverEmail(true);
    try {
      const res = await fetch(`/api/drivers/${driverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: editingDriverEmail, userId: 'admin', role: 'ADMIN' })
      });
      if (res.ok) {
        setEditingDriverId(null);
        setEditingDriverEmail('');
        fetchAdminData();
      } else {
        alert('Gagal memperbarui email driver.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat menyimpan email driver.');
    } finally {
      setSavingDriverEmail(false);
    }
  };

  const verifyPayment = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: OrderStatus.PAYMENT_VERIFIED, role: 'ADMIN' })
      });
      if (res.ok) {
        fetchAdminData();
        alert('Pembayaran BERHASIL diverifikasi! Pesanan diteruskan ke dapur merchant.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const rejectPayment = async (orderId: string, reason: string) => {
    if (!reason.trim()) {
      alert('Alasan penolakan wajib diisi.');
      return;
    }
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: OrderStatus.PAYMENT_REJECTED, 
          cancelReason: reason,
          role: 'ADMIN' 
        })
      });
      if (res.ok) {
        setPaymentRejectModal(null);
        fetchAdminData();
        alert('Pembayaran ditolak. Pelanggan akan mendapatkan notifikasi alasan penolakan.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const syncArtopayStatus = async (orderId: string) => {
    try {
      const res = await fetch(`/api/artopay/status/${orderId}?serviceType=FOOD`);
      const data = await res.json();
      if (data.isPaid) {
        alert('Status terbaru dari ArtoPay: LUNAS! Data pesanan telah diperbarui otomatis.');
      } else {
        alert(`Status ArtoPay: ${data.artopayStatus || 'PENDING'}. Pembayaran belum diselesaikan atau masih diproses.`);
      }
      fetchAdminData();
    } catch (e: any) {
      alert(`Gagal memeriksa status gateway: ${e.message}`);
    }
  };

  const assignDriver = async (orderId: string, driverId: string) => {
    if (!driverId) return;
    try {
      const res = await fetch(`/api/orders/${orderId}/assign-driver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId })
      });
      if (res.ok) {
        setAssignDriverModal(null);
        fetchAdminData();
        alert('Driver berhasil ditugaskan ke pesanan ini!');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleMerchantSelectForSettlement = (merchantId: string) => {
    setSelectedSettlementMerchantId(merchantId);
    if (!merchantId) {
      setPreviewSettlement(null);
      return;
    }

    const eligible = (Array.isArray(orders) ? orders : []).filter(o => 
      o &&
      o.merchantId === merchantId && 
      o.status === OrderStatus.COMPLETED && 
      !(o as any).settlementId
    );

    const totalSales = eligible.reduce((sum, o) => sum + o.subtotal, 0);
    const commission = Math.round(totalSales * ((systemConfig.commissionPercent || 10) / 100));
    const netAmount = totalSales - commission;

    setPreviewSettlement({
      orderCount: eligible.length,
      totalSales,
      commission,
      netAmount,
      eligibleOrders: eligible
    });
  };

  const createSettlement = async () => {
    if (!selectedSettlementMerchantId || !previewSettlement || previewSettlement.orderCount === 0) {
      alert('Tidak ada transaksi selesai yang dapat dicairkan.');
      return;
    }

    try {
      const res = await fetch('/api/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: selectedSettlementMerchantId,
          orderIds: previewSettlement.eligibleOrders.map(o => o.id),
          totalSales: previewSettlement.totalSales,
          totalCommission: previewSettlement.commission,
          amountToPay: previewSettlement.netAmount,
          orderCount: previewSettlement.orderCount
        })
      });

      if (res.ok) {
        alert('Settlement pencairan dana berhasil dibuat dengan status MENUNGGU TRANSFER!');
        setSelectedSettlementMerchantId('');
        setPreviewSettlement(null);
        fetchAdminData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const completeSettlementTransfer = async (settlementId: string) => {
    if (!confirm('Tandai settlement ini telah ditransfer ke rekening merchant?')) return;
    try {
      const res = await fetch(`/api/settlements/${settlementId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: SettlementStatus.SETTLEMENT_COMPLETED })
      });
      if (res.ok) {
        fetchAdminData();
        alert('Status settlement diperbarui menjadi TELAH DITRANSFER!');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const newConfig: SystemConfig = {
        ...systemConfig,
        qrisImage: qrisInput,
        defaultDeliveryFee: Number(deliveryFeeInput),
        serviceFee: Number(serviceFeeInput),
        commissionPercent: Number(commissionPercentInput)
      };
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdateConfig(updated);
        alert('Konfigurasi sistem operasional berhasil diperbarui!');
      } else {
        alert('Gagal menyimpan konfigurasi.');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingConfig(false);
    }
  };

  // Metrics
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safePartnerRegs = Array.isArray(partnerRegistrations) ? partnerRegistrations : [];
  const safeMerchants = Array.isArray(merchants) ? merchants : [];

  const pendingVerificationOrders = safeOrders.filter(o => o && o.status === OrderStatus.WAITING_PAYMENT_VERIFICATION);
  const activeOrders = safeOrders.filter(o => 
    o && [OrderStatus.COOKING, OrderStatus.READY_FOR_PICKUP, OrderStatus.ORDER_PICKED_UP].includes(o.status)
  );
  const completedOrders = safeOrders.filter(o => o && o.status === OrderStatus.COMPLETED);
  const pendingPartnerRegs = safePartnerRegs.filter(r => r && r.status === 'PENDING');
  const totalGrossRevenue = completedOrders.reduce((sum, o) => sum + (o?.total || 0), 0);
  const totalPlatformCommission = Math.round(completedOrders.reduce((sum, o) => sum + (o?.subtotal || 0) * 0.1, 0));

  const filteredOrders = safeOrders.filter(o => {
    if (!o) return false;
    const matchQuery = orderSearchQuery === '' || 
      (o.id || '').toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
      (o.customerName || '').toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
      (o.merchantName || '').toLowerCase().includes(orderSearchQuery.toLowerCase());
    const matchStatus = orderStatusFilter === 'ALL' || o.status === orderStatusFilter;
    return matchQuery && matchStatus;
  });

  const filteredMerchants = safeMerchants.filter(m => 
    m && (
      merchantSearchQuery === '' ||
      (m.name || '').toLowerCase().includes(merchantSearchQuery.toLowerCase()) ||
      (m.ownerName || '').toLowerCase().includes(merchantSearchQuery.toLowerCase()) ||
      (m.category && m.category.toLowerCase().includes(merchantSearchQuery.toLowerCase()))
    )
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white flex items-center justify-center shadow-sm font-display font-extrabold text-lg">
              tG
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-bold text-base sm:text-lg text-slate-900 tracking-tight">Admin Portal</h1>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                  TumpangGo
                </span>
              </div>
              <p className="text-xs text-slate-500">Pusat Kendali Operasional & Keuangan</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchAdminData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all cursor-pointer shadow-xs"
              title="Perbarui data"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
            >
              <LogOut className="w-3.5 h-3.5" />
              Keluar
            </button>
          </div>
        </div>

        {/* KPI Summary Strip */}
        <div className="border-t border-slate-100 bg-emerald-950 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 divide-y md:divide-y-0 md:divide-x divide-emerald-900/60">
              <div className="flex items-center gap-3 pt-2 md:pt-0">
                <div className="w-9 h-9 rounded-lg bg-emerald-900/80 border border-emerald-700/50 flex items-center justify-center text-emerald-300">
                  <CheckSquare className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">Verifikasi Pending</span>
                  <span className="font-display font-extrabold text-lg text-white">
                    {pendingVerificationOrders.length}
                    {pendingVerificationOrders.length > 0 && (
                      <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 md:pt-0 md:pl-4">
                <div className="w-9 h-9 rounded-lg bg-emerald-900/80 border border-emerald-700/50 flex items-center justify-center text-emerald-300">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">Pesanan Aktif</span>
                  <span className="font-display font-extrabold text-lg text-white">{activeOrders.length}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 md:pt-0 md:pl-4">
                <div className="w-9 h-9 rounded-lg bg-emerald-900/80 border border-emerald-700/50 flex items-center justify-center text-emerald-300">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">Total Omset Selesai</span>
                  <span className="font-display font-bold text-base text-white">Rp {totalGrossRevenue.toLocaleString('id-ID')}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 md:pt-0 md:pl-4">
                <div className="w-9 h-9 rounded-lg bg-emerald-900/80 border border-emerald-700/50 flex items-center justify-center text-emerald-300">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">Est. Komisi Platform</span>
                  <span className="font-display font-bold text-base text-emerald-300">Rp {totalPlatformCommission.toLocaleString('id-ID')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2.5 scrollbar-none" aria-label="Tabs">
            {[
              { id: 'verify', label: 'Verifikasi Pembayaran', count: pendingVerificationOrders.length, icon: CheckSquare },
              { id: 'orders', label: 'Kelola Pesanan', count: orders.length, icon: ClipboardList },
              { id: 'merchants', label: 'Mitra Merchant', count: merchants.length, icon: Store },
              { id: 'drivers', label: 'Mitra Driver', count: drivers.length, icon: Users },
              { id: 'partners', label: 'Pendaftaran Mitra', count: pendingPartnerRegs.length, icon: UserPlus },
              { id: 'settlements', label: 'Settlement & Payout', count: settlements.length, icon: DollarSign },
              { id: 'settings', label: 'Pengaturan Sistem', icon: Settings },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    isActive 
                      ? 'bg-emerald-600 text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-white text-emerald-800' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">

        {/* 1. TAB: VERIFIKASI PEMBAYARAN */}
        {activeTab === 'verify' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Antrean Verifikasi Pembayaran</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tinjau bukti transfer pembayaran QRIS pelanggan. Pastikan nominal dan 3 digit kode unik sesuai sebelum menyetujui.
                </p>
              </div>
              <span className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                {pendingVerificationOrders.length} Menunggu Konfirmasi
              </span>
            </div>

            {pendingVerificationOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h3 className="font-display font-bold text-base text-slate-900">Semua Pembayaran Telah Bersih</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  Tidak ada bukti pembayaran baru yang menunggu verifikasi admin saat ini. Pesanan baru akan otomatis muncul di sini.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {pendingVerificationOrders.map(order => (
                  <div key={order.id} className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col justify-between hover:border-emerald-300 transition-all">
                    <div>
                      {/* Card Header */}
                      <div className="p-4 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
                        <div>
                          <span className="font-mono text-xs font-bold text-slate-600">ID #{order.id.slice(-6).toUpperCase()}</span>
                          <span className="block text-[10px] text-slate-400">
                            {new Date(order.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                          </span>
                        </div>
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                          Perlu Verifikasi
                        </span>
                      </div>

                      {/* Customer & Merchant Info */}
                      <div className="p-4 space-y-3">
                        <div className="flex justify-between items-start text-xs pb-3 border-b border-slate-100">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pelanggan</span>
                            <span className="font-bold text-slate-800">{order.customerName}</span>
                            <span className="text-[11px] text-slate-500 block">{order.customerPhone}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Toko Merchant</span>
                            <span className="font-bold text-emerald-800">{order.merchantName}</span>
                          </div>
                        </div>

                        {/* Order Items Preview */}
                        <div className="bg-slate-50 rounded-xl p-2.5 space-y-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Rincian Menu</span>
                          {order.items.map((it, idx) => (
                            <div key={idx} className="flex justify-between text-xs text-slate-600">
                              <span>{it.quantity}x {it.name}</span>
                              <span className="font-mono font-medium">Rp {(it.price * it.quantity).toLocaleString('id-ID')}</span>
                            </div>
                          ))}
                        </div>

                        {/* Payment Breakdown */}
                        <div className="pt-1 text-xs space-y-1">
                          <div className="flex justify-between text-slate-500 text-[11px]">
                            <span>Subtotal Menu</span>
                            <span>Rp {order.subtotal.toLocaleString('id-ID')}</span>
                          </div>
                          <div className="flex justify-between text-slate-500 text-[11px]">
                            <span>Ongkir + Biaya Layanan</span>
                            <span>Rp {(order.deliveryFee + order.serviceFee).toLocaleString('id-ID')}</span>
                          </div>
                          <div className="flex justify-between text-amber-700 font-bold text-[11px]">
                            <span>Kode Unik Verifikasi</span>
                            <span className="font-mono bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">+{order.uniqueCode}</span>
                          </div>
                          <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-1.5 border-t border-slate-200">
                            <span>Total Harus Dibayar</span>
                            <span className="font-mono text-emerald-700 text-base">Rp {order.total.toLocaleString('id-ID')}</span>
                          </div>
                        </div>

                        {/* ArtoPay Gateway Information (if QRIS Dinamis) */}
                        {(order.paymentMethod === 'ARTOPAY_QRIS' || order.artopayPaymentId) && (
                          <div className="pt-2">
                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                                  <QrCode className="w-3.5 h-3.5 text-emerald-600" />
                                  QRIS Dinamis ArtoPay
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                  order.status === OrderStatus.PAYMENT_VERIFIED || order.artopayStatus === 'SUCCESS'
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {order.artopayStatus || 'PENDING'}
                                </span>
                              </div>

                              <div className="text-[11px] text-slate-600 space-y-0.5">
                                <div className="flex justify-between font-mono">
                                  <span className="text-slate-500 font-sans">Payment Intent ID:</span>
                                  <span className="font-bold text-slate-800 break-all">{order.artopayPaymentId || '-'}</span>
                                </div>
                                {order.artopayCheckoutUrl && (
                                  <div className="pt-1 flex items-center justify-between gap-2">
                                    <a
                                      href={order.artopayCheckoutUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 underline"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      Buka Sesi Checkout ArtoPay
                                    </a>
                                  </div>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => syncArtopayStatus(order.id)}
                                className="w-full py-1.5 px-2 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-lg text-emerald-800 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                              >
                                <RefreshCw className="w-3 h-3" />
                                Sinkronkan Status Gateway
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Proof Image Box */}
                        <div className="pt-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                            {order.paymentMethod === 'ARTOPAY_QRIS' ? 'Bukti Transfer Tambahan (Opsional)' : 'Bukti Transfer Pelanggan'}
                          </span>
                          {order.paymentProof ? (
                            <div 
                              onClick={() => setShowImageModal(order.paymentProof || null)}
                              className="relative group cursor-pointer rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-video flex items-center justify-center"
                            >
                              <img 
                                src={order.paymentProof} 
                                alt="Bukti Transfer" 
                                className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
                              />
                              <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5">
                                <ZoomIn className="w-4 h-4" />
                                Perbesar Bukti
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                              {order.paymentMethod === 'ARTOPAY_QRIS' 
                                ? 'Pembayaran menggunakan QRIS dinamis otomatis (tidak memerlukan upload manual).' 
                                : 'Bukti transfer belum diunggah oleh pelanggan.'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
                      <button
                        onClick={() => verifyPayment(order.id)}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        Verifikasi Valid
                      </button>

                      <button
                        onClick={() => setPaymentRejectModal({ orderId: order.id, reason: '' })}
                        className="py-2.5 px-3 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer"
                        title="Tolak Pembayaran"
                      >
                        <X className="w-4 h-4" />
                        Tolak
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. TAB: KELOLA PESANAN */}
        {activeTab === 'orders' && (
          <div className="space-y-5">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Kelola Semua Pesanan</h2>
                <p className="text-xs text-slate-500 mt-0.5">Pantau status seluruh pesanan, penugasan driver, dan riwayat pesanan.</p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Cari ID, pelanggan, toko..."
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 w-48 sm:w-60"
                  />
                </div>

                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                  className="py-1.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 font-medium"
                >
                  <option value="ALL">Semua Status</option>
                  <option value={OrderStatus.WAITING_PAYMENT}>Menunggu Pembayaran</option>
                  <option value={OrderStatus.WAITING_PAYMENT_VERIFICATION}>Perlu Verifikasi Admin</option>
                  <option value={OrderStatus.PAYMENT_VERIFIED}>Pembayaran Terverifikasi</option>
                  <option value={OrderStatus.COOKING}>Sedang Dimasak</option>
                  <option value={OrderStatus.READY_FOR_PICKUP}>Siap Diambil Kurir</option>
                  <option value={OrderStatus.ORDER_PICKED_UP}>Dalam Pengantaran</option>
                  <option value={OrderStatus.COMPLETED}>Selesai Diterima</option>
                  <option value={OrderStatus.PAYMENT_REJECTED}>Pembayaran Ditolak</option>
                  <option value={OrderStatus.CANCELLED}>Dibatalkan</option>
                </select>
              </div>
            </div>

            {/* Orders Table Container */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4">Order ID & Waktu</th>
                      <th className="py-3 px-4">Pelanggan</th>
                      <th className="py-3 px-4">Toko & Menu</th>
                      <th className="py-3 px-4">Total</th>
                      <th className="py-3 px-4">Status Pesanan</th>
                      <th className="py-3 px-4">Driver Ditugaskan</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-400">
                          Tidak ditemukan pesanan dengan filter saat ini.
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map(order => (
                        <tr key={order.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4 font-mono">
                            <span className="font-bold text-slate-900 block">#{order.id.slice(-6).toUpperCase()}</span>
                            <span className="text-[10px] text-slate-400 font-sans">
                              {new Date(order.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}{' '}
                              {new Date(order.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="font-bold text-slate-800 block">{order.customerName}</span>
                            <span className="text-[11px] text-slate-500 block">{order.customerPhone}</span>
                            <span className="text-[10px] text-slate-400 line-clamp-1 max-w-[180px]">{order.deliveryAddress}</span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="font-bold text-emerald-800 block">{order.merchantName}</span>
                            <span className="text-[11px] text-slate-500">{order.items.length} item ({order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')})</span>
                          </td>

                          <td className="py-3.5 px-4 font-mono">
                            <span className="font-bold text-slate-900 block">Rp {order.total.toLocaleString('id-ID')}</span>
                            {order.paymentMethod === 'ARTOPAY_QRIS' ? (
                              <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-0.5 mt-0.5 border border-emerald-200 font-sans">
                                <QrCode className="w-2.5 h-2.5" /> ArtoPay QRIS
                              </span>
                            ) : (
                              <span className="text-[9px] text-slate-400 font-sans block mt-0.5">Transfer Manual</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.8 rounded-full text-[10px] font-bold ${
                              order.status === OrderStatus.COMPLETED ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                              order.status === OrderStatus.WAITING_PAYMENT_VERIFICATION ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                              order.status === OrderStatus.COOKING || order.status === OrderStatus.READY_FOR_PICKUP ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                              order.status === OrderStatus.PAYMENT_REJECTED || order.status === OrderStatus.CANCELLED ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                              'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}>
                              {order.status}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            {order.driverName ? (
                              <div className="flex items-center gap-1.5 text-xs text-slate-700">
                                <Truck className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="font-bold">{order.driverName}</span>
                              </div>
                            ) : (
                              <button
                                onClick={() => setAssignDriverModal({ orderId: order.id, selectedDriverId: drivers[0]?.id || '' })}
                                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition-all"
                              >
                                + Tugaskan Driver
                              </button>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            {order.artopayCheckoutUrl && (
                              <a
                                href={order.artopayCheckoutUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold mr-1.5"
                                title="Buka Checkout ArtoPay"
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                                ArtoPay
                              </a>
                            )}
                            {order.paymentProof && (
                              <button
                                onClick={() => setShowImageModal(order.paymentProof || null)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold mr-1.5"
                                title="Lihat Bukti Bayar"
                              >
                                <Eye className="w-3.5 h-3.5 text-slate-500" />
                                Bukti
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 3. TAB: MITRA MERCHANT */}
        {activeTab === 'merchants' && (
          <div className="space-y-5">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Daftar Mitra Toko & Resto</h2>
                <p className="text-xs text-slate-500 mt-0.5">Kelola status aktif merchant, pengaturan pre-order, dan kredensial akses.</p>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari nama toko, pemilik..."
                  value={merchantSearchQuery}
                  onChange={(e) => setMerchantSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 w-56"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredMerchants.map(m => (
                <div key={m.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col justify-between hover:border-emerald-200 transition-all">
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 shrink-0">
                        {m.image ? (
                          <img src={m.image} alt={m.name} className="w-full h-full object-cover" />
                        ) : (
                          <Store className="w-6 h-6 text-slate-400 m-3" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h3 className="font-display font-bold text-sm text-slate-900 truncate">{m.name}</h3>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            m.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {m.active ? 'Buka' : 'Tutup'}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 block truncate">Pemilik: {m.ownerName}</span>
                        <span className="text-[10px] text-slate-400 block">{m.category || 'Kuliner Tumpang'}</span>
                      </div>
                    </div>

                    {/* Operational Details */}
                    <div className="bg-slate-50 rounded-xl p-2.5 text-xs space-y-1">
                      <div className="flex justify-between text-slate-600">
                        <span>Jam Buka:</span>
                        <span className="font-bold">{m.openTime} - {m.closeTime}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Kontak WA:</span>
                        <span className="font-medium">{m.phone}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Bank Rekening:</span>
                        <span className="font-mono text-[11px]">{m.bankName} - {m.bankAccount}</span>
                      </div>
                    </div>

                    {/* Pre-Order Capabilities (Native without license) */}
                    {(m.preOrderOnly || m.allowInstantAndPreOrder) && (
                      <div className="bg-amber-50/70 border border-amber-200/60 rounded-xl p-2.5 text-[11px] text-amber-900 space-y-0.5">
                        <span className="font-bold block flex items-center gap-1">
                          📦 Fitur Pre-Order Aktif
                        </span>
                        <div className="flex justify-between text-[10px] text-amber-800">
                          <span>Model: {m.preOrderOnly ? 'Khusus Pre-Order' : 'Instan + Pre-Order'}</span>
                          <span>H-{m.preOrderLeadDays || 1} Hari</span>
                        </div>
                      </div>
                    )}

                    {/* Edit Merchant Email Section */}
                    <div className="pt-2 border-t border-slate-100">
                      {editingMerchantId === m.id ? (
                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            type="email"
                            value={editingEmail}
                            onChange={(e) => setEditingEmail(e.target.value)}
                            placeholder="Email login baru..."
                            className="flex-1 py-1 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
                          />
                          <button
                            onClick={() => handleSaveMerchantEmail(m.id)}
                            disabled={savingEmail}
                            className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                          >
                            Simpan
                          </button>
                          <button
                            onClick={() => setEditingMerchantId(null)}
                            className="px-2 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="truncate">Email: <strong className="text-slate-700">{m.email || 'Belum diatur'}</strong></span>
                          <button
                            onClick={() => { setEditingMerchantId(m.id); setEditingEmail(m.email || ''); }}
                            className="text-emerald-700 font-bold hover:underline shrink-0"
                          >
                            Ubah Email
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. TAB: MITRA DRIVER */}
        {activeTab === 'drivers' && (
          <div className="space-y-5">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Daftar Mitra Driver & Kurir</h2>
                <p className="text-xs text-slate-500 mt-0.5">Kelola armada pengantaran makanan dan kurir lokal Tumpang.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {drivers.map(d => (
                <div key={d.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col justify-between hover:border-emerald-200 transition-all">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center font-bold">
                          {d.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-display font-bold text-sm text-slate-900">{d.name}</h3>
                          <span className="text-[11px] text-slate-500 font-mono">{d.phone}</span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        d.online ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {d.online ? 'Online' : 'Offline'}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      {editingDriverId === d.id ? (
                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            type="email"
                            value={editingDriverEmail}
                            onChange={(e) => setEditingDriverEmail(e.target.value)}
                            placeholder="Email driver..."
                            className="flex-1 py-1 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
                          />
                          <button
                            onClick={() => handleSaveDriverEmail(d.id)}
                            disabled={savingDriverEmail}
                            className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                          >
                            Simpan
                          </button>
                          <button
                            onClick={() => setEditingDriverId(null)}
                            className="px-2 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="truncate">Email: <strong className="text-slate-700">{d.email || 'Belum diatur'}</strong></span>
                          <button
                            onClick={() => { setEditingDriverId(d.id); setEditingDriverEmail(d.email || ''); }}
                            className="text-emerald-700 font-bold hover:underline shrink-0"
                          >
                            Ubah Email
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. TAB: PENDAFTARAN MITRA */}
        {activeTab === 'partners' && (
          <div className="space-y-5">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Pengajuan Pendaftaran Mitra</h2>
                <p className="text-xs text-slate-500 mt-0.5">Tinjau calon mitra merchant atau driver yang mendaftar secara online.</p>
              </div>
              <span className="text-xs font-bold px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full">
                {partnerRegistrations.length} Total Pendaftar
              </span>
            </div>

            {partnerRegistrations.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
                <UserPlus className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <h3 className="font-display font-bold text-base text-slate-800">Belum Ada Pendaftaran Baru</h3>
                <p className="text-xs text-slate-500 mt-1">Calon mitra yang mendaftar lewat formulir registrasi akan muncul di sini.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {partnerRegistrations.map(reg => (
                  <div key={reg.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          reg.type === 'MERCHANT' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          Mitra {reg.type}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          reg.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                          reg.status === 'REJECTED' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {reg.status}
                        </span>
                      </div>

                      <div>
                        <h3 className="font-display font-bold text-sm text-slate-900">{reg.storeName || reg.name}</h3>
                        <p className="text-xs text-slate-600 mt-0.5">Pemilik/Penanggungjawab: <strong>{reg.name}</strong></p>
                        <p className="text-xs text-slate-500">WhatsApp: <span className="font-mono">{reg.phone}</span> | Email: {reg.email || '-'}</p>
                        {reg.storeAddress && (
                          <p className="text-xs text-slate-500 mt-1">Alamat: {reg.storeAddress}</p>
                        )}
                      </div>

                      {/* Documents inspection */}
                      <div className="flex items-center gap-2 pt-2">
                        {reg.businessPhoto && (
                          <button
                            onClick={() => setShowImageModal(reg.businessPhoto)}
                            className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg"
                          >
                            Foto Usaha/KTP
                          </button>
                        )}
                      </div>
                    </div>

                    {reg.status === 'PENDING' && (
                      <div className="pt-4 border-t border-slate-100 flex items-center gap-2 mt-3">
                        <button
                          onClick={() => handleApprovePartner(reg.id)}
                          className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                        >
                          Setujui & Buat Akun
                        </button>
                        <button
                          onClick={() => handleRejectPartner(reg.id)}
                          className="py-2 px-3 rounded-xl border border-rose-200 text-rose-600 font-bold text-xs hover:bg-rose-50"
                        >
                          Tolak
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 6. TAB: SETTLEMENT & PAYOUT */}
        {activeTab === 'settlements' && (
          <div className="space-y-6">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Pencairan Dana (Settlement) Merchant</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hitung dan cairkan hasil penjualan pesanan selesai kepada rekening bank merchant setelah dipotong komisi platform.
                </p>
              </div>
            </div>

            {/* Create Settlement Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
              <h3 className="font-display font-bold text-sm text-slate-900">Buat Rekap Pencairan Dana Baru</h3>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <select
                  value={selectedSettlementMerchantId}
                  onChange={(e) => handleMerchantSelectForSettlement(e.target.value)}
                  className="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 font-medium sm:w-80"
                >
                  <option value="">-- Pilih Toko Merchant --</option>
                  {merchants.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.bankName || 'BCA'})</option>
                  ))}
                </select>

                {previewSettlement && (
                  <button
                    onClick={createSettlement}
                    disabled={previewSettlement.orderCount === 0}
                    className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    Generate Settlement (Rp {previewSettlement.netAmount.toLocaleString('id-ID')})
                  </button>
                )}
              </div>

              {previewSettlement && (
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3.5 text-xs text-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Pesanan Selesai</span>
                    <span className="font-bold text-slate-800 text-sm">{previewSettlement.orderCount} Transaksi</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Penjualan</span>
                    <span className="font-bold text-slate-800 text-sm">Rp {previewSettlement.totalSales.toLocaleString('id-ID')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Komisi Platform</span>
                    <span className="font-bold text-rose-700 text-sm">- Rp {previewSettlement.commission.toLocaleString('id-ID')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-700 uppercase font-bold block">Jumlah Ditransfer</span>
                    <span className="font-extrabold text-emerald-800 text-sm">Rp {previewSettlement.netAmount.toLocaleString('id-ID')}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Settlements History Table */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-100">
                <h3 className="font-display font-bold text-xs uppercase tracking-wider text-slate-700">Riwayat Rekap Settlement</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                      <th className="py-3 px-4">Toko Merchant</th>
                      <th className="py-3 px-4">Rekening Tujuan</th>
                      <th className="py-3 px-4">Jumlah Transaksi</th>
                      <th className="py-3 px-4">Nominal Transfer</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {settlements.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          Belum ada rekap pencairan dana yang dibuat.
                        </td>
                      </tr>
                    ) : (
                      settlements.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50/60">
                          <td className="py-3.5 px-4 font-bold text-slate-800">{s.merchantName}</td>
                          <td className="py-3.5 px-4 font-mono">
                            {s.bankName} - {s.bankAccount} ({s.bankHolder})
                          </td>
                          <td className="py-3.5 px-4">{s.orderCount} Pesanan</td>
                          <td className="py-3.5 px-4 font-mono font-bold text-emerald-800">
                            Rp {s.amountToPay.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                              s.status === SettlementStatus.SETTLEMENT_COMPLETED ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {s.status === SettlementStatus.SETTLEMENT_COMPLETED ? 'Telah Ditransfer' : 'Menunggu Transfer'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {s.status !== SettlementStatus.SETTLEMENT_COMPLETED && (
                              <button
                                onClick={() => completeSettlementTransfer(s.id)}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
                              >
                                Tandai Selesai Ditransfer
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 7. TAB: PENGATURAN SISTEM */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-6">
            <div>
              <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Pengaturan Biaya & Pembayaran Sistem</h2>
              <p className="text-xs text-slate-500 mt-0.5">Konfigurasi gambar QRIS pembayaran, ongkos kirim standar, dan biaya layanan.</p>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Gambar QRIS Platform (URL atau Gambar)
                </label>
                <input
                  type="text"
                  value={qrisInput}
                  onChange={(e) => setQrisInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  placeholder="https://... atau data:image/png;base64,..."
                />
                {qrisInput && (
                  <div className="mt-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
                    <img src={qrisInput} alt="Preview QRIS" className="w-16 h-16 object-contain rounded-lg border bg-white" />
                    <span className="text-xs text-slate-500">Pratinjau QRIS yang akan ditampilkan kepada pelanggan saat checkout.</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Ongkir Standar (Rp)
                  </label>
                  <input
                    type="number"
                    value={deliveryFeeInput}
                    onChange={(e) => setDeliveryFeeInput(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Biaya Layanan (Rp)
                  </label>
                  <input
                    type="number"
                    value={serviceFeeInput}
                    onChange={(e) => setServiceFeeInput(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Komisi Platform (%)
                  </label>
                  <input
                    type="number"
                    value={commissionPercentInput}
                    onChange={(e) => setCommissionPercentInput(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {savingConfig ? 'Menyimpan...' : 'Simpan Pengaturan'}
                </button>
              </div>
            </form>
          </div>
        )}

      </main>

      {/* Reject Payment Modal */}
      {paymentRejectModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-3">
            <h3 className="font-display font-bold text-sm text-slate-900">Tolak Bukti Pembayaran</h3>
            <p className="text-xs text-slate-500">Berikan alasan jelas agar pelanggan dapat memperbaiki atau mengunggah ulang bukti bayar.</p>
            <textarea
              value={paymentRejectModal.reason}
              onChange={(e) => setPaymentRejectModal({ ...paymentRejectModal, reason: e.target.value })}
              placeholder="Contoh: Nominal transfer kurang, bukti kabur, atau dana belum masuk..."
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setPaymentRejectModal(null)}
                className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                Batal
              </button>
              <button
                onClick={() => rejectPayment(paymentRejectModal.orderId, paymentRejectModal.reason)}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Tolak Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Driver Modal */}
      {assignDriverModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-3">
            <h3 className="font-display font-bold text-sm text-slate-900">Tugaskan Kurir / Driver</h3>
            <p className="text-xs text-slate-500">Pilih mitra driver yang tersedia untuk mengantar pesanan ini.</p>
            <select
              value={assignDriverModal.selectedDriverId}
              onChange={(e) => setAssignDriverModal({ ...assignDriverModal, selectedDriverId: e.target.value })}
              className="w-full py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-emerald-500"
            >
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({d.online ? 'Online' : 'Offline'}) - {d.phone}</option>
              ))}
            </select>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setAssignDriverModal(null)}
                className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                Batal
              </button>
              <button
                onClick={() => assignDriver(assignDriverModal.orderId, assignDriverModal.selectedDriverId)}
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                Tugaskan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Preview Modal */}
      {showImageModal && (
        <div 
          onClick={() => setShowImageModal(null)}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-lg w-full bg-white rounded-2xl p-2 overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowImageModal(null)}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-slate-900/80 text-white flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
            <img src={showImageModal} alt="Preview Bukti" className="w-full max-h-[80vh] object-contain rounded-xl" />
          </div>
        </div>
      )}
    </div>
  );
}
