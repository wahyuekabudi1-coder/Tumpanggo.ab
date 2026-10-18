/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Merchant Portal
 * Dashboard operasional mitra toko & resto: manajemen pesanan dapur,
 * katalog menu & kategori, konfigurasi pemesanan (instan & pre-order), serta settlement.
 */

import React, { useState, useEffect } from 'react';
import { 
  Merchant, MenuItem, Category, Order, OrderStatus, Settlement, SettlementStatus 
} from '../types.ts';
import { compressImage } from '../utils/imageCompressor.ts';
import { apiFetch as fetch, extractArrayResponse } from '../utils/apiClient.ts';
import { 
  Store, ClipboardList, Utensils, TrendingUp, Calendar, Clock, DollarSign, 
  Settings, LogOut, Plus, Check, X, Edit, Trash2, CheckSquare, Layers,
  Phone, MapPin, AlertCircle, ChefHat, PackageCheck, Eye, RefreshCw, Upload
} from 'lucide-react';

interface MerchantViewProps {
  merchantId: string;
  onLogout: () => void;
}

export default function MerchantView({ merchantId, onLogout }: MerchantViewProps) {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  
  // Tab control: 'dashboard' | 'orders' | 'menu' | 'settlement' | 'profile'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'menu' | 'settlement' | 'profile'>('orders');
  
  // Loading & Action states
  const [loading, setLoading] = useState(true);
  const [cookEstimateInput, setCookEstimateInput] = useState<Record<string, number>>({});
  const [rejectModal, setRejectModal] = useState<{ orderId: string; visible: boolean; reason: string } | null>(null);

  // Menu editor states
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);

  // Profil Form
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileOwner, setProfileOwner] = useState('');
  const [profileBankName, setProfileBankName] = useState('');
  const [profileBankAccount, setProfileBankAccount] = useState('');
  const [profileBankHolder, setProfileBankHolder] = useState('');
  const [profileDesc, setProfileDesc] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [profileBanner, setProfileBanner] = useState('');
  const [profileOpenTime, setProfileOpenTime] = useState('08:00');
  const [profileCloseTime, setProfileCloseTime] = useState('21:00');
  const [profileCategory, setProfileCategory] = useState('Nasi & Lauk');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Pre-order settings (Unlocked for all merchants)
  const [preOrderOnly, setPreOrderOnly] = useState(false);
  const [allowInstantAndPreOrder, setAllowInstantAndPreOrder] = useState(false);
  const [preOrderMinAmount, setPreOrderMinAmount] = useState<number>(0);
  const [preOrderLeadDays, setPreOrderLeadDays] = useState<number>(1);

  // Filter orders
  const [orderSubTab, setOrderSubTab] = useState<'need_cooking' | 'cooking' | 'ready' | 'history'>('need_cooking');

  useEffect(() => {
    fetchMerchantData();
  }, [merchantId]);

  const fetchMerchantData = async () => {
    setLoading(true);
    try {
      const [profRes, ordRes, menuRes, catRes, setRes] = await Promise.all([
        fetch(`/api/merchants/${merchantId}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/merchants/${merchantId}/orders`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/merchants/${merchantId}/menu`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/merchants/${merchantId}/categories`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/merchants/${merchantId}/settlements`).then(r => r.ok ? r.json() : []).catch(() => [])
      ]);

      if (profRes && profRes.id) {
        setMerchant(profRes);
        setProfileName(profRes.name || '');
        setProfilePhone(profRes.phone || '');
        setProfileOwner(profRes.ownerName || '');
        setProfileBankName(profRes.bankName || '');
        setProfileBankAccount(profRes.bankAccount || '');
        setProfileBankHolder(profRes.bankHolder || '');
        setProfileDesc(profRes.description || '');
        setProfileImage(profRes.image || '');
        setProfileBanner(profRes.bannerImage || '');
        setProfileOpenTime(profRes.openTime || '08:00');
        setProfileCloseTime(profRes.closeTime || '21:00');
        setProfileCategory(profRes.category || 'Nasi & Lauk');
        setPreOrderOnly(profRes.preOrderOnly || false);
        setAllowInstantAndPreOrder(profRes.allowInstantAndPreOrder || false);
        setPreOrderMinAmount(profRes.preOrderMinAmount || 0);
        setPreOrderLeadDays(profRes.preOrderLeadDays || 1);
      }

      setOrders(extractArrayResponse<Order>(ordRes, 'orders'));
      setMenuItems(extractArrayResponse<MenuItem>(menuRes, 'menuItems'));
      setCategories(extractArrayResponse<Category>(catRes, 'categories'));
      setSettlements(extractArrayResponse<Settlement>(setRes, 'settlements'));
    } catch (e) {
      console.error('Error fetching merchant data:', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleOpenStatus = async () => {
    if (!merchant) return;
    const newStatus = !merchant.active;
    try {
      const res = await fetch(`/api/merchants/${merchantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: newStatus, role: 'MERCHANT', userId: merchantId })
      });
      if (res.ok) {
        const updated = await res.json();
        setMerchant(updated);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const acceptOrder = async (orderId: string) => {
    const cookTime = cookEstimateInput[orderId] || 15;
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: OrderStatus.COOKING, 
          cookingTimeMinutes: cookTime,
          role: 'MERCHANT',
          userId: merchantId
        })
      });
      if (res.ok) {
        fetchMerchantData();
        setOrderSubTab('cooking');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const setOrderReady = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: OrderStatus.READY_FOR_PICKUP,
          role: 'MERCHANT',
          userId: merchantId
        })
      });
      if (res.ok) {
        fetchMerchantData();
        setOrderSubTab('ready');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const rejectOrder = async (orderId: string, reason: string) => {
    if (!reason.trim()) {
      alert('Alasan penolakan wajib diisi');
      return;
    }
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: OrderStatus.CANCELLED, 
          cancelReason: reason,
          role: 'MERCHANT',
          userId: merchantId
        })
      });
      if (res.ok) {
        setRejectModal(null);
        fetchMerchantData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem?.name || !editingItem?.price || !editingItem?.categoryId) {
      alert('Mohon isi nama menu, harga, dan kategori');
      return;
    }

    const url = editingItem.id 
      ? `/api/merchants/${merchantId}/menu/${editingItem.id}` 
      : `/api/merchants/${merchantId}/menu`;
    
    const method = editingItem.id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editingItem,
          price: Number(editingItem.price),
          available: editingItem.available !== undefined ? editingItem.available : true,
          allowInstant: editingItem.allowInstant !== undefined ? editingItem.allowInstant : true
        })
      });
      if (res.ok) {
        setShowItemForm(false);
        setEditingItem(null);
        fetchMerchantData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Hapus menu ini dari daftar?')) return;
    try {
      const res = await fetch(`/api/merchants/${merchantId}/menu/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchMerchantData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory?.name) return;

    try {
      const res = await fetch(`/api/merchants/${merchantId}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingCategory.name })
      });
      if (res.ok) {
        setShowCategoryForm(false);
        setEditingCategory(null);
        fetchMerchantData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      const res = await fetch(`/api/merchants/${merchantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileName,
          phone: profilePhone,
          ownerName: profileOwner,
          bankName: profileBankName,
          bankAccount: profileBankAccount,
          bankHolder: profileBankHolder,
          description: profileDesc,
          image: profileImage,
          bannerImage: profileBanner,
          openTime: profileOpenTime,
          closeTime: profileCloseTime,
          category: profileCategory,
          preOrderOnly,
          allowInstantAndPreOrder,
          preOrderMinAmount: Number(preOrderMinAmount || 0),
          preOrderLeadDays: Number(preOrderLeadDays || 1),
          role: 'MERCHANT',
          userId: merchantId
        })
      });
      if (res.ok) {
        alert('Profil toko dan pengaturan pemesanan berhasil diperbarui!');
        fetchMerchantData();
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan saat menyimpan profil.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Filtered orders
  const safeOrders = Array.isArray(orders) ? orders : [];
  const needCookingOrders = safeOrders.filter(o => o && o.status === OrderStatus.PAYMENT_VERIFIED);
  const cookingOrders = safeOrders.filter(o => o && o.status === OrderStatus.COOKING);
  const readyOrders = safeOrders.filter(o => o && [OrderStatus.READY_FOR_PICKUP, OrderStatus.ORDER_PICKED_UP].includes(o.status));
  const historyOrders = safeOrders.filter(o => o && [OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.PAYMENT_REJECTED].includes(o.status));

  const totalCompletedSales = (Array.isArray(historyOrders) ? historyOrders : [])
    .filter(o => o && o.status === OrderStatus.COMPLETED)
    .reduce((sum, o) => sum + (o?.subtotal || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white flex items-center justify-center shadow-xs">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-bold text-base sm:text-lg text-slate-900 tracking-tight">
                  {merchant?.name || 'Portal Toko Merchant'}
                </h1>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  merchant?.active ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}>
                  {merchant?.active ? 'Toko Buka' : 'Toko Tutup'}
                </span>
              </div>
              <p className="text-xs text-slate-500">Kelola Pesanan Pelanggan & Katalog Menu</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={toggleOpenStatus}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer border ${
                merchant?.active 
                  ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' 
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              {merchant?.active ? 'Tutup Toko Sementara' : 'Buka Toko Sekarang'}
            </button>

            <button
              onClick={fetchMerchantData}
              disabled={loading}
              className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-all cursor-pointer shadow-xs"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Keluar
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-slate-100">
          <nav className="flex space-x-2 overflow-x-auto py-2.5 scrollbar-none">
            {[
              { id: 'orders', label: 'Pesanan Dapur', count: needCookingOrders.length + cookingOrders.length, icon: ChefHat },
              { id: 'menu', label: 'Katalog Menu', count: menuItems.length, icon: Utensils },
              { id: 'dashboard', label: 'Ringkasan & Metrik', icon: TrendingUp },
              { id: 'settlement', label: 'Settlement & Hasil', count: settlements.length, icon: DollarSign },
              { id: 'profile', label: 'Profil Toko & PO', icon: Settings },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">

        {/* 1. TAB: ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-5">
            {/* Orders Sub-tabs */}
            <div className="flex items-center justify-between flex-wrap gap-3 bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex space-x-1.5">
                {[
                  { id: 'need_cooking', label: 'Perlu Dimasak', count: needCookingOrders.length, highlight: needCookingOrders.length > 0 },
                  { id: 'cooking', label: 'Sedang Dimasak', count: cookingOrders.length },
                  { id: 'ready', label: 'Siap Diambil / Diantar', count: readyOrders.length },
                  { id: 'history', label: 'Riwayat Selesai', count: historyOrders.length },
                ].map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => setOrderSubTab(sub.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      orderSubTab === sub.id 
                        ? 'bg-slate-900 text-white' 
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>{sub.label}</span>
                    {sub.count > 0 && (
                      <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                        orderSubTab === sub.id ? 'bg-white text-slate-900' : (sub.highlight ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700')
                      }`}>
                        {sub.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Orders List for selected sub-tab */}
            {(() => {
              const currentList = orderSubTab === 'need_cooking' ? needCookingOrders :
                orderSubTab === 'cooking' ? cookingOrders :
                orderSubTab === 'ready' ? readyOrders : historyOrders;

              if (currentList.length === 0) {
                return (
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
                    <ChefHat className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <h3 className="font-display font-bold text-base text-slate-800">Tidak Ada Pesanan pada Kategori Ini</h3>
                    <p className="text-xs text-slate-500 mt-1">Pesanan pelanggan yang masuk akan muncul secara real-time di sini.</p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {currentList.map(order => (
                    <div key={order.id} className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col justify-between hover:border-emerald-200 transition-all">
                      <div>
                        {/* Header */}
                        <div className="p-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
                          <div>
                            <span className="font-mono text-xs font-bold text-slate-800">#{order.id.slice(-6).toUpperCase()}</span>
                            <span className="block text-[10px] text-slate-400">
                              {new Date(order.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                            </span>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            order.status === OrderStatus.PAYMENT_VERIFIED ? 'bg-amber-100 text-amber-800' :
                            order.status === OrderStatus.COOKING ? 'bg-blue-100 text-blue-800' :
                            order.status === OrderStatus.COMPLETED ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {order.status}
                          </span>
                        </div>

                        {/* Order Content */}
                        <div className="p-4 space-y-3">
                          {/* Pre-order notice if any */}
                          {order.preOrderDate && (
                            <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-2.5 text-xs text-amber-900 flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-amber-700 shrink-0" />
                              <div>
                                <span className="text-[10px] uppercase font-bold text-amber-700 block">Jadwal Pengantaran Pre-Order</span>
                                <span className="font-bold">{new Date(order.preOrderDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                              </div>
                            </div>
                          )}

                          {/* Items */}
                          <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Menu yang Dipesan:</span>
                            {order.items.map((it, idx) => (
                              <div key={idx} className="flex justify-between text-xs text-slate-700">
                                <span className="font-medium"><strong className="text-slate-900">{it.quantity}x</strong> {it.name}</span>
                                <span className="font-mono font-bold">Rp {(it.price * it.quantity).toLocaleString('id-ID')}</span>
                              </div>
                            ))}
                          </div>

                          {/* Subtotal & Delivery Destination */}
                          <div className="text-xs space-y-1">
                            <div className="flex justify-between font-bold text-slate-800 pt-1 border-t border-slate-100">
                              <span>Total Subtotal Menu</span>
                              <span className="font-mono text-emerald-800">Rp {order.subtotal.toLocaleString('id-ID')}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 pt-1">
                              <span>Tujuan: <strong>{order.customerName}</strong> ({order.customerPhone})</span>
                              <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{order.deliveryAddress}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="p-4 bg-slate-50 border-t border-slate-100">
                        {order.status === OrderStatus.PAYMENT_VERIFIED && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500 shrink-0">Waktu Masak:</span>
                              <select
                                value={cookEstimateInput[order.id] || 15}
                                onChange={(e) => setCookEstimateInput({ ...cookEstimateInput, [order.id]: Number(e.target.value) })}
                                className="flex-1 py-1.5 px-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                              >
                                <option value={15}>15 Menit</option>
                                <option value={30}>30 Menit</option>
                                <option value={45}>45 Menit</option>
                                <option value={60}>60 Menit</option>
                              </select>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => acceptOrder(order.id)}
                                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                              >
                                <ChefHat className="w-3.5 h-3.5" />
                                Mulai Masak
                              </button>
                              <button
                                onClick={() => setRejectModal({ orderId: order.id, visible: true, reason: '' })}
                                className="py-2 px-3 rounded-xl border border-rose-200 bg-white text-rose-600 font-bold text-xs hover:bg-rose-50 cursor-pointer"
                              >
                                Tolak
                              </button>
                            </div>
                          </div>
                        )}

                        {order.status === OrderStatus.COOKING && (
                          <button
                            onClick={() => setOrderReady(order.id)}
                            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                          >
                            <PackageCheck className="w-4 h-4" />
                            Pesanan Selesai Masak & Siap Diambil
                          </button>
                        )}

                        {order.status === OrderStatus.READY_FOR_PICKUP && (
                          <div className="text-center py-1 text-xs text-slate-500 font-medium">
                            {order.driverName ? (
                              <span>Kurir <strong>{order.driverName}</strong> sedang menuju outlet.</span>
                            ) : (
                              <span>Menunggu penugasan kurir oleh sistem/admin...</span>
                            )}
                          </div>
                        )}

                        {order.status === OrderStatus.COMPLETED && (
                          <div className="text-center py-1 text-xs text-emerald-700 font-bold flex items-center justify-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            Pesanan Telah Selesai & Diterima Pelanggan
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* 2. TAB: MENU & KATEGORI */}
        {activeTab === 'menu' && (
          <div className="space-y-6">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Katalog Menu & Kategori</h2>
                <p className="text-xs text-slate-500 mt-0.5">Tambah menu baru, atur ketersediaan instan maupun pre-order, dan kelola harga.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setEditingCategory({}); setShowCategoryForm(true); }}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  + Tambah Kategori
                </button>
                <button
                  onClick={() => { setEditingItem({ available: true, allowInstant: true, categoryId: categories[0]?.id || '' }); setShowItemForm(true); }}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Menu Makanan
                </button>
              </div>
            </div>

            {/* Menu Items Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {menuItems.map(item => (
                <div key={item.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col justify-between hover:border-emerald-200 transition-all">
                  <div>
                    <div className="aspect-video w-full bg-slate-100 relative overflow-hidden">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <Utensils className="w-8 h-8" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex gap-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.available ? 'bg-emerald-600 text-white' : 'bg-slate-800/80 text-white'
                        }`}>
                          {item.available ? 'Tersedia' : 'Habis'}
                        </span>
                      </div>
                      {item.allowInstant === false && (
                        <div className="absolute bottom-2 left-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500 text-white">
                            Khusus Pre-Order
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-3.5 space-y-1">
                      <h4 className="font-display font-bold text-sm text-slate-900 truncate">{item.name}</h4>
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">{item.description || 'Tidak ada deskripsi'}</p>
                      <div className="pt-2 flex items-center justify-between">
                        <span className="font-mono font-bold text-sm text-emerald-800">Rp {item.price.toLocaleString('id-ID')}</span>
                        {item.preOrderMinAmount ? (
                          <span className="text-[10px] text-slate-400">Min. {item.preOrderMinAmount} porsi</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => { setEditingItem(item); setShowItemForm(true); }}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700"
                      title="Edit Menu"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="p-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-600"
                      title="Hapus Menu"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. TAB: DASHBOARD & METRIKS */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Pesanan Masuk Hari Ini</span>
                <span className="font-display font-extrabold text-2xl text-slate-900 mt-1 block">
                  {needCookingOrders.length + cookingOrders.length}
                </span>
                <span className="text-[11px] text-emerald-700 font-medium mt-1 block">Perlu diproses di dapur</span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Menu Terdaftar</span>
                <span className="font-display font-extrabold text-2xl text-slate-900 mt-1 block">
                  {menuItems.length}
                </span>
                <span className="text-[11px] text-slate-500 font-medium mt-1 block">{categories.length} kategori aktif</span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Omset Pesanan Selesai</span>
                <span className="font-display font-extrabold text-xl text-emerald-800 mt-1 block">
                  Rp {totalCompletedSales.toLocaleString('id-ID')}
                </span>
                <span className="text-[11px] text-slate-500 font-medium mt-1 block">Dari {(Array.isArray(historyOrders) ? historyOrders : []).filter(o => o && o.status === OrderStatus.COMPLETED).length} pesanan</span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Status Outlet</span>
                <span className={`font-display font-extrabold text-2xl mt-1 block ${merchant?.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {merchant?.active ? 'Aktif Buka' : 'Tutup'}
                </span>
                <span className="text-[11px] text-slate-500 font-medium mt-1 block">Jam operasional: {merchant?.openTime} - {merchant?.closeTime}</span>
              </div>
            </div>
          </div>
        )}

        {/* 4. TAB: SETTLEMENT */}
        {activeTab === 'settlement' && (
          <div className="space-y-5">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Hasil Penjualan & Settlement</h2>
              <p className="text-xs text-slate-500 mt-0.5">Riwayat pencairan dana hasil penjualan yang telah dikirim ke rekening bank Anda.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-3 px-4">Tanggal Rekap</th>
                    <th className="py-3 px-4">Rekening Bank</th>
                    <th className="py-3 px-4">Jumlah Pesanan</th>
                    <th className="py-3 px-4">Nominal Cair</th>
                    <th className="py-3 px-4">Status Transfer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {settlements.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Belum ada riwayat rekap settlement. Transaksi selesai akan otomatis direkap oleh admin.
                      </td>
                    </tr>
                  ) : (
                    settlements.map(s => (
                      <tr key={s.id}>
                        <td className="py-3.5 px-4 font-mono">{new Date(s.createdAt).toLocaleDateString('id-ID')}</td>
                        <td className="py-3.5 px-4 font-mono">{s.bankName} - {s.bankAccount}</td>
                        <td className="py-3.5 px-4">{s.orderCount} Transaksi</td>
                        <td className="py-3.5 px-4 font-mono font-bold text-emerald-800">Rp {s.amountToPay.toLocaleString('id-ID')}</td>
                        <td className="py-3.5 px-4">
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                            s.status === SettlementStatus.SETTLEMENT_COMPLETED ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {s.status === SettlementStatus.SETTLEMENT_COMPLETED ? 'Telah Ditransfer' : 'Sedang Diproses'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. TAB: PROFIL & PENGATURAN PRE-ORDER */}
        {activeTab === 'profile' && (
          <div className="max-w-3xl bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-6">
            <div>
              <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Profil Toko & Pengaturan Pemesanan</h2>
              <p className="text-xs text-slate-500 mt-0.5">Kelola identitas outlet, nomor rekening pembayaran, serta konfigurasi sistem pengantaran.</p>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">Nama Toko</label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">Nama Pemilik</label>
                  <input
                    type="text"
                    required
                    value={profileOwner}
                    onChange={(e) => setProfileOwner(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">Nomor WhatsApp Toko</label>
                  <input
                    type="text"
                    required
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">Kategori Kuliner</label>
                  <select
                    value={profileCategory}
                    onChange={(e) => setProfileCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Bakso & Mie">🍜 Bakso & Mie</option>
                    <option value="Nasi & Lauk">🍛 Nasi & Lauk</option>
                    <option value="Sate & Bakaran">🍢 Sate & Bakaran</option>
                    <option value="Cemilan & Jajanan">🍘 Cemilan & Jajanan</option>
                    <option value="Minuman Segar">🥤 Minuman Segar</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">Jam Buka</label>
                  <input
                    type="text"
                    value={profileOpenTime}
                    onChange={(e) => setProfileOpenTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="08:00"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">Jam Tutup</label>
                  <input
                    type="text"
                    value={profileCloseTime}
                    onChange={(e) => setProfileCloseTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="21:00"
                  />
                </div>
              </div>

              {/* Settlement Bank Details */}
              <div className="pt-3 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">Rekening Settlement Bank</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Nama Bank</label>
                    <input
                      type="text"
                      value={profileBankName}
                      onChange={(e) => setProfileBankName(e.target.value)}
                      placeholder="BCA / BRI / Mandiri"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Nomor Rekening</label>
                    <input
                      type="text"
                      value={profileBankAccount}
                      onChange={(e) => setProfileBankAccount(e.target.value)}
                      placeholder="1234567890"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Atas Nama Rekening</label>
                    <input
                      type="text"
                      value={profileBankHolder}
                      onChange={(e) => setProfileBankHolder(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Pre-Order System Configuration (Available to all merchants natively) */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div>
                  <h3 className="font-display font-bold text-sm text-slate-900 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-emerald-600" />
                    Sistem Pemesanan & Pengantaran (Instan vs Pre-Order)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pilih model operasional outlet Anda. Apakah melayani pesanan langsung (instan) atau sistem Pre-Order (PO).
                  </p>
                </div>

                <div className="space-y-2">
                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    !preOrderOnly && !allowInstantAndPreOrder ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <input
                      type="radio"
                      name="preOrderMode"
                      checked={!preOrderOnly && !allowInstantAndPreOrder}
                      onChange={() => { setPreOrderOnly(false); setAllowInstantAndPreOrder(false); }}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="font-bold text-xs text-slate-900 block">Pengantaran Instan Langsung (Standar GoFood)</span>
                      <span className="text-[11px] text-slate-500">Pelanggan memesan dan pesanan langsung dimasak dan diantar seketika.</span>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    preOrderOnly && !allowInstantAndPreOrder ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <input
                      type="radio"
                      name="preOrderMode"
                      checked={preOrderOnly && !allowInstantAndPreOrder}
                      onChange={() => { setPreOrderOnly(true); setAllowInstantAndPreOrder(false); }}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="font-bold text-xs text-slate-900 block">Khusus Sistem Pre-Order (PO Saja)</span>
                      <span className="text-[11px] text-slate-500">Cocok untuk toko kue, katering, atau makanan custom yang butuh disiapkan H-1 atau H-2.</span>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    allowInstantAndPreOrder ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <input
                      type="radio"
                      name="preOrderMode"
                      checked={allowInstantAndPreOrder}
                      onChange={() => { setPreOrderOnly(false); setAllowInstantAndPreOrder(true); }}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="font-bold text-xs text-slate-900 block">Mendukung Instan & Pre-Order Sekaligus</span>
                      <span className="text-[11px] text-slate-500">Pelanggan dapat memilih apakah ingin diantar sekarang atau memilih tanggal pengantaran masa depan.</span>
                    </div>
                  </label>
                </div>

                {(preOrderOnly || allowInstantAndPreOrder) && (
                  <div className="grid grid-cols-2 gap-3 pt-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-1">Minimal Hari Pemesanan (Lead Days)</label>
                      <select
                        value={preOrderLeadDays}
                        onChange={(e) => setPreOrderLeadDays(Number(e.target.value))}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs"
                      >
                        <option value={1}>H-1 (1 Hari Sebelumnya)</option>
                        <option value={2}>H-2 (2 Hari Sebelumnya)</option>
                        <option value={3}>H-3 (3 Hari Sebelumnya)</option>
                        <option value={7}>H-7 (1 Minggu Sebelumnya)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-1">Minimal Porsi Pembelian PO (Opsional)</label>
                      <input
                        type="number"
                        value={preOrderMinAmount || ''}
                        onChange={(e) => setPreOrderMinAmount(Number(e.target.value))}
                        placeholder="Contoh: 10 porsi"
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-all flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {isSavingProfile ? 'Menyimpan...' : 'Simpan Perubahan Profil'}
                </button>
              </div>
            </form>
          </div>
        )}

      </main>

      {/* Item Form Modal */}
      {showItemForm && editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-display font-bold text-sm text-slate-900">
                {editingItem.id ? 'Edit Menu Makanan' : 'Tambah Menu Makanan Baru'}
              </h3>
              <button onClick={() => setShowItemForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nama Menu</label>
                <input
                  type="text"
                  required
                  value={editingItem.name || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  placeholder="Contoh: Bakso Urat Jumbo"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Harga (Rp)</label>
                  <input
                    type="number"
                    required
                    value={editingItem.price || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, price: Number(e.target.value) })}
                    placeholder="15000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Kategori</label>
                  <select
                    value={editingItem.categoryId || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, categoryId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Deskripsi Menu</label>
                <textarea
                  value={editingItem.description || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  placeholder="Isian porsi, sambal, kuah..."
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Gambar Menu (URL atau Unggah)</label>
                <input
                  type="text"
                  value={editingItem.image || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, image: e.target.value })}
                  placeholder="https://... atau data:image/..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Toggles */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingItem.available !== false}
                    onChange={(e) => setEditingItem({ ...editingItem, available: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-semibold text-slate-700">Tersedia untuk Dipesan Pelanggan</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingItem.allowInstant !== false}
                    onChange={(e) => setEditingItem({ ...editingItem, allowInstant: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-semibold text-slate-700">Dapat Dipesan Instan (Bukan Khusus PO)</span>
                </label>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowItemForm(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Simpan Menu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Form Modal */}
      {showCategoryForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-3">
            <h3 className="font-display font-bold text-sm text-slate-900">Tambah Kategori Baru</h3>
            <form onSubmit={handleSaveCategory} className="space-y-3">
              <input
                type="text"
                required
                value={editingCategory?.name || ''}
                onChange={(e) => setEditingCategory({ name: e.target.value })}
                placeholder="Contoh: Aneka Jus & Minuman"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCategoryForm(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Order Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-3">
            <h3 className="font-display font-bold text-sm text-slate-900">Tolak Pesanan</h3>
            <p className="text-xs text-slate-500">Berikan alasan penolakan pesanan (stok habis, jam operasional, dsb):</p>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
              placeholder="Contoh: Bahan menu habis..."
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRejectModal(null)}
                className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
              >
                Batal
              </button>
              <button
                onClick={() => rejectOrder(rejectModal.orderId, rejectModal.reason)}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Tolak Pesanan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
