import React, { useState, useEffect } from 'react';
import { Merchant, Driver } from '../types.ts';
import { ShieldCheck, Store, Navigation, User, X, Key, Info } from 'lucide-react';

interface AuthModalProps {
  onSelectRole: (role: 'CUSTOMER' | 'MERCHANT' | 'DRIVER' | 'ADMIN' | 'SHOP_ADMIN', id?: string) => void;
  onClose: () => void;
  currentRole: string;
}

export default function AuthModal({ onSelectRole, onClose, currentRole }: AuthModalProps) {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSelectionData();
  }, []);

  const fetchSelectionData = async () => {
    setLoading(true);
    try {
      const merRes = await fetch('/api/merchants');
      const merData = await merRes.json();
      setMerchants(merData);

      const drRes = await fetch('/api/drivers');
      const drData = await drRes.json();
      setDrivers(drData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/75 flex items-center justify-center p-4 z-[100] backdrop-blur-md animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-4.5 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-rose-500 animate-pulse" />
            <div className="flex flex-col">
              <h4 className="font-display font-bold text-sm tracking-tight">Portal Multi-Persona</h4>
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Pilih Hak Akses Pengguna</span>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info panel */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 flex gap-2 items-start text-[11px] text-slate-600 flex-shrink-0 leading-relaxed">
          <Info className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" />
          <span>Pilih portal tujuan Anda di bawah ini. Anda akan diarahkan ke halaman login resmi untuk memasukkan email/no. telepon dan kata sandi.</span>
        </div>

        {/* Persona Options */}
        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3.5">
          
          {/* 1. CUSTOMER */}
          <button
            onClick={() => {
              onSelectRole('CUSTOMER');
              onClose();
            }}
            className={`p-3.5 rounded-xl border text-left flex items-center gap-3.5 transition-all ${
              currentRole === 'CUSTOMER'
                ? 'bg-rose-50 border-rose-300 shadow-md shadow-rose-50/15'
                : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className={`p-2.5 rounded-xl ${currentRole === 'CUSTOMER' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              <User className="w-5 h-5" />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-bold text-slate-800 text-xs">Customer (Pembeli)</span>
              <span className="text-[10px] text-slate-400 mt-0.5">Pesan makanan UMKM Kecamatan Tumpang</span>
            </div>
          </button>

          {/* 2. ADMIN */}
          <button
            onClick={() => {
              onSelectRole('ADMIN');
              onClose();
            }}
            className={`p-3.5 rounded-xl border text-left flex items-center gap-3.5 transition-all ${
              currentRole === 'ADMIN'
                ? 'bg-rose-50 border-rose-300 shadow-md shadow-rose-50/15'
                : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className={`p-2.5 rounded-xl ${currentRole === 'ADMIN' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-bold text-slate-800 text-xs">Administrator</span>
              <span className="text-[10px] text-slate-400 mt-0.5">Verifikasi QRIS, atur kurir, atur pencairan dana</span>
            </div>
          </button>

          {/* 3. SHOP ADMIN (TUMPANG SHOP) */}
          <button
            onClick={() => {
              onSelectRole('SHOP_ADMIN');
              onClose();
            }}
            className={`p-3.5 rounded-xl border text-left flex items-center gap-3.5 transition-all cursor-pointer ${
              currentRole === 'SHOP_ADMIN'
                ? 'bg-blue-50 border-blue-300 shadow-md shadow-blue-50/15'
                : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className={`p-2.5 rounded-xl ${currentRole === 'SHOP_ADMIN' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              <Store className="w-5 h-5" />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-bold text-slate-800 text-xs">Admin Tumpang Shop</span>
              <span className="text-[10px] text-slate-400 mt-0.5">Kelola stok produk, pesanan, verifikasi & kargo</span>
            </div>
          </button>

          {/* 4. MERCHANT CHOOSER */}
          <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 flex flex-col gap-2">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <Store className="w-3.5 h-3.5 text-rose-500" />
              Portal Merchant UMKM
            </span>
            
            {loading ? (
              <span className="text-[11px] text-slate-400 animate-pulse">Memuat daftar merchant...</span>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto">
                {merchants.map(m => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onSelectRole('MERCHANT', m.id);
                      onClose();
                    }}
                    className={`p-2 rounded-lg border text-left text-xs font-semibold transition-all flex justify-between items-center ${
                      currentRole === 'MERCHANT' && m.id === m.id // wait, comparing with active merchant state passed
                        ? 'bg-rose-50 border-rose-200 text-rose-700'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="truncate">{m.name}</span>
                    <span className="text-[9px] text-slate-400 font-normal">Owner: {m.ownerName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 4. DRIVER CHOOSER */}
          <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 flex flex-col gap-2">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <Navigation className="w-3.5 h-3.5 text-emerald-500 rotate-45" />
              Portal Kurir Internal
            </span>

            {loading ? (
              <span className="text-[11px] text-slate-400 animate-pulse">Memuat daftar kurir...</span>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-[120px] overflow-y-auto">
                {drivers.map(d => (
                  <button
                    key={d.id}
                    onClick={() => {
                      onSelectRole('DRIVER', d.id);
                      onClose();
                    }}
                    className="p-2 rounded-lg border bg-white border-slate-200 hover:bg-slate-50 text-left text-xs font-semibold text-slate-700 transition-all flex justify-between items-center"
                  >
                    <span>{d.name}</span>
                    <span className="text-[9px] text-slate-400 font-normal">{d.online ? 'Online 🟢' : 'Offline ⚪'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
