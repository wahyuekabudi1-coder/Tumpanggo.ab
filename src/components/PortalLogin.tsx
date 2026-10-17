import React, { useState, useEffect } from 'react';
import { Merchant, Driver } from '../types.ts';
import Logo from './Logo.tsx';
import { 
  ShieldCheck, Lock, Mail, ArrowRight, ChevronLeft, Store, 
  CheckCircle, AlertCircle, Loader2, Phone, Bike, User, MapPin, Tag, ExternalLink
} from 'lucide-react';

interface PortalLoginProps {
  role: 'ADMIN' | 'MERCHANT' | 'DRIVER';
  targetMerchantId?: string;
  targetDriverId?: string;
  initialTab?: 'login' | 'register';
  onSuccess: (email: string, targetId?: string) => void;
  onCancel: () => void;
  onRegisterRedirect?: () => void;
}

export default function PortalLogin({ role, targetMerchantId, targetDriverId, initialTab, onSuccess, onCancel, onRegisterRedirect }: PortalLoginProps) {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(initialTab || (role === 'MERCHANT' ? 'login' : 'login'));
  const [emailInput, setEmailInput] = useState('');
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [targetMerchant, setTargetMerchant] = useState<Merchant | null>(null);
  
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [targetDriver, setTargetDriver] = useState<Driver | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Merchant Registration state
  const [regStoreName, setRegStoreName] = useState('');
  const [regOwnerName, setRegOwnerName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regCategory, setRegCategory] = useState('Nasi & Lauk');
  const [regAddress, setRegAddress] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  
  // Activation state
  const [isActivationMode, setIsActivationMode] = useState(false);
  const [activationEmail, setActivationEmail] = useState('');
  const [activationStoreName, setActivationStoreName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password login input state
  const [passwordInput, setPasswordInput] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isActivate = params.get('activate') === 'true';
    if (isActivate && role === 'MERCHANT') {
      setIsActivationMode(true);
      setActivationEmail(params.get('email') || '');
      setActivationStoreName(params.get('storeName') || '');
    }
  }, [role]);

  useEffect(() => {
    if (role === 'MERCHANT') {
      fetch('/api/merchants')
        .then(res => res.json())
        .then((data: Merchant[]) => {
          setMerchants(data);
          if (targetMerchantId) {
            const match = data.find(m => m.id === targetMerchantId);
            if (match) setTargetMerchant(match);
          }
        })
        .catch(err => console.error('Error fetching merchants:', err));
    } else if (role === 'DRIVER') {
      fetch('/api/drivers')
        .then(res => res.json())
        .then((data: Driver[]) => {
          setDrivers(data);
          if (targetDriverId) {
            const match = data.find(d => d.id === targetDriverId);
            if (match) setTargetDriver(match);
          }
        })
        .catch(err => console.error('Error fetching drivers:', err));
    }
  }, [role, targetMerchantId, targetDriverId]);

  const handleActivateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!newPassword || !confirmPassword) {
      setError('Mohon isi kata sandi baru Anda.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok dengan kata sandi baru Anda.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Kata sandi harus terdiri dari minimal 6 karakter demi keamanan akun Anda.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/merchants/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: activationEmail,
          password: newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal mengaktifkan akun toko.');
      }

      setSuccessMsg(`Aktivasi berhasil! Akun toko "${activationStoreName}" telah aktif.`);
      localStorage.setItem('tumpang_auth_email', activationEmail);
      window.history.replaceState({}, document.title, window.location.pathname);
      
      setTimeout(() => {
        onSuccess(activationEmail, data.merchant?.id);
      }, 1200);

    } catch (err: any) {
      console.error('Activation error:', err);
      setError(err.message || 'Terjadi kesalahan saat mengaktifkan akun toko Anda.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!emailInput || !passwordInput) {
      setError('Mohon isi alamat email / no. telepon dan kata sandi Anda.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: emailInput.trim(),
          password: passwordInput,
          role: role
        })
      });

      const data = await res.json();
      if (res.ok && data.token) {
        const userEmail = emailInput.trim();
        localStorage.setItem('tumpang_auth_email', userEmail);
        localStorage.setItem('tumpang_auth_token', data.token);
        setSuccessMsg('Login Berhasil! Mengalihkan...');
        setTimeout(() => {
          onSuccess(userEmail, data.user?.id);
        }, 500);
      } else {
        setError(data.error || 'Email/No. Telepon atau kata sandi salah. Silakan periksa kembali.');
      }
    } catch (err) {
      console.error('Password login error:', err);
      setError('Gagal terhubung ke server. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleMerchantRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!regStoreName.trim() || !regOwnerName.trim() || !regPhone.trim() || !regPassword) {
      setError('Mohon lengkapi seluruh kolom bertanda bintang (*).');
      return;
    }

    if (regPassword.length < 6) {
      setError('Kata sandi harus terdiri dari minimal 6 karakter.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/merchants/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regStoreName,
          ownerName: regOwnerName,
          phone: regPhone,
          email: regEmail,
          category: regCategory,
          address: regAddress,
          password: regPassword
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal mendaftarkan toko.');
      }

      const authIdentifier = data.merchant.email || data.merchant.phone || data.merchant.id;
      setSuccessMsg(`Pendaftaran berhasil! Selamat datang, Toko "${data.merchant.name}". Mengalihkan ke dashboard...`);
      localStorage.setItem('tumpang_auth_email', authIdentifier);

      setTimeout(() => {
        onSuccess(authIdentifier, data.merchant.id);
      }, 1000);

    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.message || 'Terjadi kesalahan saat mendaftarkan toko.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-3 sm:p-6 z-[100] backdrop-blur-md animate-fadeIn font-sans overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100/80 flex flex-col my-auto max-h-[92vh] overflow-hidden">
        
        {/* Header Branding - Uniform Clean Light Theme */}
        <div className="bg-gradient-to-b from-slate-50 via-slate-50/70 to-white text-slate-800 p-5 sm:p-6 pb-4 border-b border-slate-100 relative flex-shrink-0">
          <div className="absolute top-4 left-4">
            <button 
              onClick={onCancel}
              className="p-2 rounded-full bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-all cursor-pointer shadow-sm"
              title="Kembali"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex flex-col items-center text-center mt-1">
            <div className="mb-2">
              <Logo size={60} mode="full" />
            </div>

            {/* Role Badge */}
            {role === 'ADMIN' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-[11px] font-bold border border-rose-200/80 mb-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-rose-600" />
                <span>Portal Administrator</span>
              </span>
            ) : role === 'DRIVER' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200/80 mb-1.5">
                <Bike className="w-3.5 h-3.5 text-emerald-600" />
                <span>Portal Driver Kurir</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-[11px] font-bold border border-amber-200/80 mb-1.5">
                <Store className="w-3.5 h-3.5 text-amber-600" />
                <span>Portal Merchant Toko</span>
              </span>
            )}
            
            <h3 className="font-display font-extrabold text-xl text-slate-900 tracking-tight">
              {isActivationMode 
                ? 'Aktivasi Akun Toko' 
                : role === 'ADMIN' 
                  ? 'Login Dashboard Admin' 
                  : role === 'DRIVER' 
                    ? 'Login Dashboard Driver' 
                    : activeTab === 'register'
                      ? 'Pendaftaran Mitra UMKM'
                      : 'Login Dashboard Merchant'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-[340px] leading-relaxed">
              {isActivationMode
                ? `Selamat! Toko "${activationStoreName}" telah disetujui. Silakan atur kata sandi baru untuk mengaktifkan portal merchant Anda.`
                : role === 'ADMIN' 
                  ? 'Masukkan Email dan Kata Sandi Administrator untuk masuk ke dashboard utama.' 
                  : role === 'DRIVER'
                    ? targetDriver
                      ? `Portal khusus untuk Driver: ${targetDriver.name}`
                      : 'Masukkan No. WhatsApp / Email dan Kata Sandi Driver Anda.'
                    : activeTab === 'register'
                      ? 'Lengkapi data usaha UMKM Anda di bawah ini untuk bergabung menjadi mitra kuliner.'
                      : targetMerchant 
                        ? `Portal khusus untuk Toko: ${targetMerchant.name}`
                        : 'Masukkan Email / No. Telepon dan Kata Sandi Toko UMKM Anda.'
              }
            </p>
          </div>
        </div>

        {/* Content Body - Scrollable Container */}
        <div className="p-5 sm:p-6 flex flex-col gap-4 overflow-y-auto max-h-[calc(92vh-160px)]">

          {/* Status Message Containers */}
          {error && (
            <div 
              className="bg-red-50 border-2 border-red-500 text-red-700 text-xs p-3.5 rounded-2xl flex gap-2.5 items-start font-semibold shadow-sm animate-fadeIn"
              style={{ backgroundColor: '#fef2f2', borderColor: '#ef4444', color: '#b91c1c' }}
            >
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" style={{ color: '#dc2626' }} />
              <span className="leading-relaxed font-bold">{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3.5 rounded-2xl flex gap-2.5 items-start font-semibold animate-fadeIn">
              <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <span className="leading-relaxed font-bold">{successMsg}</span>
            </div>
          )}

          {/* Activation Form or Registration Form or Standard Login Form */}
          {isActivationMode ? (
            <form onSubmit={handleActivateAccount} className="flex flex-col gap-4 animate-fadeIn">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">Email Merchant</label>
                <input
                  type="email"
                  disabled
                  value={activationEmail}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500 font-medium"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">Nama Toko / UMKM</label>
                <input
                  type="text"
                  disabled
                  value={activationStoreName}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500 font-medium"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">Buat Kata Sandi Baru</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    disabled={loading}
                    placeholder="Minimal 6 karakter"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-slate-50/80 border border-slate-200 hover:border-slate-300 focus:border-rose-500 focus:bg-white rounded-xl pl-10 pr-4 py-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all font-medium"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">Konfirmasi Kata Sandi</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    disabled={loading}
                    placeholder="Ulangi kata sandi"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-50/80 border border-slate-200 hover:border-slate-300 focus:border-rose-500 focus:bg-white rounded-xl pl-10 pr-4 py-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-all font-medium"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold rounded-xl transition-all shadow-md shadow-rose-600/20 text-xs mt-2 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-55 active:scale-98"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <>
                    <span>Aktifkan Akun & Masuk Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Email / Phone + Kata Sandi Form - Uniform Layout */
            <form onSubmit={handlePasswordLogin} className="flex flex-col gap-4 animate-fadeIn">
              <div>
                <label 
                  className={`text-[11px] font-bold uppercase tracking-wider block mb-1.5 ${error ? 'text-red-600 font-extrabold' : 'text-slate-700'}`}
                  style={error ? { color: '#dc2626' } : undefined}
                >
                  {role === 'ADMIN' 
                    ? 'Email / Username Administrator' 
                    : role === 'DRIVER' 
                      ? 'No. WhatsApp / Email Driver' 
                      : 'Email / No. Telepon Toko'}
                </label>
                <div className="relative">
                  {role === 'ADMIN' ? (
                    <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: error ? '#dc2626' : '#94a3b8' }} />
                  ) : role === 'DRIVER' ? (
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: error ? '#dc2626' : '#94a3b8' }} />
                  ) : (
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: error ? '#dc2626' : '#94a3b8' }} />
                  )}
                  <input
                    type="text"
                    required
                    disabled={loading}
                    placeholder={
                      role === 'ADMIN' 
                        ? 'Masukkan Email / Username Admin' 
                        : role === 'DRIVER' 
                          ? 'Masukkan No. WhatsApp / Email' 
                          : 'Masukkan Email / No. Telepon'
                    }
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      if (error) setError('');
                    }}
                    className={`w-full rounded-xl pl-10 pr-4 py-3 text-xs font-semibold transition-all disabled:opacity-55 focus:outline-none ${
                      error 
                        ? 'bg-red-50 border-2 border-red-500 text-red-900 focus:ring-2 focus:ring-red-500/30' 
                        : 'bg-slate-50/80 border border-slate-200 hover:border-slate-300 focus:border-rose-500 focus:bg-white text-slate-900 focus:ring-2 focus:ring-rose-500/20'
                    }`}
                    style={error ? { backgroundColor: '#fef2f2', borderColor: '#ef4444', color: '#7f1d1d' } : undefined}
                  />
                </div>
                {error && (
                  <p className="text-[11px] font-bold text-red-600 mt-1.5 flex items-center gap-1.5 animate-fadeIn" style={{ color: '#dc2626' }}>
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-red-600" style={{ color: '#dc2626' }} />
                    <span>Periksa kembali email / akun yang Anda masukkan.</span>
                  </p>
                )}
              </div>

              <div>
                <label 
                  className={`text-[11px] font-bold uppercase tracking-wider block mb-1.5 ${error ? 'text-red-600 font-extrabold' : 'text-slate-700'}`}
                  style={error ? { color: '#dc2626' } : undefined}
                >
                  Kata Sandi
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: error ? '#dc2626' : '#94a3b8' }} />
                  <input
                    type="password"
                    required
                    disabled={loading}
                    placeholder="Masukkan kata sandi"
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      if (error) setError('');
                    }}
                    className={`w-full rounded-xl pl-10 pr-4 py-3 text-xs font-semibold transition-all disabled:opacity-55 focus:outline-none ${
                      error 
                        ? 'bg-red-50 border-2 border-red-500 text-red-900 focus:ring-2 focus:ring-red-500/30' 
                        : 'bg-slate-50/80 border border-slate-200 hover:border-slate-300 focus:border-rose-500 focus:bg-white text-slate-900 focus:ring-2 focus:ring-rose-500/20'
                    }`}
                    style={error ? { backgroundColor: '#fef2f2', borderColor: '#ef4444', color: '#7f1d1d' } : undefined}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold rounded-2xl transition-all shadow-md shadow-rose-600/20 text-xs mt-2 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-55 active:scale-98"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <>
                    <span>
                      {role === 'ADMIN' ? 'MASUK DASHBOARD ADMIN' : role === 'DRIVER' ? 'MASUK PORTAL DRIVER' : 'MASUK PORTAL MERCHANT'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {role === 'MERCHANT' && (
                <div className="text-center pt-2 border-t border-slate-100 mt-1 flex flex-col items-center gap-1.5">
                  <p className="text-xs text-slate-500 font-medium">
                    Belum menjadi mitra UMKM?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        const regUrl = window.location.origin + window.location.pathname + '?page=merchant-register';
                        window.open(regUrl, '_blank') || (window.location.href = regUrl);
                      }}
                      className="text-rose-600 font-extrabold hover:underline cursor-pointer inline-flex items-center gap-1"
                    >
                      <span>Daftar Jadi Mitra UMKM</span>
                      <ExternalLink className="w-3 h-3 text-rose-600" />
                    </button>
                  </p>
                </div>
              )}
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
