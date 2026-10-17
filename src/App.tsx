/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import CustomerView from './components/CustomerView.tsx';
import MerchantView from './components/MerchantView.tsx';
import DriverView from './components/DriverView.tsx';
import AdminView from './components/AdminView.tsx';
import AuthModal from './components/AuthModal.tsx';
import PortalLogin from './components/PortalLogin.tsx';
import MerchantRegisterPage from './components/MerchantRegisterPage.tsx';
import ShopAdminView from './components/ShopAdminView.tsx';
import { SystemConfig } from './types.ts';
import { ShieldAlert, Key, HelpCircle, Store, Navigation, ChevronRight } from 'lucide-react';

export default function App() {
  const [currentRole, setCurrentRole] = useState<'CUSTOMER' | 'MERCHANT' | 'DRIVER' | 'ADMIN' | 'SHOP_ADMIN'>('CUSTOMER');
  const [activeMerchantId, setActiveMerchantId] = useState<string>('');
  const [activeDriverId, setActiveDriverId] = useState<string>('');
  const [merchantPortalTab, setMerchantPortalTab] = useState<'login' | 'register'>('login');
  const [verifiedEmail, setVerifiedEmail] = useState<string>(() => localStorage.getItem('tumpang_auth_email') || '');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loadingSelection, setLoadingSelection] = useState(false);
  const [systemConfig, setSystemConfig] = useState<SystemConfig>({
    id: 'config_1',
    qrisImage: 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=400&auto=format&fit=crop&q=60',
    defaultDeliveryFee: 5000,
    serviceFee: 2000
  });

  const [isRegisterPage, setIsRegisterPage] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    return page === 'merchant-register' || page === 'partner-register' || page === 'register-merchant';
  });

  // Check URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    if (page === 'merchant-register' || page === 'partner-register' || page === 'register-merchant') {
      setIsRegisterPage(true);
    }
    const roleParam = params.get('role')?.toUpperCase();
    const idParam = params.get('id') || params.get('merchantId') || params.get('driverId');
    const demoParam = params.get('demo') || params.get('dev');

    if (page === 'shop-admin' || roleParam === 'SHOP_ADMIN' || roleParam === 'SHOP-ADMIN' || roleParam === 'SHOPADMIN') {
      setCurrentRole('SHOP_ADMIN');
    } else if (roleParam && ['CUSTOMER', 'MERCHANT', 'DRIVER', 'ADMIN', 'SHOP_ADMIN'].includes(roleParam)) {
      setCurrentRole(roleParam as any);
      if (roleParam === 'MERCHANT' && idParam) {
        setActiveMerchantId(idParam);
      } else if (roleParam === 'DRIVER' && idParam) {
        setActiveDriverId(idParam);
      }
    }

    if (demoParam === 'true') {
      setIsDemoMode(true);
    }
  }, []);

  // Fetch configuration on load
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data && data.qrisImage) {
          setSystemConfig(data);
        }
      })
      .catch(err => console.error('Error fetching config:', err));
  }, []);

  // Fetch lists for custom selection/login portal
  useEffect(() => {
    setLoadingSelection(true);
    Promise.all([
      fetch('/api/merchants').then(res => res.json()).catch(() => []),
      fetch('/api/drivers').then(res => res.json()).catch(() => [])
    ]).then(([merData, drData]) => {
      setMerchants(merData);
      setDrivers(drData);
      setLoadingSelection(false);
    });
  }, []);

  // Helper for admin email check
  const isAdminEmail = (email: string) => {
    if (!email) return false;
    const e = email.trim().toLowerCase();
    return e === 'tumpanggo@gmail.com' || e === 'sawahjayagroup@gmail.com' || e === 'sawahjayatrans@gmail.com' || e === 'admin' || e.includes('admin') || e.endsWith('@tumpanggo.com');
  };

  // Auto-route logged in merchant owners to their specific store
  useEffect(() => {
    if (currentRole === 'MERCHANT' && !activeMerchantId && verifiedEmail && !isAdminEmail(verifiedEmail) && merchants.length > 0) {
      const ownedMerchant = merchants.find(m => m.email?.trim().toLowerCase() === verifiedEmail.trim().toLowerCase());
      if (ownedMerchant) {
        setActiveMerchantId(ownedMerchant.id);
      } else {
        // Logged in email does not own any merchant, reset session
        setVerifiedEmail('');
        localStorage.removeItem('tumpang_auth_email');
      }
    }
  }, [currentRole, activeMerchantId, verifiedEmail, merchants]);

  // Auto-route logged in drivers to their specific driver panel
  useEffect(() => {
    if (currentRole === 'DRIVER' && !activeDriverId && verifiedEmail && !isAdminEmail(verifiedEmail) && drivers.length > 0) {
      const matchedDriver = drivers.find(d => d.email?.trim().toLowerCase() === verifiedEmail.trim().toLowerCase());
      if (matchedDriver) {
        setActiveDriverId(matchedDriver.id);
      } else {
        // Logged in email does not match any driver, reset session
        setVerifiedEmail('');
        localStorage.removeItem('tumpang_auth_email');
      }
    }
  }, [currentRole, activeDriverId, verifiedEmail, drivers]);

  const handleRoleSelection = (role: 'CUSTOMER' | 'MERCHANT' | 'DRIVER' | 'ADMIN' | 'SHOP_ADMIN', id?: string, initialTab?: 'login' | 'register') => {
    setCurrentRole(role);
    setVerifiedEmail('');
    if (role === 'MERCHANT') {
      setActiveMerchantId(id || '');
      setMerchantPortalTab(initialTab || 'login');
    } else if (role === 'DRIVER') {
      setActiveDriverId(id || '');
    }
    setShowAuthModal(false);
  };

  const handleInstantDashboardAccess = (role: 'ADMIN' | 'MERCHANT' | 'DRIVER') => {
    handleRoleSelection(role);
  };

  // Dedicated registration page link
  if (isRegisterPage) {
    return (
      <MerchantRegisterPage 
        onBackToHome={() => {
          setIsRegisterPage(false);
          window.history.replaceState({}, '', window.location.pathname);
        }}
        onGoToLogin={() => {
          setIsRegisterPage(false);
          setCurrentRole('MERCHANT');
          setMerchantPortalTab('login');
          window.history.replaceState({}, '', window.location.pathname + '?role=merchant');
        }}
      />
    );
  }

  // If merchant role is selected but no merchant ID is provided (direct link ?role=merchant)
  if (currentRole === 'MERCHANT' && !activeMerchantId) {
    if (!verifiedEmail && !isDemoMode) {
      return (
        <PortalLogin 
          role="MERCHANT" 
          initialTab={merchantPortalTab}
          onSuccess={(email, mId) => {
            setVerifiedEmail(email);
            if (mId) setActiveMerchantId(mId);
          }} 
          onCancel={() => {
            setCurrentRole('CUSTOMER');
          }} 
        />
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 flex flex-col">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mb-4 flex-shrink-0">
            <Store className="w-6 h-6" />
          </div>
          <h3 className="font-display font-extrabold text-base text-slate-800">Portal Pemilik Toko (Merchant)</h3>
          <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">
            Selamat datang di Portal Merchant tumpangGo. Silakan pilih toko Anda di bawah ini untuk mengelola menu dan pesanan pelanggan.
          </p>

          <div className="mt-6 flex flex-col gap-2 max-h-[280px] overflow-y-auto pr-1">
            {loadingSelection ? (
              <div className="py-6 text-center text-xs text-slate-400 animate-pulse">Memuat daftar toko...</div>
            ) : merchants.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">Tidak ada toko terdaftar. Hubungi Admin.</div>
            ) : (
              merchants.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setActiveMerchantId(m.id)}
                  className="w-full p-2.5 text-left border border-slate-200 hover:border-rose-500 hover:bg-rose-50/10 rounded-xl transition-all text-xs flex justify-between items-center cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img src={m.image} alt={m.name} className="w-8 h-8 rounded-lg object-cover bg-slate-100 flex-shrink-0" referrerPolicy="no-referrer" />
                    <div className="truncate">
                      <p className="text-slate-800 font-bold truncate">{m.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium truncate">Owner: {m.ownerName}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-rose-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // If driver role is selected but no driver ID is provided (direct link ?role=driver)
  if (currentRole === 'DRIVER' && !activeDriverId) {
    // Driver does not need email verification to choose their identity and access their dashboard
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 flex flex-col">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-4 flex-shrink-0">
            <Navigation className="w-6 h-6 rotate-45" />
          </div>
          <h3 className="font-display font-extrabold text-base text-slate-800">Portal Kurir Internal</h3>
          <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">
            Selamat datang di Portal Kurir tumpangGo. Silakan pilih nama Anda untuk melihat tugas pengantaran makanan hari ini.
          </p>

          <div className="mt-6 flex flex-col gap-2 max-h-[280px] overflow-y-auto pr-1">
            {loadingSelection ? (
              <div className="py-6 text-center text-xs text-slate-400 animate-pulse">Memuat daftar kurir...</div>
            ) : drivers.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">Tidak ada kurir terdaftar. Hubungi Admin.</div>
            ) : (
              drivers.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setActiveDriverId(d.id)}
                  className="w-full p-3 text-left border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/10 rounded-xl transition-all text-xs flex justify-between items-center cursor-pointer group"
                >
                  <div className="truncate">
                    <p className="text-slate-850 font-bold truncate">{d.name}</p>
                    <p className="text-[10px] text-slate-400 font-medium truncate">{d.phone}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${d.online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                      {d.online ? 'Online' : 'Offline'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-100 min-h-screen text-slate-900 selection:bg-rose-500 selection:text-white">
      
      {/* Simulation Persona Control Top Bar - ONLY shown when explicit demo=true URL query is active */}
      {isDemoMode && (
        <div className="bg-slate-950 text-white py-2 px-4 flex justify-between items-center text-xs border-b border-white/10 z-[80] sticky top-0 shadow">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
            <span className="font-medium">Peran Aktif:</span>
            <span className="bg-rose-600/20 text-rose-400 font-bold px-2 py-0.5 rounded tracking-wide uppercase border border-rose-500/10">
              {currentRole === 'MERCHANT' ? `Merchant: ${activeMerchantId}` : currentRole === 'DRIVER' ? `Kurir: ${activeDriverId}` : currentRole}
            </span>
          </div>
          
          <button
            onClick={() => setShowAuthModal(true)}
            className="flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1 rounded-md transition-all shadow-sm"
          >
            <Key className="w-3.5 h-3.5" />
            Ganti Peran / Portal Demo
          </button>
        </div>
      )}

      {/* Render Current Active Portal View */}
      <div className="min-h-screen">
        {currentRole === 'CUSTOMER' && (
          <CustomerView 
            systemConfig={systemConfig} 
            onSwitchView={(v) => console.log('Sub-view transition:', v)}
            onOpenAuthModal={() => setShowAuthModal(true)}
            onSelectRole={handleRoleSelection}
            onInstantDashboard={handleInstantDashboardAccess}
          />
        )}

        {currentRole === 'MERCHANT' && (
          (!verifiedEmail && !isDemoMode) ? (
            <PortalLogin 
              role="MERCHANT" 
              initialTab={merchantPortalTab}
              onSuccess={(email, mId) => {
                setVerifiedEmail(email);
                if (mId) setActiveMerchantId(mId);
              }} 
              onCancel={() => {
                setCurrentRole('CUSTOMER');
              }} 
            />
          ) : (activeMerchantId && merchants.length > 0 && !isDemoMode && 
               !(isAdminEmail(verifiedEmail) || 
                 (merchants.find(m => m.id === activeMerchantId)?.email?.trim().toLowerCase() === verifiedEmail.trim().toLowerCase()))
          ) ? (
            <PortalLogin 
              role="MERCHANT" 
              targetMerchantId={activeMerchantId} 
              onSuccess={(email) => setVerifiedEmail(email)} 
              onCancel={() => {
                setActiveMerchantId('');
                setCurrentRole('CUSTOMER');
              }} 
            />
          ) : (
            <MerchantView 
              merchantId={activeMerchantId} 
              onLogout={() => {
                setVerifiedEmail('');
                localStorage.removeItem('tumpang_auth_email');
                setActiveMerchantId('');
                setCurrentRole('CUSTOMER');
              }}
            />
          )
        )}

        {currentRole === 'DRIVER' && (
          (!verifiedEmail && !isDemoMode) ? (
            <PortalLogin 
              role="DRIVER" 
              onSuccess={(email, dId) => {
                setVerifiedEmail(email);
                if (dId) setActiveDriverId(dId);
              }} 
              onCancel={() => {
                setCurrentRole('CUSTOMER');
              }} 
            />
          ) : (activeDriverId && drivers.length > 0 && !isDemoMode && 
               !(isAdminEmail(verifiedEmail) || 
                 (drivers.find(d => d.id === activeDriverId)?.email?.trim().toLowerCase() === verifiedEmail.trim().toLowerCase()))
          ) ? (
            <PortalLogin 
              role="DRIVER" 
              targetDriverId={activeDriverId} 
              onSuccess={(email) => setVerifiedEmail(email)} 
              onCancel={() => {
                setActiveDriverId('');
                setCurrentRole('CUSTOMER');
              }} 
            />
          ) : (
            <DriverView 
              driverId={activeDriverId} 
              onLogout={() => {
                setVerifiedEmail('');
                localStorage.removeItem('tumpang_auth_email');
                setActiveDriverId('');
                setCurrentRole('CUSTOMER');
              }}
            />
          )
        )}

        {currentRole === 'ADMIN' && (
          (!verifiedEmail && !isDemoMode) ? (
            <PortalLogin 
              role="ADMIN" 
              onSuccess={(email) => setVerifiedEmail(email || 'tumpanggo@gmail.com')} 
              onCancel={() => setCurrentRole('CUSTOMER')} 
            />
          ) : (
            <AdminView 
              systemConfig={systemConfig}
              onUpdateConfig={(conf) => setSystemConfig(conf)}
              onLogout={() => {
                setVerifiedEmail('');
                localStorage.removeItem('tumpang_auth_email');
                setCurrentRole('CUSTOMER');
              }}
            />
          )
        )}

        {currentRole === 'SHOP_ADMIN' && (
          <ShopAdminView 
            onBackToCustomer={() => setCurrentRole('CUSTOMER')} 
          />
        )}
      </div>

      {/* Multi-Persona Modal Picker overlay */}
      {showAuthModal && (
        <AuthModal 
          currentRole={currentRole}
          onSelectRole={handleRoleSelection}
          onClose={() => setShowAuthModal(false)}
        />
      )}
    </div>
  );
}
