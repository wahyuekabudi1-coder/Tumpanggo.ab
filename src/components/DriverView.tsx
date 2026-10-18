import React, { useState, useEffect } from 'react';
import { Driver, Order, OrderStatus } from '../types.ts';
import MapPicker from './MapPicker.tsx';
import { compressImage } from '../utils/imageCompressor.ts';
import { apiFetch as fetch, extractArrayResponse } from '../utils/apiClient.ts';
import { 
  Navigation, CheckCircle2, ShoppingBag, Eye, Phone, MapPin, ClipboardList, 
  User, ToggleLeft, ToggleRight, LogOut, Check, ChevronRight, X, Image
} from 'lucide-react';

interface DriverViewProps {
  driverId: string;
  onLogout: () => void;
}

export default function DriverView({ driverId, onLogout }: DriverViewProps) {
  const [driver, setDriver] = useState<Driver | null>(null);
  const [assignedOrders, setAssignedOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'profile'>('dashboard');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  
  // Photo upload
  const [deliveryProofUrl, setDeliveryProofUrl] = useState('');
  const [deliveryProofFile, setDeliveryProofFile] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDriverData();
  }, [driverId]);

  const fetchDriverData = async () => {
    setLoading(true);
    try {
      // 1. Profile
      const profRes = await fetch(`/api/drivers/${driverId}`);
      if (profRes.ok) {
        const d: Driver = await profRes.json();
        setDriver(d);
      }

      // 2. Active Tasks
      const tasksRes = await fetch(`/api/drivers/${driverId}/orders`);
      let allOrders: Order[] = [];
      if (tasksRes.ok) {
        const rawOrders = await tasksRes.json();
        allOrders = extractArrayResponse<Order>(rawOrders, 'orders');
      } else {
        const errJson = await tasksRes.json().catch(() => null);
        console.warn('[DriverView] Gagal mengambil tugas kurir:', errJson?.error || tasksRes.statusText);
      }
      
      const safeOrders = Array.isArray(allOrders) ? allOrders : [];
      // Filter active (cooking, ready for pickup, picked up)
      const active = safeOrders.filter(o => 
        o && [OrderStatus.PAYMENT_VERIFIED, OrderStatus.COOKING, OrderStatus.READY_FOR_PICKUP, OrderStatus.ORDER_PICKED_UP].includes(o.status)
      );
      setAssignedOrders(active);

      // Filter histories (delivered, completed, cancelled)
      const past = safeOrders.filter(o => 
        o && [OrderStatus.DELIVERED, OrderStatus.COMPLETED, OrderStatus.CANCELLED].includes(o.status)
      );
      setHistoryOrders(past);

      // Keep selected order synced if any
      if (selectedOrder) {
        const updated = safeOrders.find(o => o && o.id === selectedOrder.id);
        if (updated) setSelectedOrder(updated);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Toggle online/offline
  const toggleOnline = async () => {
    if (!driver) return;
    const toggled = !driver.online;
    try {
      const res = await fetch(`/api/drivers/${driverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online: toggled, role: 'DRIVER', userId: driverId })
      });
      if (res.ok) {
        const updated = await res.json();
        setDriver(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Action: Pick up order
  const handlePickUpOrder = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: OrderStatus.ORDER_PICKED_UP,
          role: 'DRIVER',
          userId: driverId
        })
      });
      if (res.ok) {
        fetchDriverData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Action: Complete delivery with proof upload
  const handleCompleteDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    const proof = deliveryProofFile || deliveryProofUrl;
    if (!proof) {
      alert('Silakan pilih foto atau masukkan URL bukti pengantaran.');
      return;
    }

    if (!selectedOrder) return;
    setUploadLoading(true);

    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}/upload-delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          deliveryProof: proof,
          userId: driverId
        })
      });
      
      if (res.ok) {
        alert('Pengantaran berhasil diselesaikan!');
        setDeliveryProofUrl('');
        setDeliveryProofFile(null);
        setSelectedOrder(null);
        fetchDriverData();
      } else {
        alert('Gagal mengunggah bukti pengantaran.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploadLoading(false);
    }
  };

  // Handle local image file picker
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 800, 800, 0.6);
        setDeliveryProofFile(compressed);
      } catch (err) {
        console.error('Error compressing delivery proof:', err);
        // Fallback
        const reader = new FileReader();
        reader.onloadend = () => {
          setDeliveryProofFile(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col justify-center items-center font-sans">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 text-sm mt-3 font-semibold">Memuat Dasbor Driver...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen pb-24 relative font-sans">
      {/* Header */}
      <header className="bg-white p-4 sticky top-0 z-50 rounded-b-3xl border-b-4 border-emerald-600 shadow-md shadow-emerald-900/10">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Navigation className="w-5 h-5 text-emerald-700 rotate-45" />
            <div className="flex flex-col">
              <span className="font-display font-bold text-sm text-emerald-900 tracking-tight truncate max-w-[200px]">{driver?.name}</span>
              <span className="text-[10px] text-emerald-700 font-bold tracking-wide uppercase">Driver Portal</span>
            </div>
          </div>
          <button 
            onClick={toggleOnline}
            className={`text-xs font-bold px-3 py-1.5 rounded-full shadow transition-all flex items-center gap-1 ${
              driver?.online 
                ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {driver?.online ? (
              <>
                <span>ONLINE 🟢</span>
              </>
            ) : (
              <>
                <span>OFFLINE ⚪</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 flex flex-col gap-4">

        {/* 1. DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div className="flex flex-col gap-4">
            
            {/* If Offline Banner */}
            {!driver?.online && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-xs flex flex-col gap-1 shadow-sm">
                <span className="font-bold flex items-center gap-1">⚠️ Status Anda Offline</span>
                <span>Anda tidak akan menerima tugas pengantaran baru dari Admin selama berstatus Offline. Ketuk tombol di pojok kanan atas untuk kembali Online.</span>
              </div>
            )}

            {/* Quick Stats banner */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-950 text-white p-4.5 rounded-2xl shadow-lg flex justify-between items-center">
              <div className="flex flex-col">
                <span className="text-[9px] text-emerald-400 uppercase font-extrabold tracking-wider">Internal Courier</span>
                <h3 className="font-display font-bold text-base mt-0.5">Semangat Kerja, {driver?.name?.split(' ')[1] || 'Kurir'}!</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Antarkan makanan pesanan dengan selamat dan ramah.</p>
              </div>
              <ClipboardList className="w-9 h-9 text-emerald-400 opacity-20" />
            </div>

            {/* Selected Order view */}
            {selectedOrder ? (
              <div className="flex flex-col gap-4">
                {/* Back Button */}
                <button 
                  onClick={() => setSelectedOrder(null)}
                  className="flex items-center gap-1 text-xs font-bold text-slate-600 self-start hover:text-slate-900"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Kembali ke Tugas
                </button>

                {/* Map routing */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                  <h4 className="font-display font-bold text-xs text-slate-500 uppercase tracking-wider">Rute Pengantaran Peta</h4>
                  <div className="h-56 w-full rounded-xl overflow-hidden relative">
                    <MapPicker
                      readOnly={true}
                      markerLocations={[
                        { lat: selectedOrder.latitude, lng: selectedOrder.longitude, label: 'Customer', iconType: 'customer' },
                        { lat: -7.9482, lng: 112.7612, label: 'Merchant', iconType: 'merchant' } // using default merchant coords for simplicity
                      ]}
                    />
                  </div>
                </div>

                {/* Task details */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
                    <span className="font-mono text-xs font-bold text-slate-800">{selectedOrder.id}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 uppercase">
                      {selectedOrder.status}
                    </span>
                  </div>

                  {/* Locations details */}
                  <div className="flex flex-col gap-3.5 py-1">
                    {/* Merchant */}
                    <div className="flex gap-2.5 items-start">
                      <div className="p-1.5 bg-rose-50 rounded-lg text-rose-600 mt-0.5">
                        <ShoppingBag className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Ambil dari Merchant:</span>
                        <span className="text-xs font-bold text-slate-800">{selectedOrder.merchantName}</span>
                        <span className="text-[11px] text-slate-500 mt-0.5">Est. Memasak: {selectedOrder.cookingTimeMinutes || 30} menit</span>
                      </div>
                    </div>

                    {/* Customer */}
                    <div className="flex gap-2.5 items-start">
                      <div className="p-1.5 bg-sky-50 rounded-lg text-sky-600 mt-0.5">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Antar ke Penerima:</span>
                        <span className="text-xs font-bold text-slate-800">{selectedOrder.customerName}</span>
                        <span className="text-xs text-slate-600 font-semibold mt-1 flex items-center gap-1 text-sky-600">
                          <Phone className="w-3.5 h-3.5" />
                          {selectedOrder.customerPhone}
                        </span>
                        <span className="text-[11px] text-slate-500 mt-1 leading-relaxed bg-slate-50 p-2 rounded-lg">
                          <span className="font-bold text-slate-700">Alamat:</span> {selectedOrder.deliveryAddress}
                          {selectedOrder.landmark && (
                            <> <br/><span className="font-bold text-slate-700">Patokan:</span> {selectedOrder.landmark}</>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Driver action button step */}
                  <div className="pt-3 border-t border-slate-100">
                    
                    {/* STEP 1: PICKUP (If status is COOKING or READY_FOR_PICKUP or PAYMENT_VERIFIED) */}
                    {[OrderStatus.PAYMENT_VERIFIED, OrderStatus.COOKING, OrderStatus.READY_FOR_PICKUP].includes(selectedOrder.status) && (
                      <button
                        onClick={() => handlePickUpOrder(selectedOrder.id)}
                        disabled={selectedOrder.status !== OrderStatus.READY_FOR_PICKUP}
                        className={`w-full py-3 font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center justify-center gap-1 ${
                          selectedOrder.status === OrderStatus.READY_FOR_PICKUP
                            ? 'bg-slate-900 text-white hover:bg-slate-800'
                            : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none'
                        }`}
                      >
                        {selectedOrder.status !== OrderStatus.READY_FOR_PICKUP ? (
                          <>Menunggu Makanan Dimasak...</>
                        ) : (
                          <>Konfirmasi Pesanan Telah Diambil 📦</>
                        )}
                      </button>
                    )}

                    {/* STEP 2: FINISH DELIVERY with PHOTO */}
                    {selectedOrder.status === OrderStatus.ORDER_PICKED_UP && (
                      <form onSubmit={handleCompleteDelivery} className="flex flex-col gap-3">
                        <span className="text-[10px] text-rose-500 font-bold uppercase tracking-wider block">Wajib Upload Bukti Pengantaran (Foto)</span>
                        
                        {/* File Picker */}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                        />

                        {/* URL fallback */}
                        <input
                          type="text"
                          value={deliveryProofUrl}
                          onChange={(e) => {
                            setDeliveryProofUrl(e.target.value);
                            setDeliveryProofFile(null);
                          }}
                          placeholder="Atau masukkan link gambar pengantaran..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none"
                        />

                        {/* Preview */}
                        {(deliveryProofFile || deliveryProofUrl) && (
                          <div className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden mt-1">
                            <img src={deliveryProofFile || deliveryProofUrl} alt="Bukti pengiriman" className="w-full h-full object-contain" />
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={uploadLoading || (!deliveryProofFile && !deliveryProofUrl)}
                          className={`w-full py-3 font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center justify-center gap-1 ${
                            uploadLoading || (!deliveryProofFile && !deliveryProofUrl)
                              ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          {uploadLoading ? 'Mengirim...' : 'Selesaikan Pengantaran (Foto Terlampir) ✅'}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              // List of Assigned Tasks
              <div className="flex flex-col gap-3">
                <h4 className="font-display font-bold text-sm text-slate-700 mb-0.5">Tugas Pengantaran Aktif ({assignedOrders.length})</h4>
                
                {assignedOrders.length === 0 ? (
                  <div className="text-center py-10 bg-white border border-slate-200 rounded-2xl">
                    <ClipboardList className="w-10 h-10 text-slate-200 mx-auto" />
                    <p className="text-slate-400 text-xs mt-2">Tidak ada penugasan aktif saat ini.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {assignedOrders.map(o => (
                      <div 
                        key={o.id}
                        onClick={() => setSelectedOrder(o)}
                        className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-emerald-300 transition-colors cursor-pointer flex justify-between items-center"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-mono text-[10px] font-bold text-slate-400">{o.id}</span>
                          <span className="font-semibold text-slate-800 text-xs mt-0.5 truncate">{o.merchantName}</span>
                          <span className="text-[11px] text-slate-500 mt-1 truncate">Ke: {o.customerName} ({o.deliveryAddress.split(',')[0]})</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                            o.status === OrderStatus.READY_FOR_PICKUP 
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            {o.status === OrderStatus.READY_FOR_PICKUP ? 'SIAP JEMPUT 🔔' : o.status}
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 2. HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="flex flex-col gap-3">
            <h3 className="font-display font-bold text-base text-slate-800">Riwayat Tugas Pengantaran</h3>
            {historyOrders.length === 0 ? (
              <p className="text-slate-400 text-xs bg-white p-4 rounded-xl border border-slate-200 text-center">Belum ada tugas selesai.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {historyOrders.map(o => (
                  <div key={o.id} className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm flex flex-col gap-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-mono text-slate-400 text-[10px]">{o.id}</span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        o.status === OrderStatus.COMPLETED 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {o.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-end mt-1">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-800 text-xs">{o.merchantName}</span>
                        <span className="text-[10px] text-slate-400 mt-0.5">Penerima: {o.customerName}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">{new Date(o.createdAt).toLocaleDateString('id-ID')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. PROFILE TAB */}
        {activeTab === 'profile' && driver && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
            <div className="flex items-center gap-3.5 border-b border-slate-100 pb-4">
              <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
                <User className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Profil Driver Tumpang Food</span>
                <h3 className="font-display font-bold text-base text-slate-800 mt-0.5">{driver.name}</h3>
                <span className="text-xs text-slate-500 mt-0.5">{driver.phone}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 py-1 text-xs text-slate-600">
              <div className="flex justify-between border-b border-slate-50 pb-2">
                <span>ID Pegawai:</span>
                <span className="font-bold text-slate-800">{driver.id}</span>
              </div>
              <div className="flex justify-between border-b border-slate-50 pb-2">
                <span>Status Karyawan:</span>
                <span className="font-bold text-emerald-600">Tetap (Internal)</span>
              </div>
              <div className="flex justify-between">
                <span>Mode Penugasan:</span>
                <span className="font-bold text-slate-800">Sistem Otomatis / Manual</span>
              </div>
            </div>

            <div className="flex gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={onLogout}
                className="w-full py-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-bold rounded-xl transition-all text-xs flex items-center justify-center gap-1"
              >
                <LogOut className="w-4 h-4" />
                Keluar Pegawai
              </button>
            </div>
          </div>
        )}

      </main>

      {/* Footer Nav Bar */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-slate-200 flex justify-around p-2.5 z-50 shadow-lg">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 text-xs font-semibold ${
            activeTab === 'dashboard' ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Navigation className="w-5 h-5 rotate-45" />
          <span>Tugas</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1 text-xs font-semibold ${
            activeTab === 'history' ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <ClipboardList className="w-5 h-5" />
          <span>Riwayat</span>
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center gap-1 text-xs font-semibold ${
            activeTab === 'profile' ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <User className="w-5 h-5" />
          <span>Profil</span>
        </button>
      </nav>
    </div>
  );
}
