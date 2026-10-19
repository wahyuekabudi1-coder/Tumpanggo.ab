import React, { useState, useEffect, useRef } from 'react';
import { 
  Merchant, MenuItem, Category, Order, OrderItem, OrderStatus, SystemConfig, calculateTieredServiceFee
} from '../types.ts';
import MapPicker from './MapPicker.tsx';
import Logo from './Logo.tsx';
import BannerCarousel from './BannerCarousel.tsx';
import ShopMarketplaceView from './ShopMarketplaceView.tsx';
import ErrorBoundary from './ErrorBoundary.tsx';
import { compressImage, compressBase64 } from '../utils/imageCompressor.ts';
import { safeStorage } from '../utils/safeStorage.ts';
import { apiFetch as fetch, extractArrayResponse } from '../utils/apiClient.ts';
import { openPayment, configure } from '@arto-pay/js-sdk';
import { 
  Search, ShoppingBag, Store, MapPin, Clock, Star, ArrowLeft, Plus, Minus, Trash2, 
  CheckCircle2, ArrowRight, Share2, Phone, Calendar, ClipboardList, RefreshCw, X,
  Download, Smartphone, Info, Home, UserPlus, Bike, Users, XCircle, Key, ShieldCheck,
  Wifi, Utensils, Car, Wallet, QrCode, Send, CreditCard, ArrowUpRight, ArrowDownLeft,
  ExternalLink, Globe, Lock, Crown, Sparkles, Building2, BadgeCheck, Award, TrendingUp, ChevronLeft, ChevronRight, Heart, AlertCircle
} from 'lucide-react';

interface CustomerViewProps {
  onSwitchView?: (view: string) => void;
  systemConfig: SystemConfig;
  onOpenAuthModal?: () => void;
  onSelectRole?: (role: 'CUSTOMER' | 'MERCHANT' | 'DRIVER' | 'ADMIN', id?: string, initialTab?: 'login' | 'register') => void;
  onInstantDashboard?: (role: 'ADMIN' | 'MERCHANT' | 'DRIVER') => void;
  initialTab?: string;
}

export const CULINARY_CATEGORIES = [
  { id: 'all', name: 'Semua', emoji: '🍔' },
  { id: 'bakso_mie', name: 'Bakso & Mie', emoji: '🍜' },
  { id: 'nasi_lauk', name: 'Nasi & Lauk', emoji: '🍛' },
  { id: 'sate_bakaran', name: 'Sate & Bakaran', emoji: '🍢' },
  { id: 'cemilan', name: 'Cemilan & Jajanan', emoji: '🍘' },
  { id: 'minuman', name: 'Minuman Segar', emoji: '🥤' }
];

export default function CustomerView({ onSwitchView, systemConfig, onOpenAuthModal, onSelectRole, onInstantDashboard, initialTab }: CustomerViewProps) {
  // Navigation / Tab state
  // 'home' | 'merchant-detail' | 'cart' | 'checkout' | 'payment' | 'tracking' | 'history' | 'partner-register'
  const [activeTab, setActiveTab] = useState<string>(initialTab || 'home');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Load ArtoPay public gateway configuration on mount
  useEffect(() => {
    fetch('/api/artopay/config')
      .then(async res => {
        if (!res.ok) return;
        const cfg = await res.json();
        if (cfg.publicKey) {
          (window as any).__ARTOPAY_PUBLIC_KEY__ = cfg.publicKey;
          (window as any).VITE_ARTOPAY_PUBLIC_KEY = cfg.publicKey;
          const scriptEl = document.getElementById('arto-pay-sdk-script');
          if (scriptEl) {
            scriptEl.setAttribute('data-client-key', cfg.publicKey);
            scriptEl.setAttribute('data-sandbox', String(cfg.sandbox));
          }
        }
        (window as any).__ARTOPAY_SANDBOX__ = cfg.sandbox;
        if (typeof configure === 'function') {
          configure({ sandbox: cfg.sandbox, publicKey: cfg.publicKey } as any);
        }
      })
      .catch(() => {});
  }, []);
  
  // Home layout sub-view: 'main' (GoFood/ShopeeFood style landing) | 'food' (existing food view) | 'taxi' (Taksi Lokal view) | 'shop' (Tumpang Shop view) | 'pay' (Tumpang Pay view) | 'bike' (Tumpang Bike coming soon)
  const [homeSubView, setHomeSubView] = useState<'main' | 'food' | 'taxi' | 'shop' | 'pay' | 'bike'>('main');

  // Waitlist / Coming Soon Notifications states
  const [notifyBikePhone, setNotifyBikePhone] = useState<string>('');
  const [notifyBikeSubmitted, setNotifyBikeSubmitted] = useState<boolean>(false);
  const [notifyTaxiPhone, setNotifyTaxiPhone] = useState<string>('');
  const [notifyTaxiSubmitted, setNotifyTaxiSubmitted] = useState<boolean>(false);
  const [notifyShopPhone, setNotifyShopPhone] = useState<string>('');
  const [notifyShopSubmitted, setNotifyShopSubmitted] = useState<boolean>(false);

  // Tumpang Pay States
  const [payBalance, setPayBalance] = useState<number>(() => {
    try {
      const saved = safeStorage.getItem('tumpang_pay_balance');
      return saved ? Number(saved) : 150000;
    } catch {
      return 150000;
    }
  });

  const [payTransactions, setPayTransactions] = useState<any[]>(() => {
    try {
      const saved = safeStorage.getItem('tumpang_pay_transactions');
      const parsed = saved ? JSON.parse(saved) : null;
      return Array.isArray(parsed) ? parsed : [
        { id: 'tx_1', title: 'Top Up via Agen Tumpang', amount: 50000, type: 'in', date: 'Hari ini, 09:30', category: 'topup' },
        { id: 'tx_2', title: 'Pembayaran Bakso Solo Mas Tumpang', amount: 25000, type: 'out', date: 'Kemarin, 13:15', category: 'food' },
        { id: 'tx_3', title: 'Transfer dari Sdr. Slamet', amount: 100000, type: 'in', date: '19 Jul 2026, 18:00', category: 'transfer' },
        { id: 'tx_4', title: 'Sewa Tumpang Taksi ke Pasar', amount: 12000, type: 'out', date: '18 Jul 2026, 08:45', category: 'taxi' }
      ];
    } catch {
      return [];
    }
  });

  const [payActiveScreen, setPayActiveScreen] = useState<'main' | 'topup' | 'transfer' | 'qris' | 'success_slip' | 'buylink_invoice'>('main');
  const [payTopUpAmount, setPayTopUpAmount] = useState<string>('');
  const [payTopUpMethod, setPayTopUpMethod] = useState<string>('qris');
  const [payTransferTargetPhone, setPayTransferTargetPhone] = useState<string>('');
  const [payTransferTargetName, setPayTransferTargetName] = useState<string>('');
  const [payTransferAmount, setPayTransferAmount] = useState<string>('');
  const [payTransferNote, setPayTransferNote] = useState<string>('');
  const [payQrisMerchantName, setPayQrisMerchantName] = useState<string>('');
  const [payQrisAmount, setPayQrisAmount] = useState<string>('');
  const [payLastTransaction, setPayLastTransaction] = useState<any | null>(null);

  // buylink.id/tumpangGo store states
  const [buylinkPhone, setBuylinkPhone] = useState<string>('081234567890');

  // Secret Portal Access State (Unlocked by clicking copyright 10+ times, lasts 2 minutes)
  const [copyrightClicks, setCopyrightClicks] = useState<number>(0);
  const [portalAccessUnlocked, setPortalAccessUnlocked] = useState<boolean>(() => {
    try {
      const expiry = safeStorage.getItem('tumpang_portal_access_until');
      if (expiry) {
        return Date.now() < Number(expiry);
      }
    } catch {
      // ignore
    }
    return false;
  });

  useEffect(() => {
    if (!portalAccessUnlocked) return;

    const checkExpiry = () => {
      try {
        const expiry = safeStorage.getItem('tumpang_portal_access_until');
        if (!expiry || Date.now() >= Number(expiry)) {
          setPortalAccessUnlocked(false);
          safeStorage.removeItem('tumpang_portal_access_until');
        }
      } catch {
        setPortalAccessUnlocked(false);
      }
    };

    checkExpiry();
    const interval = setInterval(checkExpiry, 1000);
    return () => clearInterval(interval);
  }, [portalAccessUnlocked]);

  const handleCopyrightClick = () => {
    // Secret trigger: no visual feedback, no alert, no sound
    setCopyrightClicks(prev => {
      const nextCount = prev + 1;
      if (nextCount >= 10) {
        const TWO_MINUTES_MS = 2 * 60 * 1000;
        const expiryTime = Date.now() + TWO_MINUTES_MS;
        safeStorage.setItem('tumpang_portal_access_until', expiryTime.toString());
        setPortalAccessUnlocked(true);
        return 0;
      }
      return nextCount;
    });
  };
  const [buylinkCategory, setBuylinkCategory] = useState<'saldo' | 'pulsa' | 'data' | 'pln'>('saldo');
  const [buylinkSelectedProduct, setBuylinkSelectedProduct] = useState<any | null>(null);
  const [buylinkPaymentMethod, setBuylinkPaymentMethod] = useState<string>('qris');
  const [buylinkInvoice, setBuylinkInvoice] = useState<any | null>(null);
  const [buylinkCountdown, setBuylinkCountdown] = useState<number>(900); // 15 mins (in seconds)

  useEffect(() => {
    let interval: any = null;
    if (payActiveScreen === 'buylink_invoice' && buylinkCountdown > 0) {
      interval = setInterval(() => {
        setBuylinkCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [payActiveScreen, buylinkCountdown]);

  const [isDriverModalOpen, setIsDriverModalOpen] = useState<boolean>(false);
  const [driverName, setDriverName] = useState<string>('');
  const [driverPhone, setDriverPhone] = useState<string>('');
  const [driverVehicle, setDriverVehicle] = useState<'motorcycle' | 'car'>('motorcycle');
  const [driverPlate, setDriverPlate] = useState<string>('');
  const [driverRegSubmitted, setDriverRegSubmitted] = useState<boolean>(false);

  const [isWaChatOpen, setIsWaChatOpen] = useState<boolean>(false);
  const [currentWaInput, setCurrentWaInput] = useState<string>('');
  const [isWaTyping, setIsWaTyping] = useState<boolean>(false);
  const [waMessages, setWaMessages] = useState<any[]>([
    { sender: 'bot', text: 'Halo! Selamat datang di WhatsApp Center Tumpang Go. Ada yang bisa kami bantu hari ini? 😊', time: 'Hari ini' }
  ]);
  const [isDriverLicUploaded, setIsDriverLicUploaded] = useState<boolean>(false);

  const [isApkModalOpen, setIsApkModalOpen] = useState<boolean>(false);
  const [apkDownloadProgress, setApkDownloadProgress] = useState<number>(0);
  const [isApkDownloaded, setIsApkDownloaded] = useState<boolean>(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState<boolean>(false);

  // Taksi Lokal States
  const [taxiPickUp, setTaxiPickUp] = useState<string>('terminal');
  const [taxiDropOff, setTaxiDropOff] = useState<string>('pasar');
  const [taxiRideType, setTaxiRideType] = useState<'motorcycle' | 'car'>('motorcycle');
  const [taxiCustomerName, setTaxiCustomerName] = useState<string>('');
  const [taxiCustomerPhone, setTaxiCustomerPhone] = useState<string>('');
  const [taxiBookingStatus, setTaxiBookingStatus] = useState<'idle' | 'searching' | 'active' | 'completed'>('idle');
  const [assignedTaxiDriver, setAssignedTaxiDriver] = useState<any>(null);
  const [taxiTripProgress, setTaxiTripProgress] = useState<string>('');
  const [taxiProgressStep, setTaxiProgressStep] = useState<number>(0);
  const [taxiRating, setTaxiRating] = useState<number>(5);
  const [taxiRatingSubmitted, setTaxiRatingSubmitted] = useState<boolean>(false);
  const [taxiTripsHistory, setTaxiTripsHistory] = useState<any[]>(() => {
    try {
      const saved = safeStorage.getItem('tumpang_taxi_trips');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Tumpang Shop States
  const [shopCart, setShopCart] = useState<{ id: string; name: string; price: number; qty: number }[]>([]);
  const [shopSearch, setShopSearch] = useState<string>('');
  const [shopCategory, setShopCategory] = useState<string>('all');
  const [shopBookingStatus, setShopBookingStatus] = useState<'idle' | 'success'>('idle');
  const [shopCustomerName, setShopCustomerName] = useState<string>('');
  const [shopCustomerPhone, setShopCustomerPhone] = useState<string>('');
  const [shopCustomerAddress, setShopCustomerAddress] = useState<string>('');

  const TUMPANG_SHOP_ITEMS = [
    { id: 'ts_1', name: 'Minyak Goreng Kita 1L', price: 16000, category: 'sembako', description: 'Minyak goreng subsidi kualitas premium.', image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500&auto=format&fit=crop&q=60' },
    { id: 'ts_2', name: 'Beras Premium Tumpang 5kg', price: 72500, category: 'sembako', description: 'Beras putih pulen hasil panen petani lokal Tumpang.', image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=60' },
    { id: 'ts_3', name: 'Gula Pasir Rose Brand 1kg', price: 17500, category: 'sembako', description: 'Gula pasir tebu murni, manis & bersih.', image: 'https://images.unsplash.com/photo-1581798459219-318e76aecc7b?w=500&auto=format&fit=crop&q=60' },
    { id: 'ts_4', name: 'Kopi Dampit Tumpang 250g', price: 29000, category: 'khas', description: 'Kopi bubuk robusta premium khas lereng Gunung Semeru.', image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500&auto=format&fit=crop&q=60' },
    { id: 'ts_5', name: 'Keripik Tempe Sagu Tumpang', price: 15000, category: 'khas', description: 'Keripik tempe sagu khas Tumpang yang super renyah & gurih.', image: 'https://images.unsplash.com/photo-1613758201502-bd79b54a4181?w=500&auto=format&fit=crop&q=60' },
    { id: 'ts_6', name: 'Sabun Cair Nuvo Family 450ml', price: 21000, category: 'kebersihan', description: 'Sabun mandi cair antibakteri, perlindungan keluarga.', image: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=500&auto=format&fit=crop&q=60' }
  ];

  const handleAddToShopCart = (item: typeof TUMPANG_SHOP_ITEMS[0]) => {
    setShopCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }];
    });
  };

  const handleDecreaseShopCart = (itemId: string) => {
    setShopCart(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const existing = safePrev.find(i => i && i.id === itemId);
      if (existing && existing.qty > 1) {
        return safePrev.map(i => i.id === itemId ? { ...i, qty: i.qty - 1 } : i);
      }
      return safePrev.filter(i => i && i.id !== itemId);
    });
  };

  const shopCartTotal = shopCart.reduce((acc, curr) => acc + (curr.price * curr.qty), 0);

  // WhatsApp Direct Action
  const handleOpenWhatsApp = () => {
    const text = encodeURIComponent("Hello my client, I need information about this service.");
    window.open(`https://wa.me/628123456789?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const TUMPANG_LOCATIONS = [
    { id: 'terminal', name: 'Terminal Tumpang', address: 'Jl. Raya Tumpang No.1, Tumpang', lat: -7.9463, lng: 112.7602 },
    { id: 'pasar', name: 'Pasar Tumpang', address: 'Jl. Raya Tumpang, Area Pasar, Tumpang', lat: -7.9472, lng: 112.7610 },
    { id: 'candi_kidal', name: 'Candi Kidal', address: 'Kidal, Kecamatan Tumpang', lat: -7.9615, lng: 112.7121 },
    { id: 'candi_jago', name: 'Candi Jago', address: 'Dusun Jago, Tumpang', lat: -7.9498, lng: 112.7628 },
    { id: 'alun_alun', name: 'Alun-Alun / Taman Tumpang', address: 'Kecamatan Tumpang', lat: -7.9455, lng: 112.7595 },
    { id: 'coban_pelangi', name: 'Coban Pelangi', address: 'Gubugklakah, Tumpang', lat: -7.9712, lng: 112.8250 },
    { id: 'desela', name: 'DeSela (Destinasi Selandor)', address: 'Slamet, Kecamatan Tumpang', lat: -7.9250, lng: 112.7480 },
    { id: 'kantor_kec', name: 'Kantor Kecamatan Tumpang', address: 'Jl. Raya Tumpang, Tumpang', lat: -7.9442, lng: 112.7588 },
    { id: 'jeru', name: 'Desa Wisata Jeru', address: 'Jeru, Kecamatan Tumpang', lat: -7.9550, lng: 112.7410 }
  ];

  const LOCAL_TAXI_DRIVERS = [
    { id: 'td_1', name: 'Pak Agus Tumpang', phone: '081234567801', vehicle: 'Supra X (N 4321 AA)', rating: 4.9, avatar: '👨‍✈️' },
    { id: 'td_2', name: 'Mas Budi Jeru', phone: '081234567802', vehicle: 'Vario 150 (N 9876 AB)', rating: 4.8, avatar: '🧑‍✈️' },
    { id: 'td_3', name: 'Pak Slamet Slamet', phone: '081234567803', vehicle: 'Avanza Silver (N 1234 C)', rating: 5.0, avatar: '👨‍💼' },
    { id: 'td_4', name: 'Mas Dedi Kidal', phone: '081234567804', vehicle: 'Beat Street (N 5678 XY)', rating: 4.7, avatar: '👦' },
    { id: 'td_5', name: 'Pak Jono Gubugklakah', phone: '081234567805', vehicle: 'Xenia Hitam (N 7788 B)', rating: 4.9, avatar: '🧔' }
  ];

  const calculateDistance = (loc1Id: string, loc2Id: string) => {
    const l1 = TUMPANG_LOCATIONS.find(l => l.id === loc1Id);
    const l2 = TUMPANG_LOCATIONS.find(l => l.id === loc2Id);
    if (!l1 || !l2) return 0;
    if (l1.id === l2.id) return 0.5; // same spot distance
    
    const deg2rad = (deg: number) => deg * (Math.PI / 180);
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(l2.lat - l1.lat);
    const dLon = deg2rad(l2.lng - l1.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(l1.lat)) * Math.cos(deg2rad(l2.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return parseFloat(d.toFixed(1));
  };

  const getTaxiPrice = (dist: number, type: 'motorcycle' | 'car') => {
    if (type === 'motorcycle') {
      const price = 6000 + (dist * 2000);
      return Math.max(8000, Math.round(price / 1000) * 1000);
    } else {
      const price = 12000 + (dist * 4500);
      return Math.max(15000, Math.round(price / 1000) * 1000);
    }
  };

  // Taxi booking simulation timer
  const searchTimeoutRef = useRef<any>(null);
  const tripIntervalRef = useRef<any>(null);

  const handleStartTaxiBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taxiCustomerName || !taxiCustomerPhone) {
      alert('Nama dan No. WhatsApp wajib diisi untuk memesan Tumpang Taksi!');
      return;
    }
    
    setTaxiBookingStatus('searching');
    setTaxiProgressStep(0);
    setTaxiTripProgress('Mencari driver terdekat di wilayah Tumpang...');
    
    // Simulate search
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      // Pick a driver matching the ride type
      const suitableDrivers = LOCAL_TAXI_DRIVERS.filter(d => 
        taxiRideType === 'car' ? (d.vehicle.includes('Avanza') || d.vehicle.includes('Xenia')) : !d.vehicle.includes('Avanza') && !d.vehicle.includes('Xenia')
      );
      const randomDriver = suitableDrivers[Math.floor(Math.random() * suitableDrivers.length)] || LOCAL_TAXI_DRIVERS[0];
      
      setAssignedTaxiDriver(randomDriver);
      setTaxiBookingStatus('active');
      setTaxiProgressStep(1);
      setTaxiTripProgress('Driver ditemukan! Sedang menuju lokasi penjemputan Anda.');
      
      // Start journey updates
      let step = 1;
      if (tripIntervalRef.current) clearInterval(tripIntervalRef.current);
      tripIntervalRef.current = setInterval(() => {
        step += 1;
        setTaxiProgressStep(step);
        if (step === 2) {
          setTaxiTripProgress('Driver telah sampai di lokasi jemput. Harap menemui driver.');
        } else if (step === 3) {
          setTaxiTripProgress('Perjalanan sedang berlangsung. Nikmati rute Anda aman bersama taksi lokal.');
        } else if (step === 4) {
          // Completed!
          clearInterval(tripIntervalRef.current);
          setTaxiBookingStatus('completed');
          setTaxiTripProgress('Perjalanan selesai! Terima kasih telah menggunakan layanan Tumpang Taksi.');
          setTaxiRatingSubmitted(false);
          setTaxiRating(5);
          
          // Save to history
          const dist = calculateDistance(taxiPickUp, taxiDropOff);
          const price = getTaxiPrice(dist, taxiRideType);
          const pLoc = TUMPANG_LOCATIONS.find(l => l.id === taxiPickUp)?.name || taxiPickUp;
          const dLoc = TUMPANG_LOCATIONS.find(l => l.id === taxiDropOff)?.name || taxiDropOff;
          
          const newTrip = {
            id: 'TX-' + Math.floor(1000 + Math.random() * 9000),
            customerName: taxiCustomerName,
            customerPhone: taxiCustomerPhone,
            pickUp: pLoc,
            dropOff: dLoc,
            rideType: taxiRideType === 'motorcycle' ? 'Ojek Motor 🏍️' : 'Taksi Mobil 🚗',
            driverName: randomDriver.name,
            driverVehicle: randomDriver.vehicle,
            distance: dist,
            price: price,
            date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          };
          
          setTaxiTripsHistory(prev => {
            const updated = [newTrip, ...prev];
            safeStorage.setItem('tumpang_taxi_trips', JSON.stringify(updated));
            return updated;
          });
        }
      }, 4000); // changes step every 4 seconds
      
    }, 3000); // searches for 3 seconds
  };

  const handleCancelTaxiBooking = () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (tripIntervalRef.current) clearInterval(tripIntervalRef.current);
    setTaxiBookingStatus('idle');
    setAssignedTaxiDriver(null);
    setTaxiProgressStep(0);
    setTaxiTripProgress('');
  };

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (tripIntervalRef.current) clearInterval(tripIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    let interval: any;
    if (isApkModalOpen && apkDownloadProgress < 100 && !isApkDownloaded) {
      interval = setInterval(() => {
        setApkDownloadProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            setIsApkDownloaded(true);
            return 100;
          }
          const nextVal = prev + Math.floor(Math.random() * 12) + 8;
          return nextVal > 100 ? 100 : nextVal;
        });
      }, 200);
    }
    return () => clearInterval(interval);
  }, [isApkModalOpen, isApkDownloaded]);

  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchantsLoading, setMerchantsLoading] = useState<boolean>(true);
  const [merchantsError, setMerchantsError] = useState<string | null>(null);
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [selectedMerchantMenu, setSelectedMerchantMenu] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedMerchantCategory, setSelectedMerchantCategory] = useState<string>('all');
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Cart state
  const [cart, setCart] = useState<OrderItem[]>(() => {
    try {
      const saved = safeStorage.getItem('tumpang_cart');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [cartMerchantId, setCartMerchantId] = useState<string | null>(() => {
    try {
      return safeStorage.getItem('tumpang_cart_merchant_id') || null;
    } catch {
      return null;
    }
  });
  const [cartMerchant, setCartMerchant] = useState<Merchant | null>(() => {
    try {
      const saved = safeStorage.getItem('tumpang_cart_merchant');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [showClearCartConfirm, setShowClearCartConfirm] = useState<{ pendingItem: MenuItem; pendingMerchant: Merchant } | null>(null);
  const [selectedMenuItemDetail, setSelectedMenuItemDetail] = useState<{ item: MenuItem; merchant: Merchant } | null>(null);

  useEffect(() => {
    try {
      safeStorage.setItem('tumpang_cart', JSON.stringify(cart));
      if (cartMerchantId) safeStorage.setItem('tumpang_cart_merchant_id', cartMerchantId);
      else safeStorage.removeItem('tumpang_cart_merchant_id');
      if (cartMerchant) safeStorage.setItem('tumpang_cart_merchant', JSON.stringify(cartMerchant));
      else safeStorage.removeItem('tumpang_cart_merchant');
    } catch (e) {
      console.error(e);
    }
  }, [cart, cartMerchantId, cartMerchant]);

  // Checkout form state
  const [checkoutName, setCheckoutName] = useState('');
  const [checkoutPhone, setCheckoutPhone] = useState('');
  const [checkoutAddress, setCheckoutAddress] = useState('');
  const [checkoutDetails, setCheckoutDetails] = useState('');
  const [checkoutLandmark, setCheckoutLandmark] = useState('');
  const [checkoutLat, setCheckoutLat] = useState(-7.9482);
  const [checkoutLng, setCheckoutLng] = useState(112.7612);
  const [preOrderDate, setPreOrderDate] = useState('');
  const [checkoutDeliveryType, setCheckoutDeliveryType] = useState<'INSTANT' | 'PREORDER'>('INSTANT');

  useEffect(() => {
    if (cartMerchant) {
      if (cartMerchant.preOrderOnly) {
        setCheckoutDeliveryType('PREORDER');
      } else {
        setCheckoutDeliveryType('INSTANT');
      }
    } else if (selectedMerchant) {
      if (selectedMerchant.preOrderOnly) {
        setCheckoutDeliveryType('PREORDER');
      } else {
        setCheckoutDeliveryType('INSTANT');
      }
    }
  }, [cartMerchant, selectedMerchant]);

  // Helper to determine the pre-order minimum quantity for a cart item or menu item
  const getMenuItemPreOrderMin = (item: { menuItemId?: string; id?: string; preOrderMinAmount?: number }) => {
    const isPreOrder = cartMerchant?.preOrderOnly || checkoutDeliveryType === 'PREORDER';
    if (!isPreOrder) return 1;

    const itemId = item.menuItemId || item.id;
    const menuItem = selectedMerchantMenu.find(m => m.id === itemId);
    const itemMin = menuItem?.preOrderMinAmount ?? item.preOrderMinAmount;

    const merchantMin = cartMerchant?.preOrderMinAmount;

    return Number(itemMin) || Number(merchantMin) || 1;
  };

  // Active Order / Tracking state
  const [activeOrder, setActiveOrder] = useState<Order | null>(() => {
    try {
      const saved = safeStorage.getItem('tumpang_active_order');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (activeOrder) {
        safeStorage.setItem('tumpang_active_order', JSON.stringify(activeOrder));
      } else {
        safeStorage.removeItem('tumpang_active_order');
      }
    } catch (e) {
      console.error(e);
    }
  }, [activeOrder]);

  const [trackingOrderId, setTrackingOrderId] = useState<string>('');
  const [paymentProofUrl, setPaymentProofUrl] = useState('');
  const [paymentProofFile, setPaymentProofFile] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  // ArtoPay Dynamic QRIS states
  const [paymentMethodTab, setPaymentMethodTab] = useState<'ARTOPAY' | 'MANUAL'>('ARTOPAY');
  const [artopayLoading, setArtopayLoading] = useState(false);
  const [artopayChecking, setArtopayChecking] = useState(false);
  const [artopayStatusMsg, setArtopayStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showArtopayModal, setShowArtopayModal] = useState<boolean>(false);

  // History search state
  const [historyPhone, setHistoryPhone] = useState('');
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historySearched, setHistorySearched] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Partner registration states
  const [partnerName, setPartnerName] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [partnerType, setPartnerType] = useState<'MERCHANT' | 'DRIVER'>('MERCHANT');
  const [partnerStoreName, setPartnerStoreName] = useState('');
  const [partnerStoreAddress, setPartnerStoreAddress] = useState('');
  const [partnerCategory, setPartnerCategory] = useState('Bakso & Mie');
  const [partnerVehicle, setPartnerVehicle] = useState('');
  const [partnerArea, setPartnerArea] = useState('');
  const [partnerSubmitLoading, setPartnerSubmitLoading] = useState(false);
  const [partnerSubmitSuccess, setPartnerSubmitSuccess] = useState(false);

  // Active registration tracking states
  const [submittedPartnerId, setSubmittedPartnerId] = useState<string | null>(
    safeStorage.getItem('tumpang_submitted_partner_id')
  );
  const [submittedPartnerEmail, setSubmittedPartnerEmail] = useState<string | null>(
    safeStorage.getItem('tumpang_submitted_partner_email')
  );
  const [activeRegistration, setActiveRegistration] = useState<any>(null);
  const [checkingRegistration, setCheckingRegistration] = useState(false);

  // Fetch partner registration status
  const checkMyPartnerRegistration = async () => {
    const id = safeStorage.getItem('tumpang_submitted_partner_id');
    const email = safeStorage.getItem('tumpang_submitted_partner_email');
    if (!id && !email) {
      setActiveRegistration(null);
      return;
    }
    setCheckingRegistration(true);
    try {
      const res = await fetch('/api/partner-registrations');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
        const match = list.find((r: any) => r && (r.id === id || r.email?.trim().toLowerCase() === email?.trim().toLowerCase()));
        if (match) {
          setActiveRegistration(match);
        } else {
          setActiveRegistration(null);
        }
      }
    } catch (e) {
      console.error('Error checking partner registration:', e);
    } finally {
      setCheckingRegistration(false);
    }
  };

  const resetPartnerForm = () => {
    // Clear local storage tracking
    safeStorage.removeItem('tumpang_submitted_partner_id');
    safeStorage.removeItem('tumpang_submitted_partner_email');
    
    // Clear tracking states
    setSubmittedPartnerId(null);
    setSubmittedPartnerEmail(null);
    setActiveRegistration(null);
    setPartnerSubmitSuccess(false);
    
    // Reset form inputs
    setPartnerName('');
    setPartnerPhone('');
    setPartnerEmail('');
    setPartnerType('MERCHANT');
    setPartnerStoreName('');
    setPartnerStoreAddress('');
    setPartnerCategory('Bakso & Mie');
    setPartnerVehicle('');
    setPartnerArea('');
    
    // Reset steps and files
    setPartnerStep(1);
    setBusinessPhoto('');
    setIdPhoto('');
    setContractPhoto('');
    setSignatureSigned(false);
    setPartnerTermsAccepted(false);
  };

  useEffect(() => {
    if (activeTab === 'partner-register') {
      checkMyPartnerRegistration();
    }
  }, [activeTab]);

  // High-fidelity Multi-step and Attachment states
  const [partnerStep, setPartnerStep] = useState<number>(1);
  const [businessPhoto, setBusinessPhoto] = useState<string>('');
  const [idPhoto, setIdPhoto] = useState<string>('');
  const [contractPhoto, setContractPhoto] = useState<string>('');
  const [partnerLat, setPartnerLat] = useState<number>(-7.9482);
  const [partnerLng, setPartnerLng] = useState<number>(112.7612);
  const [signatureSigned, setSignatureSigned] = useState<boolean>(false);
  const [partnerTermsAccepted, setPartnerTermsAccepted] = useState<boolean>(false);

  // Canvas Drawing Signature logic
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a'; // Slate-900
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = async () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
      try {
        const compressed = await compressBase64(dataUrl, 600, 600, 0.5);
        setContractPhoto(compressed);
      } catch (e) {
        setContractPhoto(dataUrl);
      }
      setSignatureSigned(true);
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setContractPhoto('');
        setSignatureSigned(false);
      }
    }
  };

  const handlePartnerFileChange = async (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 800, 800, 0.6);
        setter(compressed);
      } catch (err) {
        console.error('Error compressing file:', err);
        // Fallback to standard reader
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setter(reader.result);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handlePartnerRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (partnerType === 'MERCHANT') {
      if (!partnerName || !partnerPhone || !partnerEmail) {
        alert('Mohon lengkapi Nama, No WhatsApp, dan Email Anda.');
        return;
      }
      if (!partnerStoreName || !partnerStoreAddress) {
        alert('Mohon lengkapi Nama Toko dan Alamat Toko Anda.');
        return;
      }
    } else {
      // Driver mode
      if (!partnerName || !partnerPhone || !partnerVehicle || !partnerArea) {
        alert('Mohon lengkapi Nama, No WhatsApp, Nomor Plat, dan Wilayah Operasional Anda.');
        return;
      }
    }
    if (!partnerTermsAccepted) {
      alert('Anda harus menyetujui Syarat dan Ketentuan Kemitraan Tumpang Food terlebih dahulu.');
      return;
    }

    setPartnerSubmitLoading(true);
    try {
      const payload: any = {
        name: partnerName,
        phone: partnerPhone,
        type: partnerType,
        status: 'PENDING',
        latitude: partnerLat,
        longitude: partnerLng,
        businessPhoto: businessPhoto,
        idPhoto: idPhoto,
        contractPhoto: contractPhoto,
      };

      if (partnerType === 'MERCHANT') {
        payload.email = partnerEmail.trim().toLowerCase();
        payload.storeName = partnerStoreName;
        payload.storeAddress = partnerStoreAddress;
        payload.category = partnerCategory;
      } else {
        payload.vehicleNumber = partnerVehicle;
        payload.operatingArea = partnerArea;
        // Optional: save empty string for email
        payload.email = '';
      }

      const res = await fetch('/api/partner-registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          safeStorage.setItem('tumpang_submitted_partner_id', data.id);
          safeStorage.setItem('tumpang_submitted_partner_email', payload.email || payload.phone);
          setSubmittedPartnerId(data.id);
          setSubmittedPartnerEmail(payload.email || payload.phone);
          // Set active registration immediately
          setActiveRegistration(data);
        }
        setPartnerSubmitSuccess(true);
        // Clear form
        setPartnerName('');
        setPartnerPhone('');
        setPartnerEmail('');
        setPartnerStoreName('');
        setPartnerStoreAddress('');
        setPartnerVehicle('');
        setPartnerArea('');
        setBusinessPhoto('');
        setIdPhoto('');
        setContractPhoto('');
        setSignatureSigned(false);
        setPartnerTermsAccepted(false);
        setPartnerStep(1);
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal mengirimkan pendaftaran.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat mengirim pendaftaran.');
    } finally {
      setPartnerSubmitLoading(false);
    }
  };

  // PWA states and handlers
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);
  const [showPWAInfo, setShowPWAInfo] = useState(false);
  const [dismissedPrompt, setDismissedPrompt] = useState(() => {
    return safeStorage.getItem('tumpang_pwa_dismissed') === 'true';
  });

  useEffect(() => {
    // Check if already running in standalone mode (installed)
    const checkStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                           (window.navigator as any).standalone === true;
    setIsStandalone(checkStandalone);

    // Check if iOS
    const checkiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(checkiOS);

    // Event listener for Android/Chrome beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Event listener for successful install
    const handleAppInstalled = () => {
      console.log('App was successfully installed');
      setIsInstallable(false);
      setDeferredPrompt(null);
      setIsStandalone(true);
      setInstallSuccess(true);
      setTimeout(() => setInstallSuccess(false), 6000);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      setDeferredPrompt(null);
      setIsInstallable(false);
    } else if (isIOS) {
      setShowIOSPrompt(true);
    } else {
      // Manual/Fallback explanation
      setShowPWAInfo(true);
    }
  };

  const dismissInstallPrompt = () => {
    setDismissedPrompt(true);
    safeStorage.setItem('tumpang_pwa_dismissed', 'true');
  };

  // Fetch initial data
  useEffect(() => {
    fetchMerchants();
  }, []);

  const fetchMerchants = async () => {
    setMerchantsLoading(true);
    setMerchantsError(null);
    try {
      const res = await fetch('/api/merchants');
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.error || errJson?.detail || errJson?.message || (errJson?.requestId ? `Gagal memuat toko (HTTP ${res.status} - ID: ${errJson.requestId})` : `Gagal memuat toko (HTTP ${res.status})`);
        throw new Error(errMsg);
      }
      const data = await res.json();
      const list = extractArrayResponse<Merchant>(data, 'merchants');
      setMerchants(list);
    } catch (e: any) {
      console.error('Error fetching merchants:', e);
      setMerchants([]);
      setMerchantsError(e.message || 'Gagal memuat daftar toko kuliner.');
    } finally {
      setMerchantsLoading(false);
    }
  };

  const loadMerchantDetail = async (merchant: Merchant) => {
    setSelectedMerchant(merchant);
    try {
      // Get menu
      const menuRes = await fetch(`/api/merchants/${merchant.id}/menu`);
      if (menuRes.ok) {
        const menuData = await menuRes.json();
        const menuList = extractArrayResponse<MenuItem>(menuData, 'menuItems');
        setSelectedMerchantMenu(menuList);
      } else {
        setSelectedMerchantMenu([]);
      }

      // Get categories
      const catRes = await fetch(`/api/merchants/${merchant.id}/categories`);
      if (catRes.ok) {
        const catData = await catRes.json();
        const catList = extractArrayResponse<Category>(catData, 'categories');
        setCategories(catList);
      } else {
        setCategories([]);
      }
      
      setSelectedCategory('all');
      setActiveTab('merchant-detail');
      setHomeSubView('food');
    } catch (e) {
      console.error('Error loading merchant detail:', e);
      setSelectedMerchantMenu([]);
      setCategories([]);
    }
  };

  // Cart operations
  const addToCart = (item: MenuItem, merchant: Merchant) => {
    if (!merchant.active) {
      alert('Toko sedang tutup. Anda tidak dapat memesan dari toko yang sedang tutup.');
      return;
    }

    if (cartMerchantId && cartMerchantId !== merchant.id) {
      setShowClearCartConfirm({ pendingItem: item, pendingMerchant: merchant });
      return;
    }

    let targetDeliveryType = checkoutDeliveryType;
    if (item.allowInstant === false && checkoutDeliveryType === 'INSTANT') {
      setCheckoutDeliveryType('PREORDER');
      targetDeliveryType = 'PREORDER';
    }

    const isPreOrder = merchant.preOrderOnly || (merchant.allowInstantAndPreOrder && targetDeliveryType === 'PREORDER');
    const itemMinQty = isPreOrder ? (Number(item.preOrderMinAmount) || Number(merchant.preOrderMinAmount) || 1) : 1;
    const initialQty = itemMinQty > 0 ? itemMinQty : 1;

    setCart(prev => {
      const existing = prev.find(i => i.menuItemId === item.id);
      if (existing) {
        const currentQty = Number(existing.quantity || 0);
        const newQty = currentQty < itemMinQty ? itemMinQty : currentQty + 1;
        return prev.map(i => i.menuItemId === item.id ? { ...i, quantity: newQty, preOrderMinAmount: itemMinQty, allowInstant: item.allowInstant } : i);
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: initialQty, preOrderMinAmount: itemMinQty, allowInstant: item.allowInstant }];
    });
    setCartMerchantId(merchant.id);
    setCartMerchant(merchant);
  };

  const handleClearCartAndAdd = () => {
    if (!showClearCartConfirm) return;
    const { pendingItem, pendingMerchant } = showClearCartConfirm;
    
    let targetDeliveryType = checkoutDeliveryType;
    if (pendingItem.allowInstant === false && checkoutDeliveryType === 'INSTANT') {
      setCheckoutDeliveryType('PREORDER');
      targetDeliveryType = 'PREORDER';
    }

    const isPreOrder = pendingMerchant.preOrderOnly || (pendingMerchant.allowInstantAndPreOrder && targetDeliveryType === 'PREORDER');
    const itemMinQty = isPreOrder ? (Number(pendingItem.preOrderMinAmount) || Number(pendingMerchant.preOrderMinAmount) || 1) : 1;
    const initialQty = itemMinQty > 0 ? itemMinQty : 1;

    setCart([{ menuItemId: pendingItem.id, name: pendingItem.name, price: pendingItem.price, quantity: initialQty, preOrderMinAmount: itemMinQty, allowInstant: pendingItem.allowInstant }]);
    setCartMerchantId(pendingMerchant.id);
    setCartMerchant(pendingMerchant);
    setShowClearCartConfirm(null);
  };

  const updateCartQuantity = (menuItemId: string, change: number) => {
    setCart(prev => {
      const isPreOrder = cartMerchant?.preOrderOnly || (cartMerchant?.allowInstantAndPreOrder && checkoutDeliveryType === 'PREORDER');
      
      const updated = prev.map(i => {
        if (i.menuItemId === menuItemId) {
          const itemMinQty = isPreOrder ? (Number(i.preOrderMinAmount) || Number(cartMerchant?.preOrderMinAmount) || 1) : 1;
          const targetMinQty = itemMinQty > 0 ? itemMinQty : 1;
          
          const qty = i.quantity + change;
          
          if (change < 0 && qty < targetMinQty) {
            return null; // Directly drops to 0 (removes from cart)
          }
          
          return qty > 0 ? { ...i, quantity: qty } : null;
        }
        return i;
      }).filter(Boolean) as OrderItem[];

      if (updated.length === 0) {
        setCartMerchantId(null);
        setCartMerchant(null);
      }
      return updated;
    });
  };

  const removeFromCart = (menuItemId: string) => {
    setCart(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const updated = safePrev.filter(i => i && i.menuItemId !== menuItemId);
      if (updated.length === 0) {
        setCartMerchantId(null);
        setCartMerchant(null);
      }
      return updated;
    });
  };

  // Calculations
  const getSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const getDeliveryFee = () => {
    // 5000 flat standard, or configured
    return systemConfig?.defaultDeliveryFee || 5000;
  };

  const getServiceFee = (subtotalVal?: number) => {
    const subtotal = subtotalVal !== undefined ? subtotalVal : getSubtotal();
    return calculateTieredServiceFee(subtotal);
  };

  // Submit checkout
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutName || !checkoutPhone || !checkoutAddress) {
      alert('Mohon lengkapi Nama, No WhatsApp, dan Alamat Pengantaran');
      return;
    }

    if (cart.length === 0 || !cartMerchantId) {
      alert('Keranjang Anda kosong');
      return;
    }

    const safeCart = Array.isArray(cart) ? cart : [];
    const isPreOrder = cartMerchant?.preOrderOnly || checkoutDeliveryType === 'PREORDER';

    // Validate that instant delivery does not contain pre-order-only items
    if (!isPreOrder) {
      const nonInstantItems = safeCart.filter(item => item && item.allowInstant === false);
      if (nonInstantItems.length > 0) {
        const itemNames = nonInstantItems.map(item => `- ${item.name}`).join('\n');
        alert(`Beberapa item dalam keranjang Anda hanya bisa dipesan melalui Pre-Order (tidak bisa dipesan langsung):\n${itemNames}\n\nSilakan ubah metode pemesanan ke Pre-Order atau hapus item tersebut.`);
        return;
      }
    }

    // Pre-order Validation for Premium/Pre-Order merchants
    if (isPreOrder) {
      if (!preOrderDate) {
        alert('Mohon tentukan Tanggal Pengiriman Terlebih Dahulu untuk pesanan Pre-Order.');
        return;
      }

      // Check item-specific minimums
      const invalidItems = safeCart.filter(item => {
        if (!item) return false;
        const min = getMenuItemPreOrderMin(item);
        return item.quantity < min;
      });

      if (invalidItems.length > 0) {
        const itemAlerts = invalidItems.map(item => `- ${item.name} (baru ${item.quantity} dari minimal ${getMenuItemPreOrderMin(item)} porsi)`).join('\n');
        alert(`Beberapa item dalam keranjang Anda belum memenuhi batas minimal order:\n${itemAlerts}\n\nMohon sesuaikan jumlah pesanan Anda.`);
        return;
      }

      // Check merchant-level total minimum order quantity (porsi/item)
      const minQty = Number(cartMerchant?.preOrderMinAmount || 0);
      const totalQty = cart.reduce((sum, item) => Number(sum) + Number(item.quantity), 0);
      if (totalQty < minQty) {
        alert(`Minimal total pembelian untuk pesanan Pre-Order ini adalah ${minQty} porsi. Keranjang belanja Anda baru berisi ${totalQty} porsi. Silakan tambah jumlah item.`);
        return;
      }

      // Check lead notice days
      const selected = new Date(preOrderDate);
      selected.setHours(0,0,0,0);
      const minDate = new Date();
      minDate.setDate(minDate.getDate() + (Number(cartMerchant?.preOrderLeadDays) || 1));
      minDate.setHours(0,0,0,0);

      if (selected < minDate) {
        const leadDays = Number(cartMerchant?.preOrderLeadDays) || 1;
        alert(`Pesanan Pre-Order memerlukan persiapan minimal ${leadDays} hari. Tanggal pengiriman terdekat yang diperbolehkan adalah ${minDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}.`);
        return;
      }
    }

    const payload = {
      customerName: checkoutName,
      customerPhone: checkoutPhone,
      deliveryAddress: checkoutAddress,
      deliveryDetails: checkoutDetails,
      landmark: checkoutLandmark,
      latitude: checkoutLat,
      longitude: checkoutLng,
      items: cart,
      merchantId: cartMerchantId,
      subtotal: getSubtotal(),
      deliveryFee: isPreOrder ? 0 : getDeliveryFee(),
      serviceFee: getServiceFee(),
      preOrderDate: isPreOrder ? preOrderDate : undefined
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const order: Order = await res.json();
      
      if (res.ok) {
        setActiveOrder(order);
        setTrackingOrderId(order.id);
        // Clear cart
        setCart([]);
        setCartMerchantId(null);
        setCartMerchant(null);
        setPreOrderDate(''); // Reset pre-order date state
        setActiveTab('payment');
      } else {
        alert(order.cancelReason || 'Gagal membuat pesanan');
      }
    } catch (e) {
      console.error('Checkout error:', e);
      alert('Terjadi kesalahan saat memproses pesanan.');
    }
  };

  // Handle proof upload (simulate)
  const handlePaymentProofUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const proof = paymentProofFile || paymentProofUrl;
    if (!proof) {
      alert('Silakan pilih file bukti pembayaran atau masukkan tautan gambar.');
      return;
    }

    if (!activeOrder) return;
    setUploadLoading(true);

    try {
      const res = await fetch(`/api/orders/${activeOrder.id}/upload-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentProof: proof })
      });
      const updatedOrder = await res.json();
      if (res.ok) {
        setActiveOrder(updatedOrder);
        alert('Bukti pembayaran berhasil diunggah. Menunggu verifikasi admin.');
      } else {
        alert('Gagal mengunggah bukti pembayaran.');
      }
    } catch (err) {
      console.error('Error uploading payment:', err);
    } finally {
      setUploadLoading(false);
    }
  };

  // Open official ArtoPay SDK Modal
  const handleOpenArtopaySdk = (paymentId?: string, clientSecret?: string, token?: string, publicKey?: string, sandbox?: boolean, orderId?: string) => {
    if (!activeOrder) return;

    // Check if previous payment intent session has expired; if so, regenerate a fresh Payment Intent
    const isSessionExpired = Boolean(!paymentId && activeOrder.artopayExpiredAt && new Date(activeOrder.artopayExpiredAt).getTime() < Date.now());
    if (isSessionExpired) {
      setArtopayStatusMsg({ type: 'info', text: 'Sesi transaksi sebelumnya telah kedaluwarsa. Memperbarui sesi baru dari gateway...' });
      handleCreateArtoPayPayment();
      return;
    }

    const targetPaymentId = (paymentId || activeOrder.artopayPaymentId || '').trim();
    if (!targetPaymentId) {
      setArtopayStatusMsg({ type: 'error', text: 'ID transaksi ArtoPay belum dibuat. Silakan klik tombol pembayaran terlebih dahulu.' });
      return;
    }

    const targetClientSecret = (clientSecret || activeOrder.artopayClientSecret || '').trim();
    const targetToken = (token || activeOrder.artopayCustomerToken || '').trim() || undefined;
    const rawPublicKey = publicKey || activeOrder.artopayPublicKey || (window as any).__ARTOPAY_PUBLIC_KEY__ || (window as any).VITE_ARTOPAY_PUBLIC_KEY || undefined;
    const targetPublicKey = typeof rawPublicKey === 'string' && !rawPublicKey.startsWith('%') && !rawPublicKey.includes('%VITE_') && rawPublicKey !== 'undefined' && rawPublicKey !== 'null' && rawPublicKey.trim().length > 4 ? rawPublicKey.trim() : undefined;
    const isSandbox = sandbox !== undefined ? sandbox : (activeOrder.artopaySandbox !== undefined ? activeOrder.artopaySandbox : ((window as any).__ARTOPAY_SANDBOX__ !== undefined ? (window as any).__ARTOPAY_SANDBOX__ : true));
    const targetOrderId = (orderId || activeOrder.artopayOrderId || activeOrder.id || '').trim();

    if (!targetClientSecret) {
      setArtopayStatusMsg({ type: 'error', text: 'Client secret transaksi ArtoPay tidak ditemukan. Silakan buat sesi pembayaran ulang.' });
      return;
    }

    if (!targetPublicKey) {
      setArtopayStatusMsg({ 
        type: 'error', 
        text: 'Public key ArtoPay (ARTOPAY_PUBLIC_KEY) belum terkonfigurasi. Pastikan ARTOPAY_PUBLIC_KEY diisi dengan kunci publik resmi dari Dashboard ArtoPay.' 
      });
      return;
    }

    // Safe diagnostic logging (No full secret/token exposed)
    console.log('[ArtoPay Modal Diagnostics - CustomerView]', {
      environment: isSandbox ? 'sandbox' : 'production',
      orderId: targetOrderId,
      paymentIntentId: targetPaymentId,
      hasClientSecret: Boolean(targetClientSecret),
      clientSecretPrefix: targetClientSecret ? `${targetClientSecret.substring(0, 7)}...` : 'missing',
      hasCustomerToken: Boolean(targetToken),
      customerTokenPrefix: targetToken ? `${targetToken.substring(0, 7)}...` : 'missing',
      hasPublicKey: Boolean(targetPublicKey),
      publicKeyPrefix: targetPublicKey ? `${targetPublicKey.substring(0, 6)}...` : 'missing',
      isSessionExpired,
      sdkParameters: ['clientSecret', 'secret', 'paymentId', 'paymentIntentId', 'orderId', 'token', 'customerToken', 'publicKey', 'clientKey', 'sandbox']
    });

    try {
      setArtopayStatusMsg({ type: 'info', text: 'Membuka modal pembayaran resmi ArtoPay (QRIS)...' });
      // Ensure SDK configuration is synchronously set before opening modal
      if (typeof configure === 'function') {
        configure({ sandbox: isSandbox, publicKey: targetPublicKey } as any);
      }

      openPayment({
        clientSecret: targetClientSecret,
        secret: targetClientSecret,
        paymentId: targetPaymentId,
        paymentIntentId: targetPaymentId,
        orderId: targetOrderId,
        token: targetToken,
        customerToken: targetToken,
        sandbox: isSandbox,
        publicKey: targetPublicKey,
        clientKey: targetPublicKey,
        onSuccess: async () => {
          setArtopayStatusMsg({ type: 'success', text: 'Pembayaran terdeteksi! Memverifikasi status ke backend...' });
          // Strictly verify via backend API to prevent client-side spoofing
          await handleCheckArtoPayStatus();
        },
        onPending: () => {
          setArtopayStatusMsg({ type: 'info', text: 'Pembayaran pending / sedang diproses oleh gateway.' });
          handleCheckArtoPayStatus();
        },
        onError: (err: any) => {
          console.warn('[ArtoPay SDK Error]', err);
          const errMsg = err?.message || err?.transactionStatus || 'Gagal memproses pembayaran di gateway ArtoPay.';
          let userHint = `Gateway: ${errMsg}`;
          if (typeof errMsg === 'string' && (errMsg.includes('oapi') || errMsg.includes('authentication'))) {
            userHint = 'Autentikasi gateway ArtoPay gagal (OAPI). Pastikan ARTOPAY_PUBLIC_KEY dan ARTOPAY_SECRET_KEY berasal dari akun merchant dan environment yang sama di Dashboard ArtoPay, serta domain aplikasi telah diizinkan (whitelisted) di dashboard merchant.';
          }
          setArtopayStatusMsg({ type: 'error', text: userHint });
          handleCheckArtoPayStatus();
        },
        onClose: () => {
          handleCheckArtoPayStatus();
        }
      } as any);
    } catch (e: any) {
      console.error('[ArtoPay SDK openPayment failed]', e);
      setArtopayStatusMsg({ type: 'error', text: `Gagal membuka checkout ArtoPay: ${e?.message || 'Error internal SDK'}` });
    }
  };

  // ArtoPay Payment Intent Generation
  const handleCreateArtoPayPayment = async () => {
    if (!activeOrder?.id || !activeOrder.id.trim()) {
      setArtopayStatusMsg({ type: 'error', text: 'ID pesanan tidak ditemukan. Pastikan pesanan telah tersimpan.' });
      return;
    }
    setArtopayLoading(true);
    setArtopayStatusMsg(null);

    const abortCtrl = new AbortController();
    const timeoutTimer = setTimeout(() => abortCtrl.abort(), 20000);

    try {
      const res = await fetch('/api/artopay/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: activeOrder.id.trim(),
          serviceType: 'FOOD'
        }),
        signal: abortCtrl.signal
      });
      clearTimeout(timeoutTimer);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal membuat sesi transaksi ArtoPay.');
      }

      // Cross-validate that response belongs to this exact order
      if (data.orderId && data.orderId !== activeOrder.id.trim()) {
        throw new Error(`Inkonsistensi respons transaksi: order ID gateway (${data.orderId}) tidak cocok dengan pesanan aktif (${activeOrder.id}).`);
      }

      const checkoutUrl = String(data.checkoutUrl || '').trim();
      const paymentIntentId = data.paymentIntentId || data.id;

      const updatedOrder: Order = {
        ...activeOrder,
        artopayPaymentId: paymentIntentId,
        artopayCheckoutUrl: checkoutUrl,
        artopayClientSecret: data.clientSecret,
        artopayCustomerToken: data.customerToken,
        artopayPublicKey: data.publicKey,
        artopayOrderId: data.orderId || activeOrder.id,
        artopaySandbox: data.sandbox,
        artopayStatus: 'PENDING',
        paymentMethod: 'ARTOPAY_QRIS',
        artopayExpiredAt: data.expiresAt
      };
      setActiveOrder(updatedOrder);

      // If gateway returns a hosted checkout URL, redirect
      if (checkoutUrl && checkoutUrl.startsWith('http')) {
        setArtopayStatusMsg({
          type: 'success',
          text: 'Mengalihkan ke halaman checkout resmi gateway...'
        });
        window.location.href = checkoutUrl;
        return;
      }

      // Standard ArtoPay SDK modal flow (Smart Journey reference mechanism)
      setArtopayStatusMsg({
        type: 'info',
        text: 'Membuka modal pembayaran resmi ArtoPay (QRIS)...'
      });
      handleOpenArtopaySdk(
        paymentIntentId,
        data.clientSecret,
        data.customerToken,
        data.publicKey,
        data.sandbox,
        data.orderId || activeOrder.id
      );
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      console.error('[ArtoPay Error]', err);
      const isTimeout = err.name === 'AbortError';
      setArtopayStatusMsg({ 
        type: 'error', 
        text: isTimeout 
          ? 'Koneksi ke gateway ArtoPay timeout (20s). Silakan periksa koneksi dan coba lagi.' 
          : (err.message || 'Gagal memulai transaksi ArtoPay.') 
      });
    } finally {
      setArtopayLoading(false);
    }
  };

  // ArtoPay On-demand Status Sync
  const handleCheckArtoPayStatus = async () => {
    if (!activeOrder) return;
    setArtopayChecking(true);
    setArtopayStatusMsg(null);
    try {
      const res = await fetch(`/api/artopay/status/${activeOrder.id}?serviceType=FOOD`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memeriksa status pembayaran.');
      }
      if (data.isPaid || data.status === 'PAID' || data.status === OrderStatus.PAYMENT_VERIFIED) {
        setArtopayStatusMsg({
          type: 'success',
          text: 'Alhamdulillah! Pembayaran QRIS ArtoPay berhasil terverifikasi otomatis. Pesanan segera disiapkan penjual.'
        });
        setShowArtopayModal(false);
        await refreshActiveOrder();
      } else {
        setArtopayStatusMsg({
          type: 'info',
          text: 'Status pembayaran masih menunggu. Silakan selesaikan pembayaran di halaman checkout ArtoPay.'
        });
      }
    } catch (err: any) {
      setArtopayStatusMsg({ type: 'error', text: err.message || 'Gagal memeriksa status pembayaran.' });
    } finally {
      setArtopayChecking(false);
    }
  };


  // Handle file selection and convert to Base64
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 800, 800, 0.6);
        setPaymentProofFile(compressed);
      } catch (err) {
        console.error('Error compressing payment proof:', err);
        // Fallback
        const reader = new FileReader();
        reader.onloadend = () => {
          setPaymentProofFile(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  // Live order refresh
  const refreshActiveOrder = async () => {
    if (!trackingOrderId) return;
    try {
      const res = await fetch(`/api/orders/${trackingOrderId}`);
      if (res.ok) {
        const order = await res.json();
        setActiveOrder(order);
      }
    } catch (e) {
      console.error('Error refreshing order:', e);
    }
  };

  // Auto-listen to payment completion messages and auto-poll status
  useEffect(() => {
    const handleMsg = async (event: MessageEvent) => {
      if (event.data?.type === 'PAYMENT_SUCCESS') {
        if (activeOrder && (event.data.orderId === activeOrder.id || event.data.paymentIntentId === activeOrder.artopayPaymentId)) {
          // Verify with backend before confirming
          await handleCheckArtoPayStatus();
        }
      }
    };
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, [activeOrder?.id, activeOrder?.artopayPaymentId]);

  useEffect(() => {
    if (!activeOrder || activeOrder.status !== OrderStatus.WAITING_PAYMENT || !activeOrder.artopayPaymentId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/artopay/status/${activeOrder.id}?serviceType=FOOD`);
        if (res.ok) {
          const data = await res.json();
          if (data.isPaid || data.status === 'PAID' || data.status === OrderStatus.PAYMENT_VERIFIED) {
            setArtopayStatusMsg({
              type: 'success',
              text: 'Alhamdulillah! Pembayaran QRIS ArtoPay berhasil terverifikasi otomatis. Pesanan segera disiapkan penjual.'
            });
            setShowArtopayModal(false);
            refreshActiveOrder();
          }
        }
      } catch {}
    }, 3500);
    return () => clearInterval(interval);
  }, [activeOrder?.id, activeOrder?.status, activeOrder?.artopayPaymentId]);

  // Search History
  const searchHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!historyPhone) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/orders/customer/${historyPhone}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Gagal memuat riwayat pesanan (HTTP ${res.status})`);
      }
      const data = await res.json();
      const list = extractArrayResponse<Order>(data, 'orders');
      setHistoryOrders(list);
      setHistorySearched(true);
    } catch (err) {
      console.error('History fetch error:', err);
      setHistoryOrders([]);
      setHistorySearched(true);
    } finally {
      setHistoryLoading(false);
    }
  };

  const getMerchantCategory = (m: Merchant): string => {
    if (m.category) return m.category;
    const name = m.name.toLowerCase();
    if (name.includes('bakso') || name.includes('mie') || name.includes('pangsit')) {
      return 'Bakso & Mie';
    }
    if (name.includes('sate') || name.includes('bakar')) {
      return 'Sate & Bakaran';
    }
    if (name.includes('nasi') || name.includes('warung') || name.includes('kedai') || name.includes('dapur')) {
      return 'Nasi & Lauk';
    }
    if (name.includes('es') || name.includes('kopi') || name.includes('jus') || name.includes('boba') || name.includes('teh')) {
      return 'Minuman Segar';
    }
    if (name.includes('martabak') || name.includes('snack') || name.includes('cemilan') || name.includes('roti') || name.includes('kue')) {
      return 'Cemilan & Jajanan';
    }
    // Fallback based on id
    if (m.id === 'm1') return 'Bakso & Mie';
    if (m.id === 'm2') return 'Sate & Bakaran';
    if (m.id === 'm3') return 'Nasi & Lauk';
    return 'Nasi & Lauk';
  };

  // Filter merchants by search query and category
  const filteredMerchants = (Array.isArray(merchants) ? merchants : []).filter(m => {
    if (!m) return false;
    const query = searchQuery.toLowerCase();
    const name = (m.name || '').toLowerCase();
    const description = (m.description || '').toLowerCase();
    const address = (m.address || '').toLowerCase();
    const matchesSearch = name.includes(query) || description.includes(query) || address.includes(query);
    
    if (selectedMerchantCategory === 'all') {
      return matchesSearch;
    }
    
    const mCategory = getMerchantCategory(m);
    const selectedCatObj = (Array.isArray(CULINARY_CATEGORIES) ? CULINARY_CATEGORIES : []).find(c => c && c.id === selectedMerchantCategory);
    if (!selectedCatObj) return matchesSearch;
    
    return matchesSearch && mCategory === selectedCatObj.name;
  });

  let activeThemeStyles: React.CSSProperties | undefined = undefined;
  if (homeSubView === 'food') {
    activeThemeStyles = {
      '--color-rose-50': '#FEF2F2',
      '--color-rose-100': '#FEE2E2',
      '--color-rose-200': '#FECACA',
      '--color-rose-300': '#FCA5A5',
      '--color-rose-500': '#EE2737',
      '--color-rose-600': '#DC2626',
      '--color-rose-700': '#B91C1C',
      '--color-rose-800': '#991B1B',
      '--color-rose-900': '#7F1D1D',
    } as React.CSSProperties;
  } else if (homeSubView === 'taxi') {
    activeThemeStyles = {
      '--color-rose-50': '#FFFDF0',
      '--color-rose-100': '#FEF9C3',
      '--color-rose-200': '#FEF08A',
      '--color-rose-300': '#FDE047',
      '--color-rose-500': '#FFB300',
      '--color-rose-600': '#D97706',
      '--color-rose-700': '#B45309',
      '--color-rose-800': '#92400E',
      '--color-rose-900': '#78350F',
    } as React.CSSProperties;
  } else if (homeSubView === 'shop') {
    activeThemeStyles = {
      '--color-rose-50': '#EFF6FF',
      '--color-rose-100': '#DBEAFE',
      '--color-rose-200': '#BFDBFE',
      '--color-rose-300': '#93C5FD',
      '--color-rose-500': '#0F82FF',
      '--color-rose-600': '#2563EB',
      '--color-rose-700': '#1D4ED8',
      '--color-rose-800': '#1E40AF',
      '--color-rose-900': '#1E3A8A',
    } as React.CSSProperties;
  } else if (homeSubView === 'pay') {
    activeThemeStyles = {
      '--color-rose-50': '#FAF5FF',
      '--color-rose-100': '#F3E8FF',
      '--color-rose-200': '#E9D5FF',
      '--color-rose-300': '#D8B4FE',
      '--color-rose-500': '#6D28D9',
      '--color-rose-600': '#7C3AED',
      '--color-rose-700': '#6D28D9',
      '--color-rose-800': '#5B21B6',
      '--color-rose-900': '#4C1D95',
    } as React.CSSProperties;
  }

  const getHeaderTheme = () => {
    switch (homeSubView) {
      case 'food':
        return {
          borderClass: 'border-b-4 border-[#EE2737] shadow-lg shadow-rose-600/30',
          badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
          installBtnClass: 'bg-gradient-to-r from-[#EE2737] to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white shadow-md shadow-rose-600/30 ring-2 ring-rose-500/30',
          badgeText: '',
        };
      case 'taxi':
        return {
          borderClass: 'border-b-4 border-amber-500 shadow-lg shadow-amber-500/30',
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
          installBtnClass: 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-md shadow-amber-500/30 ring-2 ring-amber-500/30',
          badgeText: '',
        };
      case 'shop':
        return {
          borderClass: 'border-b-4 border-[#0F82FF] shadow-lg shadow-blue-600/30',
          badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
          installBtnClass: 'bg-gradient-to-r from-[#0F82FF] to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-500/30',
          badgeText: '',
        };
      case 'pay':
        return {
          borderClass: 'border-b-4 border-purple-600 shadow-lg shadow-purple-600/30',
          badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
          installBtnClass: 'bg-gradient-to-r from-[#6D28D9] to-purple-800 hover:from-purple-700 hover:to-purple-900 text-white shadow-md shadow-purple-500/30 ring-2 ring-purple-500/30',
          badgeText: '',
        };
      case 'bike':
        return {
          borderClass: 'border-b-4 border-teal-600 shadow-lg shadow-teal-600/30',
          badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
          installBtnClass: 'bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white shadow-md shadow-teal-500/30 ring-2 ring-teal-500/30',
          badgeText: '',
        };
      case 'main':
      default:
        return {
          borderClass: 'border-b-4 border-[#185338] shadow-lg shadow-emerald-800/20',
          badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          installBtnClass: 'bg-gradient-to-r from-[#185338] to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-500/30',
          badgeText: '',
        };
    }
  };

  const headerTheme = getHeaderTheme();

  const renderFooter = (idSuffix: string = '') => (
    <footer className="w-full mt-5 text-slate-700 relative overflow-hidden rounded-2xl border border-slate-100 shadow-xs">
      {/* Top White Section with Logo & Social Media */}
      <div className="py-3 px-4 flex flex-col items-center justify-center text-center bg-white gap-2">
        <Logo size={96} />

        {/* Social Media Links - Icon only */}
        <div className="flex items-center justify-center gap-2 mt-0.5">
          <button 
            type="button"
            onClick={handleOpenWhatsApp}
            title="WhatsApp Tumpang Go"
            aria-label="WhatsApp"
            className="w-7 h-7 rounded-full bg-[#25D366]/10 border border-[#25D366]/30 hover:bg-[#25D366]/20 text-[#25D366] flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.205 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.285-.143-1.689-.833-1.951-.928-.262-.095-.453-.143-.645.143-.19.285-.74.928-.908 1.118-.168.19-.335.214-.62.071-.285-.143-1.205-.444-2.296-1.416-.848-.757-1.421-1.692-1.588-1.978-.168-.285-.018-.439.125-.581.128-.128.285-.335.428-.501.142-.167.19-.285.285-.476.095-.19.047-.357-.024-.501-.071-.143-.645-1.571-.884-2.143-.233-.557-.47-.481-.645-.49-.168-.008-.359-.01-.55-.01-.191 0-.501.071-.763.357-.262.285-.999.977-.999 2.38 0 1.404 1.023 2.76 1.166 2.951.143.19 2.013 3.074 4.877 4.312.681.294 1.213.47 1.628.601.684.217 1.307.186 1.8.113.55-.082 1.689-.69 1.927-1.356.238-.666.238-1.237.167-1.356-.07-.12-.262-.19-.547-.333z"/></svg>
          </button>
          <a 
            href="https://facebook.com" 
            target="_blank" 
            rel="noopener noreferrer" 
            title="Facebook"
            aria-label="Facebook"
            className="w-7 h-7 rounded-full bg-slate-50 border border-slate-200/90 hover:bg-slate-100/90 text-slate-600 flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
          >
            <svg className="w-3.5 h-3.5 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          </a>
          <a 
            href="https://instagram.com" 
            target="_blank" 
            rel="noopener noreferrer" 
            title="Instagram"
            aria-label="Instagram"
            className="w-7 h-7 rounded-full bg-slate-50 border border-slate-200/90 hover:bg-slate-100/90 text-slate-600 flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
          >
            <svg className="w-3.5 h-3.5 text-[#E4405F]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
          </a>
          <a 
            href="https://tiktok.com" 
            target="_blank" 
            rel="noopener noreferrer" 
            title="TikTok"
            aria-label="TikTok"
            className="w-7 h-7 rounded-full bg-slate-50 border border-slate-200/90 hover:bg-slate-100/90 text-slate-600 flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
          >
            <svg className="w-3.5 h-3.5 text-black" fill="currentColor" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.98-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.82.57-1.31 1.53-1.33 2.53-.01.8.31 1.59.88 2.13.62.59 1.5.9 2.34.82 1.05-.04 2.02-.67 2.47-1.6.22-.44.33-.94.33-1.43.02-4.27.01-8.54.01-12.81z"/></svg>
          </a>
          <a 
            href="https://linkedin.com" 
            target="_blank" 
            rel="noopener noreferrer" 
            title="LinkedIn"
            aria-label="LinkedIn"
            className="w-7 h-7 rounded-full bg-slate-50 border border-slate-200/90 hover:bg-slate-100/90 text-slate-600 flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
          >
            <svg className="w-3.5 h-3.5 text-[#0A66C2]" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>
          </a>
        </div>
      </div>

      {/* Green Divider Line */}
      <div className="w-full h-[1px] bg-[#224B33]/20"></div>

      {/* Bottom Green Section - Hijau Adventure */}
      <div className="bg-[#224B33] text-white py-3 px-4 flex flex-col items-center justify-center text-center">
        <p className="text-xs text-emerald-50 font-medium max-w-sm leading-snug">
          Super-App lokal Kecamatan Tumpang untuk UMKM, kurir instan, dan layanan digital.
        </p>

        {/* Plain Copyright text - completely normal, no hover effects or glow */}
        <p 
          onClick={handleCopyrightClick}
          className="text-[10px] text-emerald-200/70 font-normal mt-1.5 select-none cursor-default"
        >
          © 2026 TumpangGo. All rights reserved.
        </p>

        {/* Portal Login & Akses Dashboard (Secret - Unlocked via 10 clicks on copyright) */}
        {portalAccessUnlocked && (
          <div id={`demo-dashboard-quick-access${idSuffix}`} className="mt-3 w-full p-2 bg-[#183a27] border border-emerald-600/40 rounded-xl flex items-center justify-center gap-2 animate-fadeIn">
            <button
              id={`btn-switch-admin${idSuffix}`}
              onClick={() => { if (onSelectRole) onSelectRole('ADMIN'); }}
              className="flex-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-bold text-xs py-2 px-2.5 rounded-lg transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
            >
              <span>🛡️</span>
              <span>Admin</span>
            </button>

            <button
              id={`btn-switch-merchant${idSuffix}`}
              onClick={() => { if (onSelectRole) onSelectRole('MERCHANT'); }}
              className="flex-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-bold text-xs py-2 px-2.5 rounded-lg transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
            >
              <span>🏪</span>
              <span>Merchant</span>
            </button>

            <button
              id={`btn-switch-driver${idSuffix}`}
              onClick={() => { if (onSelectRole) onSelectRole('DRIVER'); }}
              className="flex-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-bold text-xs py-2 px-2.5 rounded-lg transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
            >
              <span>🚴</span>
              <span>Driver</span>
            </button>
          </div>
        )}
      </div>
    </footer>
  );

  return (
    <div 
      className={`max-w-md mx-auto bg-slate-50 min-h-screen shadow-xl relative font-sans transition-all duration-300 ${
        homeSubView === 'main' ? 'pb-3' : 'pb-20'
      }`}
      style={activeThemeStyles}
    >
      {/* Header */}
      <header className={`bg-white px-4 py-1 sticky top-0 z-50 rounded-b-2xl shadow-sm transition-all duration-300 ${headerTheme.borderClass}`}>
        <div className="flex justify-between items-center h-13">
          <div 
            onClick={() => {
              setHomeSubView('main');
              setActiveTab('home');
            }}
            className="flex items-center cursor-pointer group active:scale-98 transition-transform h-full"
            title="Kembali ke Beranda Utama"
          >
            <Logo size={82} className="-my-3" />
          </div>
          <div className="flex items-center gap-1.5">
            {!isStandalone && (
              <button 
                onClick={handleInstallClick}
                className={`text-[10px] px-2.5 py-1.5 rounded-full font-extrabold flex items-center gap-1 cursor-pointer transition-all active:scale-95 ${headerTheme.installBtnClass}`}
                title="Install Aplikasi Tumpanku di Layar Utama"
              >
                <Download className="w-3 h-3 animate-bounce" />
                <span>Install TumpangGo</span>
              </button>
            )}
            {/* Service text badges cleared as requested */}
            {headerTheme.badgeText && (
              <div className={`text-[10px] px-3 py-1.5 rounded-full font-bold border shadow-sm transition-all duration-300 ${headerTheme.badgeClass}`}>
                {headerTheme.badgeText}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="p-4">
        {showClearCartConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-100">
              <h4 className="font-display font-bold text-lg text-slate-800">Ganti Toko?</h4>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                Keranjang Anda berisi menu dari <span className="font-semibold text-slate-800">{cartMerchant?.name}</span>. 
                Memasukkan menu dari <span className="font-semibold text-slate-800">{showClearCartConfirm.pendingMerchant.name}</span> akan mengosongkan keranjang sebelumnya.
              </p>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowClearCartConfirm(null)}
                  className="flex-1 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleClearCartAndAdd}
                  className="flex-1 py-2.5 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/20"
                >
                  Ganti & Tambah
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Detail Menu Popup Modal */}
        {selectedMenuItemDetail && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-slate-100">
              {/* Header Image & Close Button */}
              <div className="relative h-48 bg-slate-100 flex-shrink-0">
                {selectedMenuItemDetail.item.image ? (
                  <img 
                    src={selectedMenuItemDetail.item.image} 
                    alt={selectedMenuItemDetail.item.name} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-rose-50 text-rose-300">
                    <Utensils className="w-12 h-12" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedMenuItemDetail(null)}
                  className="absolute top-3 right-3 bg-slate-900/60 hover:bg-slate-900/80 text-white rounded-full p-1.5 backdrop-blur-md transition-all cursor-pointer"
                  title="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
                
                {/* Merchant Tag */}
                <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-md text-slate-800 text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md flex items-center gap-1 border border-slate-100">
                  <Store className="w-3 h-3 text-rose-500" />
                  {selectedMenuItemDetail.merchant.name}
                </div>
              </div>

              {/* Content */}
              <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3">
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="font-display font-bold text-base text-slate-900 leading-snug">
                      {selectedMenuItemDetail.item.name}
                    </h3>
                    <span className="font-display font-extrabold text-rose-600 text-base flex-shrink-0">
                      Rp {selectedMenuItemDetail.item.price.toLocaleString('id-ID')}
                    </span>
                  </div>
                  
                  {selectedMenuItemDetail.item.allowInstant === false && (
                    <span className="mt-1.5 inline-block bg-amber-50 text-amber-800 border border-amber-200 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      Khusus Pre-Order
                    </span>
                  )}
                </div>

                {/* Detailed Description Box */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                    <Info className="w-3.5 h-3.5 text-rose-500" />
                    Rincian & Komposisi Menu
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line font-normal">
                    {selectedMenuItemDetail.item.description || 'Merchant belum menuliskan rincian khusus untuk menu ini.'}
                  </p>
                </div>

                <p className="text-[10px] text-slate-400 italic">
                  * Rincian menu ditulis langsung oleh pemilik toko ({selectedMenuItemDetail.merchant.name}).
                </p>
              </div>

              {/* Footer / Add to Cart */}
              <div className="p-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    addToCart(selectedMenuItemDetail.item, selectedMenuItemDetail.merchant);
                    setSelectedMenuItemDetail(null);
                  }}
                  disabled={!selectedMenuItemDetail.item.available || !selectedMenuItemDetail.merchant.active}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer ${
                    !selectedMenuItemDetail.item.available || !selectedMenuItemDetail.merchant.active
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                      : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4" />
                  + Tambah ke Keranjang
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PWA Install Success Alert */}
        {installSuccess && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white font-semibold py-3.5 px-6 rounded-2xl shadow-xl z-[120] flex items-center gap-2.5 border border-emerald-500 text-xs w-[90%] max-w-sm animate-bounce">
            <CheckCircle2 className="w-5 h-5 text-white flex-shrink-0 animate-pulse" />
            <span>Aplikasi Tumpang Food berhasil dipasang di layar utama Anda! 🎉</span>
          </div>
        )}

        {/* iOS PWA Install Instruction Modal */}
        {showIOSPrompt && (
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[110] backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100">
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                  <Smartphone className="w-5 h-5" />
                </div>
                <button 
                  onClick={() => setShowIOSPrompt(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <h4 className="font-display font-bold text-base text-slate-800 mt-4">Pasang Tumpang Food di iPhone</h4>
              <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">
                Safari di iPhone tidak mendukung instalasi otomatis satu-klik, namun Anda bisa memasangnya secara manual dengan langkah mudah berikut:
              </p>

              <div className="space-y-3.5 mt-5 text-xs text-slate-700">
                <div className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold flex-shrink-0 text-[10px]">1</div>
                  <p className="leading-relaxed">Buka situs ini menggunakan browser <span className="font-bold text-slate-800">Safari</span> di iPhone Anda.</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold flex-shrink-0 text-[10px]">2</div>
                  <p className="leading-relaxed flex-1">Ketuk tombol <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] inline-flex items-center gap-1">Bagikan (Share) <Share2 className="w-3 h-3 text-blue-500" /></span> di bar navigasi Safari.</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold flex-shrink-0 text-[10px]">3</div>
                  <p className="leading-relaxed text-slate-700">Gulir ke bawah dan pilih menu <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">Tambahkan ke Layar Utama (Add to Home Screen)</span>.</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold flex-shrink-0 text-[10px]">4</div>
                  <p className="leading-relaxed">Ketuk <span className="font-bold text-rose-600">Tambah</span> di sudut kanan atas. Selesai! Aplikasi siap dibuka dari layar utama HP.</p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSPrompt(false)}
                className="w-full mt-6 py-2.5 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        )}

        {/* PWA Educational Information Modal */}
        {showPWAInfo && (
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[110] backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                  <Info className="w-5 h-5" />
                </div>
                <button 
                  onClick={() => setShowPWAInfo(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <h4 className="font-display font-bold text-base text-slate-800 mt-4">Apa itu Fitur Aplikasi (PWA)?</h4>
              <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">
                <span className="font-semibold text-rose-600">PWA (Progressive Web App)</span> adalah teknologi modern yang memungkinkan website Tumpang Food diubah menjadi aplikasi ponsel/komputer yang ringan.
              </p>

              <div className="mt-5 space-y-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <h5 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    🚀 Ringan & Hemat Memori
                  </h5>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Tidak perlu mengunduh puluhan megabyte dari Play Store/App Store. Aplikasi ini terpasang dalam hitungan detik dan sangat hemat kuota data Anda.
                  </p>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <h5 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    📱 Langsung di Layar Utama HP
                  </h5>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Tumpang Food akan memiliki ikon cantik di layar utama ponsel/komputer Anda, dapat dibuka sekali ketuk tanpa repot membuka browser atau mengetik alamat web.
                  </p>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <h5 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    ⚙️ Cara Pasang Manual
                  </h5>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Jika tombol pasang tidak muncul, ketuk tombol <span className="font-bold text-slate-800">Titik Tiga (⋮)</span> di kanan atas browser Chrome Anda, lalu pilih <span className="font-bold text-rose-600">"Instal Aplikasi"</span> atau <span className="font-bold text-rose-600">"Tambahkan ke Layar Utama"</span>.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowPWAInfo(false)}
                className="w-full mt-6 py-2.5 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                Tutup & Kembali
              </button>
            </div>
          </div>
        )}

        {/* ArtoPay Embedded Checkout Modal */}
        {showArtopayModal && activeOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
              {/* Header */}
              <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-700 text-white p-4 px-5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center font-extrabold text-white text-base shadow-xs">
                    T
                  </div>
                  <div className="text-left">
                    <h3 className="font-extrabold text-sm leading-tight tracking-tight flex items-center gap-1.5">
                      <span>ArtoPay Payment Link</span>
                      <span className="text-[10px] bg-emerald-500/40 border border-emerald-300/30 px-2 py-0.5 rounded-full font-bold">Resmi</span>
                    </h3>
                    <p className="text-[11px] text-emerald-100/90">QRIS Dinamis • Tumpang Food</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowArtopayModal(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 overflow-y-auto flex flex-col items-center text-center gap-4">
                {/* Order & Amount Meta */}
                <div className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-center justify-between text-xs">
                  <div className="text-left">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Nomor Pesanan</span>
                    <span className="font-bold text-slate-800 text-xs">#{activeOrder.id}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Total Tagihan</span>
                    <span className="font-extrabold text-emerald-700 text-base font-display">
                      Rp {Math.round(Number(activeOrder.total)).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                {/* ArtoPay Payment Details & Channels */}
                <div className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left">
                  <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Kanal Pembayaran Resmi ArtoPay</span>
                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">Terverifikasi</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-700 font-medium">
                    <div className="flex items-center gap-1.5 bg-white p-2 rounded-xl border border-slate-100 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>QRIS Dinamis Otomatis</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white p-2 rounded-xl border border-slate-100 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      <span>Virtual Account</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white p-2 rounded-xl border border-slate-100 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      <span>E-Wallet</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white p-2 rounded-xl border border-slate-100 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                      <span>Kartu Debit / Kredit</span>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">
                    QRIS dinamis resmi dibuat langsung oleh gateway ArtoPay dan ditampilkan di dalam modal pembayaran atau link checkout resmi.
                  </p>
                </div>

                {/* Status Indicator */}
                <div className="w-full flex items-center justify-center gap-2 p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-amber-800 text-xs font-semibold">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping shrink-0" />
                  <span>Menunggu pembayaran... (Terhubung ke Gateway ArtoPay)</span>
                </div>

                {/* Actions */}
                <div className="w-full flex flex-col gap-2 pt-1">
                  {activeOrder?.artopayCheckoutUrl ? (
                    <a
                      href={activeOrder.artopayCheckoutUrl}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md shadow-emerald-600/20 text-xs flex items-center justify-center gap-2 transition-all cursor-pointer text-center"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Buka Halaman Pembayaran ArtoPay (Payment Link)</span>
                    </a>
                  ) : activeOrder?.artopayPaymentId && activeOrder?.artopayClientSecret ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowArtopayModal(false);
                        handleOpenArtopaySdk();
                      }}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md shadow-emerald-600/20 text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Buka Modal Pembayaran ArtoPay (QRIS)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setShowArtopayModal(false);
                        handleCreateArtoPayPayment();
                      }}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md shadow-emerald-600/20 text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Bayar via ArtoPay (QRIS)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCheckArtoPayStatus}
                    disabled={artopayChecking}
                    className="w-full py-2 text-slate-500 hover:text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${artopayChecking ? 'animate-spin' : ''}`} />
                    <span>Periksa Status Manual</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 1. HOME TAB */}
        {activeTab === 'home' && (
          <div className="flex flex-col gap-5">
            {/* If we are on the main landing dashboard */}
            {homeSubView === 'main' && (
              <div className="flex flex-col gap-5 pb-1">
                {/* Compact Simple PWA Bar */}
                {!isStandalone && !dismissedPrompt && (
                  <div className="bg-gradient-to-r from-rose-50 to-amber-50 border border-rose-200/80 rounded-xl px-3 py-2 flex items-center justify-between gap-2 shadow-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                        <Smartphone className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate leading-tight">
                          Pasang Aplikasi Tumpang Go
                        </p>
                        <p className="text-[10px] text-slate-500 truncate hidden sm:block">
                          Akses cepat langsung dari layar HP Anda
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button 
                        onClick={handleInstallClick}
                        className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Install TumpangGo</span>
                      </button>
                      <button 
                        onClick={() => setShowPWAInfo(true)}
                        className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
                        title="Info PWA"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={dismissInstallPrompt}
                        className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
                        title="Tutup"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Hero Banner Auto-Sliding Carousel */}
                <BannerCarousel mode="main" altPrefix="Banner Platform Digital Warga Tumpang" />

                {/* Main Menu Grid (Shopee Food / GoFood Style) */}
                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-display font-extrabold text-xs text-slate-400 uppercase tracking-wider">Layanan Tumpang Super-App</h4>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3">
                    {/* 1. Tumpang Food Menu (Active - Full Light) */}
                    <button
                      id="btn-main-menu-food"
                      onClick={() => setHomeSubView('food')}
                      className="flex flex-col items-center gap-2 cursor-pointer group active:scale-95 transition-all"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-[#EE2737] flex items-center justify-center text-white shadow-lg shadow-rose-500/20 group-hover:scale-105 transition-transform ring-2 ring-rose-500/20">
                        <Utensils className="w-6 h-6 text-white" />
                      </div>
                      <span className="font-extrabold text-[11px] text-slate-800 tracking-tight text-center">Tumpang Food</span>
                    </button>

                    {/* 2. Tumpang Pay Menu (Active - Full Light) */}
                    <button
                      id="btn-main-menu-pay"
                      onClick={() => {
                        window.open('https://buylink.id/tumpangGo', '_blank');
                        setHomeSubView('pay');
                        setPayActiveScreen('main');
                      }}
                      className="flex flex-col items-center gap-2 cursor-pointer group active:scale-95 transition-all"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-[#6D28D9] flex items-center justify-center text-white shadow-lg shadow-purple-500/20 group-hover:scale-105 transition-transform ring-2 ring-purple-500/20">
                        <Wallet className="w-6 h-6 text-white" />
                      </div>
                      <span className="font-extrabold text-[11px] text-slate-800 tracking-tight text-center">Tumpang Pay</span>
                    </button>

                    {/* 3. Tumpang Shop Marketplace Menu */}
                    <button
                      id="btn-main-menu-shop"
                      onClick={() => setHomeSubView('shop')}
                      className="flex flex-col items-center gap-2 cursor-pointer group active:scale-95 transition-all"
                    >
                      <div className="relative">
                        <div className="w-14 h-14 rounded-2xl bg-[#0F82FF] flex items-center justify-center text-white shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform ring-2 ring-blue-500/20">
                          <ShoppingBag className="w-6 h-6 text-white" />
                        </div>
                        <span className="absolute -top-1.5 -right-2.5 bg-emerald-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-xs uppercase tracking-tight">
                          Toko
                        </span>
                      </div>
                      <span className="font-extrabold text-[11px] text-slate-800 tracking-tight text-center">Tumpang Shop</span>
                    </button>
                  </div>
                </div>

                {/* Rekomendasi Kuliner Populer Tumpang */}
                <div className="bg-white rounded-3xl border border-slate-100/90 p-4 sm:p-5 shadow-xs relative my-2">
                  
                  {/* Section Header */}
                  <div className="flex items-center justify-between mb-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-emerald-100/80 flex items-center justify-center shrink-0 shadow-2xs">
                        <Sparkles className="w-5 h-5 text-emerald-700" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-display font-extrabold text-sm sm:text-base text-slate-900 leading-tight">
                            Rekomendasi Kuliner
                          </h4>
                          <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-0.5 shadow-2xs uppercase tracking-tight border border-emerald-200">
                            Pilihan
                          </span>
                        </div>
                        <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                          Pilihan resto dan kuliner favorit warga Tumpang
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setHomeSubView('food')} 
                      className="text-xs sm:text-sm font-extrabold text-[#185338] hover:underline flex items-center gap-0.5 shrink-0 cursor-pointer"
                    >
                      Lihat Semua <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Merchant Cards Grid */}
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    {(Array.isArray(merchants) ? merchants : []).slice(0, 4).map((merchant, idx) => (
                      <div 
                        key={`featured-${merchant.id}`}
                        onClick={() => {
                          loadMerchantDetail(merchant);
                          setActiveTab('merchant-detail');
                        }}
                        className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col relative"
                      >
                        {/* Image Container */}
                        <div className="relative h-32 sm:h-40 bg-slate-100 overflow-hidden">
                          <img 
                            src={merchant.bannerImage || merchant.image} 
                            alt={merchant.name} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                            onError={(e) => {
                              e.currentTarget.src = 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=600&auto=format&fit=crop&q=80';
                            }}
                          />
                          {/* Top-Left Pilihan badge */}
                          <div className="absolute top-2.5 left-2.5 bg-emerald-800/90 text-white text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                            <span>Favorit</span>
                          </div>
                          {/* Top-Right Favorite button */}
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            className="absolute top-2.5 right-2.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-900/30 backdrop-blur-md flex items-center justify-center text-white hover:bg-slate-900/50 hover:scale-110 transition-all cursor-pointer"
                          >
                            <Heart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                          </button>
                        </div>

                        {/* Card Details */}
                        <div className="p-3 sm:p-3.5 flex-1 flex flex-col justify-between bg-white">
                          <div>
                            <h5 className="font-extrabold text-xs sm:text-sm text-slate-900 line-clamp-1 group-hover:text-emerald-800 transition-colors">
                              {merchant.name}
                            </h5>
                            
                            {/* Status, Distance, Rating */}
                            <div className="flex items-center gap-1.5 mt-1.5 text-[10px] sm:text-xs">
                              <span className="bg-emerald-50 text-emerald-700 font-extrabold px-1.5 py-0.5 rounded-md border border-emerald-200/50 shrink-0 text-[9px] sm:text-[10px]">
                                Buka
                              </span>
                              <span className="text-slate-400 font-medium shrink-0">
                                • {idx === 0 ? '500 m' : '700 m'}
                              </span>
                              <div className="ml-auto flex items-center gap-0.5 sm:gap-1 text-slate-800 font-extrabold">
                                <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                                <span>{merchant.rating ? merchant.rating.toFixed(1) : '4.9'}</span>
                                <span className="text-slate-400 font-normal text-[9px] sm:text-[10px]">({idx === 0 ? '128' : '96'})</span>
                              </div>
                            </div>
                          </div>

                          {/* Time estimate */}
                          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[10px] sm:text-xs text-slate-500 font-medium">
                            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 shrink-0" />
                            <span>{merchant.cookTimeEstimate || (idx === 0 ? '30 - 40 menit' : '20 - 30 menit')}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination Dots */}
                  <div className="flex justify-center items-center gap-1.5 mt-3.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#185338]"></span>
                    <span className="w-2 h-2 rounded-full bg-slate-200"></span>
                    <span className="w-2 h-2 rounded-full bg-slate-200"></span>
                  </div>

                </div>

                {/* Promo Cards Showcase */}
                <div className="flex flex-col gap-3">
                  <h4 className="font-display font-extrabold text-xs text-slate-400 uppercase tracking-wider">Promo Khusus Hari Ini</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gradient-to-br from-purple-500/10 to-indigo-500/5 border border-purple-500/10 p-4 rounded-2xl flex flex-col gap-2">
                      <span className="text-[9px] bg-purple-500/20 text-purple-700 font-extrabold px-2 py-0.5 rounded self-start uppercase">TUMPANG PAY</span>
                      <h5 className="font-bold text-xs text-slate-800 leading-snug">Transaksi Praktis & Cepat!</h5>
                      <p className="text-[10px] text-slate-500 leading-relaxed">Beli saldo & voucher digital secara langsung di Tumpang Pay.</p>
                    </div>
                    <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/10 p-4 rounded-2xl flex flex-col gap-2">
                      <span className="text-[9px] bg-emerald-500/20 text-emerald-700 font-extrabold px-2 py-0.5 rounded self-start uppercase">TUMPANG FOOD</span>
                      <h5 className="font-bold text-xs text-slate-800 leading-snug">Bebas Ongkir UMKM Terdekat</h5>
                      <p className="text-[10px] text-slate-500 leading-relaxed">Nikmati makanan khas dimasak UMKM Tumpang gratis biaya antar.</p>
                    </div>
                  </div>
                </div>

                {/* Rekomendasi UMKM Kuliner Terpopuler */}
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <h4 className="font-display font-extrabold text-xs text-slate-400 uppercase tracking-wider">Rekomendasi Kuliner Terlaris</h4>
                    <button 
                      onClick={() => setHomeSubView('food')} 
                      className="text-[10px] text-emerald-700 font-bold hover:underline flex items-center gap-0.5"
                    >
                      Lihat Semua <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {(Array.isArray(merchants) ? merchants : []).slice(0, 3).map(m => (
                      <div 
                        key={m.id}
                        onClick={() => {
                          loadMerchantDetail(m);
                          setActiveTab('merchant-detail');
                        }}
                        className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col"
                      >
                        <div className="relative h-20 sm:h-24 bg-slate-100 overflow-hidden">
                          <img src={m.image} alt={m.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                          <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 bg-slate-900/70 backdrop-blur-sm text-amber-400 text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-md flex items-center gap-0.5 font-bold">
                            <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-amber-400 stroke-amber-400" />
                            <span>{m.rating.toFixed(1)}</span>
                          </div>
                        </div>
                        <div className="p-2 sm:p-3 flex-1 flex flex-col justify-between">
                          <div>
                            <h5 className="font-bold text-[11px] sm:text-xs text-slate-800 line-clamp-1 group-hover:text-rose-600 transition-colors">{m.name}</h5>
                            <p className="text-[9px] sm:text-[10px] text-slate-400 line-clamp-1 mt-0.5">{m.description}</p>
                          </div>
                          <span className="text-[9px] text-slate-500 font-bold mt-1.5 sm:mt-2 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-slate-300" /> {m.openTime} - {m.closeTime}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section Menjadi Mitra UMKM */}
                <div 
                  onClick={() => onSelectRole('MERCHANT', undefined, 'login')}
                  className="bg-[#185338] text-white rounded-[24px] sm:rounded-3xl p-5 sm:p-6 shadow-md relative overflow-hidden cursor-pointer hover:bg-[#154a32] transition-colors group my-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 sm:gap-4">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#236b49] border border-emerald-600/30 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                        <Store className="w-7 h-7 sm:w-8 sm:h-8 text-amber-300 fill-amber-300/10" />
                      </div>
                      <div>
                        <h3 className="font-display font-extrabold text-base sm:text-lg text-white leading-tight">
                          Menjadi Mitra UMKM
                        </h3>
                        <p className="text-xs sm:text-sm text-emerald-100/90 font-medium mt-0.5">
                          Jualan online lebih mudah.
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-white/90 shrink-0 group-hover:translate-x-1 transition-transform" />
                  </div>

                  <button
                    id="btn-register-umkm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRole('MERCHANT', undefined, 'login');
                    }}
                    className="w-full bg-[#fbc043] hover:bg-[#f3b325] text-slate-950 font-extrabold text-xs sm:text-sm py-3 sm:py-3.5 px-4 rounded-xl sm:rounded-2xl transition-all shadow-sm flex items-center justify-center cursor-pointer active:scale-98 mt-4 sm:mt-5"
                  >
                    Klik di sini
                  </button>
                </div>

                {/* Footer Section */}
                {renderFooter()}

              </div>
            )}

            {/* If we are on the existing Food view */}
            {homeSubView === 'food' && (
              <div className="flex flex-col gap-5">
                {/* Back button to return to the landing home menu */}
                <button
                  onClick={() => {
                    setHomeSubView('main');
                    setActiveTab('home');
                  }}
                  className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 py-2.5 px-4 rounded-xl self-start transition-all cursor-pointer active:scale-95 border border-slate-200/50 mb-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Kembali ke Layanan Utama</span>
                </button>

                {/* Active Food Order Banner (if user has an ongoing food order) */}
                {activeOrder && activeOrder.status !== OrderStatus.CANCELLED && activeOrder.status !== OrderStatus.COMPLETED && (
                  <div className="bg-gradient-to-br from-rose-600 via-rose-700 to-red-800 text-white p-4 rounded-2xl shadow-md border border-rose-500/50 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shrink-0">
                        <Clock className="w-5 h-5 animate-spin" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] uppercase font-extrabold text-rose-200 tracking-wider">Pesanan Makanan Aktif</span>
                          <span className="bg-white/20 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">{activeOrder.merchantName}</span>
                        </div>
                        <h5 className="text-xs font-bold mt-0.5 leading-snug">
                          {activeOrder.status === OrderStatus.WAITING_PAYMENT ? 'Menunggu Pembayaran (Transfer / QRIS)' :
                           activeOrder.status === OrderStatus.WAITING_PAYMENT_VERIFICATION ? 'Menunggu Verifikasi Pembayaran' :
                           activeOrder.status === OrderStatus.COOKING ? 'Toko Sedang Memasak Pesanan' :
                           activeOrder.status === OrderStatus.READY_FOR_PICKUP ? 'Pesanan Siap Diambil Kurir' :
                           activeOrder.status === OrderStatus.ORDER_PICKED_UP ? 'Kurir Sedang Mengantar Pesanan' : 'Pesanan Sedang Diproses'}
                        </h5>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setTrackingOrderId(activeOrder.id);
                        setActiveTab('tracking');
                      }}
                      className="bg-white text-rose-700 hover:bg-rose-50 font-extrabold text-xs px-3.5 py-2 rounded-xl shrink-0 shadow-md transition-all cursor-pointer active:scale-95 flex items-center gap-1"
                    >
                      <span>Lacak</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

            {/* Promo Banner Carousel */}
            <BannerCarousel 
              mode="food" 
              altPrefix="Banner Promo Tumpang Food" 
              onAction={(action) => {
                if (action === 'register_merchant') {
                  setActiveTab('partner-register');
                }
              }}
            />

            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari Bakso, Sate, Warung..."
                className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-rose-500 transition-colors shadow-sm"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Culinary Categories Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-display font-bold text-xs text-slate-700 uppercase tracking-wider">Kategori Kuliner Tumpang</h4>
                {selectedMerchantCategory !== 'all' && (
                  <button 
                    onClick={() => setSelectedMerchantCategory('all')}
                    className="text-[10px] text-rose-600 font-bold hover:underline"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1.5 -mx-4 px-4 scrollbar-thin scrollbar-thumb-slate-200">
                {CULINARY_CATEGORIES.map(cat => {
                  const isActive = selectedMerchantCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedMerchantCategory(cat.id)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-200 cursor-pointer ${
                        isActive
                          ? 'bg-rose-600 text-white shadow-md shadow-rose-600/25 scale-[1.02] border border-rose-600'
                          : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 shadow-sm'
                      }`}
                    >
                      <span className="text-sm">{cat.emoji}</span>
                      <span>{cat.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Merchant List */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-display font-bold text-base text-slate-800">Daftar Toko Kuliner UMKM</h3>
                <span className="text-[11px] font-semibold text-slate-500">{filteredMerchants.length} Toko</span>
              </div>

              {merchantsLoading ? (
                <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 shadow-sm animate-pulse">
                  <RefreshCw className="w-8 h-8 text-rose-500 animate-spin mx-auto mb-2" />
                  <p className="text-slate-600 text-sm font-semibold">Memuat daftar toko kuliner...</p>
                </div>
              ) : merchantsError ? (
                <div className="text-center py-8 px-4 bg-rose-50 rounded-2xl border border-rose-200 shadow-sm">
                  <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
                  <p className="text-slate-800 text-sm font-bold">Gagal memuat toko kuliner</p>
                  <p className="text-rose-700 text-xs mt-1 max-w-sm mx-auto">{merchantsError}</p>
                  <button 
                    onClick={() => fetchMerchants()} 
                    className="mt-3 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
                  >
                    Coba Lagi
                  </button>
                </div>
              ) : filteredMerchants.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <Store className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="text-slate-400 text-sm mt-2">Tidak menemukan toko kuliner yang cocok.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3.5">
                  {filteredMerchants.map((merchant) => (
                    <div 
                      key={merchant.id}
                      onClick={() => loadMerchantDetail(merchant)}
                      className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer group flex flex-col"
                    >
                      {/* Image */}
                      <div className="relative w-full h-36 bg-slate-100 overflow-hidden">
                        <img 
                          src={merchant.bannerImage || merchant.image} 
                          alt={merchant.name} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          onError={(e) => {
                            e.currentTarget.src = 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=600&auto=format&fit=crop&q=80';
                          }}
                        />
                        {/* Open/Close Badge */}
                        <div className="absolute top-3 right-3">
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md uppercase tracking-wider ${
                            merchant.active 
                              ? 'bg-emerald-500 text-white' 
                              : 'bg-slate-600 text-white'
                          }`}>
                            {merchant.active ? 'Buka' : 'Tutup'}
                          </span>
                        </div>
                        {/* Rating */}
                        <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur-sm text-amber-400 text-xs px-2 py-1 rounded-lg flex items-center gap-1 font-bold">
                          <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-400" />
                          <span>{merchant.rating.toFixed(1)}</span>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-4">
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="font-display font-bold text-base text-slate-800 group-hover:text-rose-600 transition-colors leading-snug flex items-center gap-1.5 flex-wrap">
                            <span>{merchant.name}</span>
                          </h4>
                          <span className="bg-rose-50 text-rose-600 font-extrabold text-[9px] px-2 py-0.5 rounded uppercase tracking-wider whitespace-nowrap border border-rose-100 flex items-center gap-0.5">
                            {CULINARY_CATEGORIES.find(c => c.name === getMerchantCategory(merchant))?.emoji || '🍛'}{' '}
                            {getMerchantCategory(merchant)}
                          </span>
                        </div>
                        <p className="text-slate-500 text-xs line-clamp-1.5 mt-1 leading-relaxed">
                          {merchant.description}
                        </p>
                        
                        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 font-medium">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {merchant.openTime} - {merchant.closeTime}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 line-clamp-1" />
                            {merchant.address.split(',')[0]}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer Section */}
            {renderFooter('-food')}
          </div>
        )}

        {/* If we are on the Tumpang Taksi view */}
        {homeSubView === 'taxi' && (
          <div className="flex flex-col gap-5 pb-24">
            {/* Back button to return to the landing home menu */}
            <button
              onClick={() => setHomeSubView('main')}
              className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 py-2.5 px-4 rounded-xl self-start transition-all cursor-pointer active:scale-95 border border-slate-200/50 mb-1"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kembali ke Layanan Utama</span>
            </button>

            {/* Hero Banner Tumpang Taksi Carousel */}
            <BannerCarousel altPrefix="Banner Tumpang Taxi" />
            <div className="relative bg-gradient-to-br from-amber-500 via-yellow-500 to-orange-600 text-white p-6 rounded-3xl shadow-lg shadow-amber-500/20 overflow-hidden">
              <div className="absolute top-0 right-0 w-36 h-36 bg-white/10 rounded-full -mr-8 -mt-8 blur-md"></div>
              <div className="absolute left-[-20px] bottom-[-20px] w-32 h-32 bg-amber-500/25 rounded-full blur-2xl"></div>
              <div className="relative z-10 max-w-[80%]">
                <span className="bg-white/20 text-[9px] uppercase font-black tracking-wider px-3 py-1 rounded-full border border-white/10">Tumpang Taxi</span>
                <h3 className="font-display font-black text-xl leading-tight mt-3">Segera Hadir / Coming Soon!</h3>
                <p className="text-xs text-amber-50 mt-1.5 leading-relaxed">Taksi Mobil Lokal Kecamatan Tumpang. Solusi perjalanan keluarga, wisata, atau barang berat dengan armada mobil yang bersih, nyaman, dan sopir lokal ramah.</p>
              </div>
              <div className="absolute right-[-10px] bottom-[-10px] opacity-25">
                <Car className="w-32 h-32 rotate-12" />
              </div>
            </div>

            {/* Main Coming Soon Card */}
            <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm flex flex-col gap-5">
              <div className="text-center pb-2 border-b border-slate-100">
                <div className="w-16 h-16 rounded-full bg-amber-50 border-2 border-amber-500 flex items-center justify-center text-3xl mx-auto mb-3 shadow-md shadow-amber-500/10">
                  🚗
                </div>
                <h4 className="font-display font-black text-base text-slate-800 uppercase tracking-tight">Tumpang Taxi</h4>
                <p className="text-[10px] text-amber-600 font-bold uppercase mt-0.5 tracking-wider">Layanan Taksi Mobil Nyaman Kecamatan Tumpang</p>
              </div>

              {/* Progress Bar */}
              <div className="bg-amber-50/50 rounded-2xl p-4 border border-amber-100/50 flex flex-col gap-2">
                <div className="flex justify-between items-center text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <span>Progress Peluncuran:</span>
                  <span className="text-amber-700">88% Selesai</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-amber-500 to-yellow-500 h-full rounded-full w-[88%] animate-pulse"></div>
                </div>
                <div className="flex justify-between text-[10px] font-medium text-slate-400 mt-0.5">
                  <span>Tahap Sertifikasi Armada</span>
                  <span>Est. Peluncuran: 18 Hari Lagi</span>
                </div>
              </div>

              {/* Highlights */}
              <div className="flex flex-col gap-3">
                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Kenapa Memilih Tumpang Taxi?</h5>
                
                <div className="flex items-start gap-3 p-2.5 rounded-2xl hover:bg-amber-50/25 transition-all">
                  <span className="text-lg bg-amber-50 p-2 rounded-xl text-amber-600">✨</span>
                  <div>
                    <h6 className="text-xs font-black text-slate-800">Armada Luas & Bersih</h6>
                    <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">Pilihan mobil AC berkapasitas besar hingga 6 penumpang, menjamin kenyamanan maksimal selama perjalanan.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-2xl hover:bg-amber-50/25 transition-all">
                  <span className="text-lg bg-amber-50 p-2 rounded-xl text-amber-600">🤝</span>
                  <div>
                    <h6 className="text-xs font-black text-slate-800">Tarif Jujur Tanpa Surcharge</h6>
                    <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">Tarif transparan per kilometer tanpa biaya tambahan tersembunyi. Lebih hemat dibanding taksi konvensional.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-2xl hover:bg-amber-50/25 transition-all">
                  <span className="text-lg bg-amber-50 p-2 rounded-xl text-amber-600">💼</span>
                  <div>
                    <h6 className="text-xs font-black text-slate-800">Siap Sewa & Antar Luar Kota</h6>
                    <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">Melayani perjalanan wisata, antar-jemput bandara, stasiun, hingga sewa harian lengkap dengan sopirnya.</p>
                  </div>
                </div>
              </div>

              {/* Waitlist Form */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col gap-3">
                {!notifyTaxiSubmitted ? (
                  <>
                    <div className="text-left">
                      <span className="text-[10px] font-black text-amber-600 bg-amber-100/50 px-2 py-0.5 rounded-md uppercase tracking-wider">MINTA NOTIFIKASI</span>
                      <h5 className="text-xs font-black text-slate-800 mt-1">Dapatkan Notifikasi Saat Rilis!</h5>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">Masukkan nomor WhatsApp Anda untuk didaftarkan sebagai penerima voucher diskon Tumpang Taxi pertama kali rilis.</p>
                    </div>

                    <div className="flex flex-col gap-2 mt-1">
                      <input 
                        type="tel"
                        value={notifyTaxiPhone}
                        onChange={(e) => setNotifyTaxiPhone(e.target.value)}
                        placeholder="Masukkan Nomor WhatsApp Anda..."
                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-semibold focus:outline-none focus:border-amber-500 transition-colors"
                      />
                      <button
                        onClick={() => {
                          if (!notifyTaxiPhone.trim()) {
                            alert('Mohon masukkan Nomor WhatsApp Anda yang aktif!');
                            return;
                          }
                          setNotifyTaxiSubmitted(true);
                        }}
                        className="w-full bg-[#D97706] hover:bg-amber-700 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors shadow-md shadow-amber-500/10 cursor-pointer"
                      >
                        Hubungi Saya Saat Rilis
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-2 flex flex-col items-center gap-2 animate-in zoom-in-95 duration-200">
                    <span className="text-2xl">🎉</span>
                    <h5 className="text-xs font-black text-amber-700">Terima Kasih, Anda Sudah Terdaftar!</h5>
                    <p className="text-[10px] text-slate-500 max-w-xs leading-relaxed">Nomor WhatsApp Anda ({notifyTaxiPhone}) berhasil disimpan. Voucher promo eksklusif Tumpang Taxi akan dikirimkan otomatis ke WhatsApp Anda saat peluncuran!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tumpang Shop - Live Marketplace View */}
        {homeSubView === 'shop' && (
          <div className="pb-24 animate-in fade-in duration-200">
            <ErrorBoundary fallbackTitle="Kendala Memuat Tumpang Shop">
              <ShopMarketplaceView onBackToMain={() => setHomeSubView('main')} />
            </ErrorBoundary>
          </div>
        )}

        {/* If we are on the Tumpang Bike view */}
        {homeSubView === 'bike' && (
          <div className="flex flex-col gap-5 pb-24">
            {/* Back button to return to the landing home menu */}
            <button
              onClick={() => setHomeSubView('main')}
              className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 py-2.5 px-4 rounded-xl self-start transition-all cursor-pointer active:scale-95 border border-slate-200/50 mb-1"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kembali ke Layanan Utama</span>
            </button>

            {/* Hero Banner Tumpang Bike Carousel */}
            <BannerCarousel altPrefix="Banner Tumpang Bike" />
            <div className="relative bg-gradient-to-br from-emerald-600 via-green-500 to-teal-700 text-white p-6 rounded-3xl shadow-lg shadow-emerald-500/20 overflow-hidden">
              <div className="absolute top-0 right-0 w-36 h-36 bg-white/10 rounded-full -mr-8 -mt-8 blur-md"></div>
              <div className="absolute left-[-20px] bottom-[-20px] w-32 h-32 bg-emerald-500/25 rounded-full blur-2xl"></div>
              <div className="relative z-10 max-w-[80%]">
                <span className="bg-white/20 text-[9px] uppercase font-black tracking-wider px-3 py-1 rounded-full border border-white/10">Tumpang Bike</span>
                <h3 className="font-display font-black text-xl leading-tight mt-3">Segera Hadir / Coming Soon!</h3>
                <p className="text-xs text-emerald-50 mt-1.5 leading-relaxed">Ojek Motor Otonom & Handal se-Kecamatan Tumpang. Segera hadir untuk memberikan kemudahan mobilitas Anda dengan tarif hemat & penjemputan cepat!</p>
              </div>
              <div className="absolute right-[-10px] bottom-[-10px] opacity-25">
                <Bike className="w-32 h-32 rotate-12" />
              </div>
            </div>

            {/* Main Coming Soon Card */}
            <div className="bg-white border border-emerald-100 rounded-3xl p-6 shadow-sm flex flex-col gap-5">
              <div className="text-center pb-2 border-b border-slate-100">
                <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-500 flex items-center justify-center text-3xl mx-auto mb-3 shadow-md shadow-emerald-500/10">
                  🏍️
                </div>
                <h4 className="font-display font-black text-base text-slate-800 uppercase tracking-tight">Tumpang Bike</h4>
                <p className="text-[10px] text-emerald-600 font-bold uppercase mt-0.5 tracking-wider">Layanan Ojek Motor Masa Depan Tumpang</p>
              </div>

              {/* Countdown Simulator */}
              <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100/50 flex flex-col gap-2">
                <div className="flex justify-between items-center text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <span>Progress Peluncuran:</span>
                  <span className="text-emerald-700">92% Selesai</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-500 to-green-500 h-full rounded-full w-[92%] animate-pulse"></div>
                </div>
                <div className="flex justify-between text-[10px] font-medium text-slate-400 mt-0.5">
                  <span>Tahap Pengujian Driver</span>
                  <span>Est. Peluncuran: 12 Hari Lagi</span>
                </div>
              </div>

              {/* Highlights */}
              <div className="flex flex-col gap-3">
                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Kenapa Memilih Tumpang Bike?</h5>
                
                <div className="flex items-start gap-3 p-2.5 rounded-2xl hover:bg-emerald-50/20 transition-all">
                  <span className="text-lg bg-emerald-50 p-2 rounded-xl text-emerald-600">⚡</span>
                  <div>
                    <h6 className="text-xs font-black text-slate-800">Penjemputan Kilat</h6>
                    <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">Kurang dari 5 menit, driver lokal terdekat berdomisili Tumpang siap meluncur menjemput Anda.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-2xl hover:bg-emerald-50/20 transition-all">
                  <span className="text-lg bg-emerald-50 p-2 rounded-xl text-emerald-600">🪙</span>
                  <div>
                    <h6 className="text-xs font-black text-slate-800">Tarif Super Hemat</h6>
                    <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">Mulai dari Rp 5.000 saja per perjalanan dalam area Kecamatan Tumpang. Tarif jujur tanpa ada markup.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-2xl hover:bg-emerald-50/20 transition-all">
                  <span className="text-lg bg-emerald-50 p-2 rounded-xl text-emerald-600">🛡️</span>
                  <div>
                    <h6 className="text-xs font-black text-slate-800">Aman & Terpercaya</h6>
                    <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">Seluruh mitra ojek lokal adalah warga lokal Tumpang asli yang ramah, santun, dan terverifikasi identitasnya.</p>
                  </div>
                </div>
              </div>

              {/* Waitlist / Notify Me Form */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col gap-3">
                {!notifyBikeSubmitted ? (
                  <>
                    <div className="text-left">
                      <span className="text-[10px] font-black text-emerald-600 bg-emerald-100/50 px-2 py-0.5 rounded-md uppercase tracking-wider">MINTA NOTIFIKASI</span>
                      <h5 className="text-xs font-black text-slate-800 mt-1">Dapatkan Notifikasi Saat Rilis!</h5>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">Masukkan nomor WhatsApp Anda untuk menjadi yang pertama menerima voucher promo gratis ongkir saat resmi meluncur.</p>
                    </div>

                    <div className="flex flex-col gap-2 mt-1">
                      <input 
                        type="tel"
                        value={notifyBikePhone}
                        onChange={(e) => setNotifyBikePhone(e.target.value)}
                        placeholder="Masukkan Nomor WhatsApp Anda..."
                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-semibold focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                      <button
                        onClick={() => {
                          if (!notifyBikePhone.trim()) {
                            alert('Mohon masukkan Nomor WhatsApp Anda yang aktif!');
                            return;
                          }
                          setNotifyBikeSubmitted(true);
                        }}
                        className="w-full bg-[#10B981] hover:bg-emerald-600 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors shadow-md shadow-emerald-500/10 cursor-pointer"
                      >
                        Hubungi Saya Saat Rilis
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-2 flex flex-col items-center gap-2 animate-in zoom-in-95 duration-200">
                    <span className="text-2xl">🎉</span>
                    <h5 className="text-xs font-black text-emerald-700">Terima Kasih, Anda Sudah Terdaftar!</h5>
                    <p className="text-[10px] text-slate-500 max-w-xs leading-relaxed">Nomor WhatsApp Anda ({notifyBikePhone}) berhasil dimasukkan ke dalam daftar tunggu prioritas Tumpang Bike. Kami akan mengirimkan pesan instan begitu layanan diluncurkan!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* If we are on the Tumpang Pay view */}
        {homeSubView === 'pay' && (
          <div className="flex flex-col gap-6 pb-24 animate-in fade-in duration-300">
            {/* Back button directly */}
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setHomeSubView('main')}
                className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 py-2.5 px-4 rounded-xl transition-all cursor-pointer active:scale-95 border border-slate-200/50"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Kembali ke Layanan Utama</span>
              </button>
              
              <span className="text-[10px] bg-purple-100 text-purple-800 font-black px-2.5 py-1 rounded-lg border border-purple-200 uppercase tracking-wider">
                Web Portal 🌐
              </span>
            </div>

            {/* Hero Banner Tumpang Pay Carousel */}
            <BannerCarousel altPrefix="Banner Tumpang Pay" />

            {/* Simulated Web Address / Bio-Link Bar */}
            <div 
              onClick={() => window.open('https://buylink.id/tumpangGo', '_blank')}
              className="bg-slate-100 border border-slate-200/80 rounded-2xl p-3 flex items-center gap-2.5 shadow-sm cursor-pointer hover:bg-slate-200/60 transition-all duration-150 active:scale-[0.99] group"
              title="Buka https://buylink.id/tumpangGo"
            >
              <div className="flex gap-1.5 shrink-0">
                <span className="w-2 h-2 rounded-full bg-red-400 group-hover:scale-110 transition-transform"></span>
                <span className="w-2 h-2 rounded-full bg-yellow-400 group-hover:scale-110 transition-transform"></span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 group-hover:scale-110 transition-transform"></span>
              </div>
              <div className="flex-1 bg-white border border-slate-150 rounded-lg px-3 py-2 flex items-center justify-between text-[11px] font-mono text-slate-500 font-bold select-all shadow-inner group-hover:border-purple-300 group-hover:bg-purple-50/20 transition-all duration-150">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-purple-600 animate-pulse shrink-0" />
                  <span className="font-semibold tracking-tight text-slate-700 truncate group-hover:text-purple-700 transition-colors">
                    https://<span className="text-purple-600 font-black group-hover:underline">buylink.id/tumpangGo</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[8px] bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.5 rounded uppercase tracking-wider">Aman</span>
                  <Lock className="w-3 h-3 text-emerald-600" strokeWidth={3} />
                  <ExternalLink className="w-3.5 h-3.5 text-purple-400 group-hover:text-purple-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </div>
              </div>
            </div>

            {/* Direct Link Information Panel */}
            <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm flex flex-col items-center text-center gap-5 my-2">
              <div className="w-16 h-16 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600 shadow-inner">
                <Globe className="w-8 h-8 text-purple-600 animate-pulse" />
              </div>
              <div>
                <h4 className="font-sans font-black text-slate-800 text-base uppercase tracking-tight">Menuju Web Portal Tumpang Go</h4>
                <p className="text-xs text-slate-500 mt-1.5 max-w-sm leading-relaxed font-medium">
                  Anda akan dialihkan ke portal transaksi resmi Tumpang Go di BuyLink untuk melakukan pembelian & top-up instan.
                </p>
              </div>
              
              {/* Direct Link Action Button */}
              <button
                onClick={() => window.open('https://buylink.id/tumpangGo', '_blank')}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white font-black py-4 px-6 rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-purple-500/10 transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Buka Portal Tumpang Go</span>
              </button>
            </div>
          </div>
        )}



            {/* DRIVER REGISTRATION MODAL */}
            {isDriverModalOpen && (
              <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-150 animate-in zoom-in-95 duration-200">
                  {/* Top Header Graphic banner */}
                  <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white relative">
                    <button 
                      onClick={() => setIsDriverModalOpen(false)}
                      className="absolute top-4 right-4 p-1 rounded-lg bg-black/10 hover:bg-black/20 text-white transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <span className="text-[9px] uppercase font-black bg-white/20 px-2.5 py-1 rounded-full tracking-wider">PROGRAM KEMITRAAN</span>
                    <h3 className="font-sans font-black text-base mt-2">Daftar Mitra Driver Tumpang Go</h3>
                    <p className="text-[10px] text-white/80 mt-1">Gabung ojek/taksi lokal & raih penghasilan tambahan tanpa potongan aplikasi!</p>
                  </div>

                  {!driverRegSubmitted ? (
                    <div className="p-5 flex flex-col gap-4">
                      <div>
                        <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Nama Lengkap Anda</label>
                        <input 
                          type="text" 
                          value={driverName}
                          onChange={(e) => setDriverName(e.target.value)}
                          placeholder="Contoh: Muhammad Slamet"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-emerald-600 transition-colors"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Nomor WhatsApp Aktif</label>
                        <input 
                          type="tel" 
                          value={driverPhone}
                          onChange={(e) => setDriverPhone(e.target.value)}
                          placeholder="Contoh: 081234567890"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-emerald-600 transition-colors"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Jenis Kendaraan</label>
                          <select 
                            value={driverVehicle}
                            onChange={(e) => setDriverVehicle(e.target.value as 'motorcycle' | 'car')}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-3 text-xs font-bold focus:outline-none focus:border-emerald-600 transition-colors cursor-pointer"
                          >
                            <option value="motorcycle">🏍️ Sepeda Motor (Ojek)</option>
                            <option value="car">🚗 Mobil (Taksi)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Nomor Plat Kendaraan</label>
                          <input 
                            type="text" 
                            value={driverPlate}
                            onChange={(e) => setDriverPlate(e.target.value)}
                            placeholder="Contoh: N 5432 AA"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-emerald-600 transition-colors uppercase"
                          />
                        </div>
                      </div>

                      {/* File Upload Box (Interactive drag/drop) */}
                      <div>
                        <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Upload Dokumen (Foto KTP & SIM)</label>
                        <div 
                          onClick={() => setIsDriverLicUploaded(true)}
                          className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[90px] ${
                            isDriverLicUploaded 
                              ? 'border-emerald-500 bg-emerald-50/50 text-emerald-800' 
                              : 'border-slate-250 bg-slate-50 hover:bg-slate-100/60 text-slate-500'
                          }`}
                        >
                          {isDriverLicUploaded ? (
                            <>
                              <span className="text-xl mb-1">✅</span>
                              <p className="text-[10px] font-black">ktp_sim_dokumen.pdf Berhasil Diunggah!</p>
                              <span className="text-[9px] text-emerald-600/70 font-semibold mt-0.5">Klik untuk mengunggah ulang</span>
                            </>
                          ) : (
                            <>
                              <span className="text-xl mb-1">📂</span>
                              <p className="text-[10px] font-black text-slate-600">Seret file ke sini atau klik untuk Upload</p>
                              <span className="text-[9px] text-slate-400 font-semibold mt-0.5">Format pendukung: JPG, PNG, PDF (Maks. 5MB)</span>
                            </>
                          )}
                        </div>
                      </div>

                      <button 
                        onClick={() => {
                          if (!driverName || !driverPhone || !driverPlate) {
                            alert('Mohon isi semua data formulir pendaftaran!');
                            return;
                          }
                          if (!isDriverLicUploaded) {
                            alert('Mohon upload foto KTP & SIM terlebih dahulu!');
                            return;
                          }
                          setDriverRegSubmitted(true);
                        }}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer text-center mt-1"
                      >
                        Kirim Formulir Pendaftaran
                      </button>
                    </div>
                  ) : (
                    /* Registrasi Sukses Ticket Screen */
                    <div className="p-6 flex flex-col items-center text-center py-8">
                      <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl shadow-inner mb-4">
                        🎉
                      </div>

                      <span className="bg-emerald-100 text-emerald-800 text-[8px] font-black uppercase px-3 py-1 rounded-full tracking-widest">
                        PENDAFTARAN DITERIMA
                      </span>

                      <h4 className="font-sans font-black text-sm text-slate-800 mt-3">Registrasi Anda Berhasil Terkirim!</h4>
                      
                      <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-4 w-full text-left my-4 flex flex-col gap-2.5">
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                          <span>KODE PENDAFTARAN:</span>
                          <span className="text-emerald-700 font-black">TG-DRV-{Math.floor(1000 + Math.random() * 9000)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs font-bold text-slate-700 border-t border-slate-100 pt-2">
                          <span>Nama Calon Driver:</span>
                          <span className="text-slate-900">{driverName}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                          <span>Nomor WhatsApp:</span>
                          <span className="text-slate-900">{driverPhone}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                          <span>Jenis Kendaraan:</span>
                          <span className="text-slate-900">{driverVehicle === 'motorcycle' ? '🏍️ Sepeda Motor' : '🚗 Mobil'}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                          <span>Status Dokumen:</span>
                          <span className="text-emerald-600 font-extrabold">TERUNGGAH</span>
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-500 font-medium leading-relaxed px-2">
                        Halo <strong className="text-slate-700">{driverName}</strong>, data Anda berhasil masuk ke database otonom Tumpang Go. Admin kami akan menghubungi Anda via WhatsApp di nomor <strong className="text-slate-700">{driverPhone}</strong> dalam waktu maksimal 1x24 jam untuk koordinasi verifikasi fisik kendaraan. Matur nuwun! 🙏
                      </p>

                      <button 
                        onClick={() => {
                          setIsDriverModalOpen(false);
                          setDriverRegSubmitted(false);
                          setIsDriverLicUploaded(false);
                          setDriverName('');
                          setDriverPhone('');
                          setDriverPlate('');
                        }}
                        className="w-full bg-slate-800 hover:bg-slate-900 text-white font-extrabold py-3 rounded-xl text-xs transition-colors cursor-pointer text-center mt-5"
                      >
                        Tutup & Kembali ke Portal
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* APK DOWNLOAD / INSTALLER MODAL */}
            {isApkModalOpen && (
              <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-150 animate-in zoom-in-95 duration-200">
                  {/* Android Style Header */}
                  <div className="bg-[#A4C639] text-white p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Smartphone className="w-8 h-8 text-white animate-pulse" />
                      <div>
                        <h4 className="font-sans font-black text-sm uppercase tracking-wider">Tumpang Go APK Installer</h4>
                        <p className="text-[10px] text-white/90">Aplikasi Resmi Paguyuban Otonom</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setIsApkModalOpen(false);
                        setApkDownloadProgress(0);
                        setIsApkDownloaded(false);
                      }}
                      className="p-1.5 rounded-full bg-black/10 hover:bg-black/25 text-white transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-6 flex flex-col items-center text-center">
                    {!isApkDownloaded ? (
                      /* Downloading Screen */
                      <div className="w-full py-4">
                        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center text-2xl shadow-sm mb-4 mx-auto animate-bounce">
                          📥
                        </div>
                        <h5 className="font-sans font-black text-xs text-slate-700 uppercase tracking-wider">Mengunduh File APK...</h5>
                        <p className="text-[10px] text-slate-400 font-semibold mt-1">TumpangGo_v2.4_Official.apk (18.4 MB)</p>
                        
                        {/* Progress Bar */}
                        <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden mt-5 mb-2 border border-slate-200/50">
                          <div 
                            className="bg-gradient-to-r from-[#A4C639] to-emerald-500 h-full transition-all duration-300"
                            style={{ width: `${apkDownloadProgress}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold px-1">
                          <span>Progress: {apkDownloadProgress}%</span>
                          <span>{apkDownloadProgress === 100 ? 'Selesai' : 'Sedang mengunduh...'}</span>
                        </div>
                      </div>
                    ) : (
                      /* Install Screen */
                      <div className="w-full py-3">
                        <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center text-2xl shadow-sm mb-4 mx-auto">
                          🤖
                        </div>
                        <h5 className="font-sans font-black text-sm text-slate-800 uppercase tracking-tight">Unduhan Selesai!</h5>
                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed max-w-xs mt-1.5">
                          File APK resmi Tumpang Go berhasil diunduh ke penyimpanan internal HP Anda. Silakan pasang aplikasi untuk menikmati akses langsung yang lebih cepat.
                        </p>

                        <div className="bg-slate-50 rounded-2xl p-4 my-4 border border-slate-100 flex flex-col gap-2.5 text-left text-xs font-bold text-slate-600">
                          <div className="flex justify-between items-center text-[9px] text-slate-400 font-black uppercase">
                            <span>Informasi File:</span>
                            <span className="text-emerald-700 font-black">AMANKAN BY PLAY PROTECT</span>
                          </div>
                          <div className="flex justify-between items-center pt-1">
                            <span>Nama File:</span>
                            <span className="text-slate-900 font-bold">TumpangGo_v2.4.apk</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Ukuran:</span>
                            <span className="text-slate-900 font-bold">18.4 MB</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Versi OS:</span>
                            <span className="text-slate-900 font-bold">Android 5.0 atau terbaru</span>
                          </div>
                        </div>

                        <div className="flex gap-2.5 mt-5">
                          <button 
                            onClick={() => {
                              setIsApkModalOpen(false);
                              setApkDownloadProgress(0);
                              setIsApkDownloaded(false);
                            }}
                            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl text-xs transition-colors cursor-pointer"
                          >
                            Batal
                          </button>
                          <button 
                            onClick={() => {
                              alert('Aplikasi Tumpang Go berhasil diinstal di smartphone Anda! Silakan cek menu utama HP Anda.');
                              setIsApkModalOpen(false);
                              setApkDownloadProgress(0);
                              setIsApkDownloaded(false);
                            }}
                            className="flex-1 bg-[#A4C639] hover:bg-[#92b232] text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                          >
                            Instal Sekarang
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* HEADQUARTERS MAP MODAL */}
            {isMapModalOpen && (
              <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-150 animate-in zoom-in-95 duration-200">
                  {/* Header */}
                  <div className="bg-slate-900 text-white p-4.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <MapPin className="w-5 h-5 text-red-500 fill-red-500" />
                      <div>
                        <h4 className="font-sans font-black text-xs uppercase tracking-wider">Kantor Pusat Tumpang Go</h4>
                        <p className="text-[9px] text-slate-400">Malang, Jawa Timur, Indonesia</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setIsMapModalOpen(false)}
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Satellite Map Canvas Wrapper */}
                  <div className="p-4 flex flex-col gap-4">
                    <div className="w-full h-52 bg-[#E5E3DF] rounded-2xl relative overflow-hidden shadow-inner border border-slate-200 flex items-center justify-center">
                      
                      {/* Grid Roads simulation using customized SVG styling */}
                      <svg className="absolute inset-0 w-full h-full opacity-60" viewBox="0 0 100 100" preserveAspectRatio="none">
                        {/* Major highway: Jl. Raya Tumpang */}
                        <line x1="10" y1="50" x2="90" y2="50" stroke="#FFF" strokeWidth="4" />
                        <line x1="10" y1="50" x2="90" y2="50" stroke="#E29578" strokeWidth="2" />
                        
                        {/* Crossroads */}
                        <line x1="50" y1="10" x2="50" y2="90" stroke="#FFF" strokeWidth="3" />
                        <line x1="50" y1="10" x2="50" y2="90" stroke="#F4A261" strokeWidth="1.5" />
                        
                        <line x1="25" y1="10" x2="25" y2="90" stroke="#FFF" strokeWidth="2" />
                        <line x1="75" y1="10" x2="75" y2="90" stroke="#FFF" strokeWidth="2" />
                        
                        {/* Alun-alun Central Green Square */}
                        <rect x="42" y="42" width="16" height="16" fill="#A8D5BA" stroke="#2D6A4F" strokeWidth="1" rx="2" />
                        
                        {/* Pasar Tumpang Orange Square */}
                        <rect x="65" y="42" width="12" height="12" fill="#FFE3A8" stroke="#D4A373" strokeWidth="1" rx="1" />
                      </svg>

                      {/* Map Labels */}
                      <span className="absolute text-[8px] font-black text-slate-500 bg-white/80 px-1.5 py-0.5 rounded shadow-sm border border-slate-200/50 top-14 left-12 rotate-[-12deg]">
                        Jl. Raya Tumpang
                      </span>
                      <span className="absolute text-[8px] font-black text-[#2D6A4F] bg-[#E8F5E9]/90 px-1.5 py-0.5 rounded shadow-sm border border-emerald-200/50 top-11 left-46">
                        Alun-alun Tumpang
                      </span>
                      <span className="absolute text-[8px] font-black text-amber-800 bg-[#FFF8E1]/90 px-1.5 py-0.5 rounded shadow-sm border border-amber-200/50 top-11 right-6">
                        Pasar Tumpang
                      </span>

                      {/* Candi Jago Label */}
                      <span className="absolute text-[8px] font-black text-stone-600 bg-stone-100/90 px-1.5 py-0.5 rounded shadow-sm border border-stone-200/50 bottom-8 left-1/3">
                        🗿 Candi Jago
                      </span>

                      {/* Interactive Radar Location Indicator */}
                      <div className="absolute top-[46%] left-[48%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20">
                        {/* Red pulsating indicator ring */}
                        <div className="absolute w-12 h-12 bg-red-500/25 border-2 border-red-500 rounded-full animate-ping"></div>
                        <div className="w-3.5 h-3.5 bg-red-600 border border-white rounded-full shadow-md relative z-10 flex items-center justify-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                        </div>
                        {/* Location Name Tooltip */}
                        <div className="mt-1 bg-slate-900 text-white text-[9px] font-black uppercase py-1 px-2.5 rounded-xl shadow-lg border border-slate-700 whitespace-nowrap animate-bounce flex items-center gap-1">
                          🏢 KANTOR PUSAT TUMPANG GO
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div>
                        <h5 className="font-sans font-black text-xs text-slate-800">Alamat Lengkap:</h5>
                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-1">
                          Jl. Raya Tumpang No. 45, RT 02/RW 03, Krajan, Kec. Tumpang, Kabupaten Malang, Jawa Timur 65156 (Tepat di timur laut Alun-alun Tumpang, depan Kantor Koramil).
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3.5 border-t border-slate-100 pt-3 mt-1">
                        <div>
                          <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">Jam Operasional:</span>
                          <span className="text-[10px] font-bold text-slate-700">08:00 - 21:00 WIB (Setiap Hari)</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">Nomor Telepon Kantor:</span>
                          <span className="text-[10px] font-bold text-slate-700">0341 - 789123</span>
                        </div>
                      </div>

                      <button 
                        onClick={() => {
                          const routeUri = 'https://www.google.com/maps/dir/?api=1&destination=-7.9455,112.7595';
                          alert('Membuka Google Maps untuk rute navigasi ke Kantor Tumpang Go...');
                          window.open(routeUri, '_blank', 'noreferrer,noopener');
                        }}
                        className="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 mt-2 shadow-sm"
                      >
                        <MapPin className="w-4 h-4 text-red-400" />
                        Buka Rute di Google Maps
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
          
        {/* 2. MERCHANT DETAIL TAB */}
        {activeTab === 'merchant-detail' && selectedMerchant && (
          <div className="flex flex-col gap-4 pb-36">
            {/* Back to list */}
            <button 
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 text-sm font-semibold self-start"
            >
              <ArrowLeft className="w-4 h-4" />
              Kembali
            </button>

            {/* Shop Details Card */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="w-full h-32 bg-slate-100 relative">
                <img 
                  src={selectedMerchant.bannerImage || selectedMerchant.image} 
                  alt={selectedMerchant.name} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
                <div className="absolute top-3 right-3">
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md uppercase tracking-wider ${
                    selectedMerchant.active ? 'bg-emerald-500 text-white' : 'bg-slate-600 text-white'
                  }`}>
                    {selectedMerchant.active ? 'Buka' : 'Tutup'}
                  </span>
                </div>
              </div>
              <div className="px-4 pb-4 pt-2 relative">
                {/* Logo overlapping banner */}
                <div className="absolute -top-10 left-4 w-16 h-16 rounded-full border-4 border-white bg-white shadow-md overflow-hidden">
                  <img 
                    src={selectedMerchant.image} 
                    alt="Logo" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                
                <div className="pl-20 pt-1 min-h-[30px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display font-bold text-lg text-slate-800 leading-snug">{selectedMerchant.name}</h3>
                    <span className="bg-rose-50 text-rose-600 font-extrabold text-[9px] px-2 py-0.5 rounded uppercase tracking-wider border border-rose-100 flex items-center gap-0.5">
                      {CULINARY_CATEGORIES.find(c => c.name === getMerchantCategory(selectedMerchant))?.emoji || '🍛'}{' '}
                      {getMerchantCategory(selectedMerchant)}
                    </span>
                  </div>
                  <p className="text-slate-500 text-xs mt-1 leading-relaxed">{selectedMerchant.description}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-y-2 gap-x-4 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4 text-slate-400" />
                    Buka {selectedMerchant.openTime} - {selectedMerchant.closeTime}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                    {selectedMerchant.rating.toFixed(1)} Bintang
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    {selectedMerchant.address}
                  </span>
                </div>
              </div>
            </div>

            {/* Menu Sections */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-display font-bold text-base text-slate-800">Daftar Menu Makanan</h4>
              </div>

              {/* Category selector */}
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all ${
                    selectedCategory === 'all' 
                      ? 'bg-rose-500 text-white shadow-md shadow-rose-500/10' 
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  Semua Menu
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all ${
                      selectedCategory === cat.id 
                        ? 'bg-rose-500 text-white shadow-md shadow-rose-500/10' 
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* Menu List */}
              <div className="flex flex-col gap-3 mt-3">
                {(Array.isArray(selectedMerchantMenu) ? selectedMerchantMenu : [])
                  .filter(item => item && (selectedCategory === 'all' || item.categoryId === selectedCategory))
                  .map(item => (
                    <div 
                      key={item.id}
                      className="bg-white border border-slate-200 hover:border-rose-200 rounded-xl p-3.5 shadow-sm flex gap-3 items-center transition-all"
                    >
                      {item.image && (
                        <img 
                          src={item.image} 
                          alt={item.name} 
                          onClick={() => setSelectedMenuItemDetail({ item, merchant: selectedMerchant })}
                          className="w-16 h-16 rounded-lg object-cover bg-slate-100 flex-shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <div 
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => setSelectedMenuItemDetail({ item, merchant: selectedMerchant })}
                      >
                        <div className="flex items-center gap-1">
                          <h5 className="font-semibold text-slate-800 truncate text-sm hover:text-rose-600 transition-colors">{item.name}</h5>
                          <Info className="w-3.5 h-3.5 text-slate-400 hover:text-rose-500 flex-shrink-0" />
                        </div>
                        <p className="text-slate-500 text-xs line-clamp-1 mt-0.5">{item.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="font-display font-bold text-rose-600 text-xs inline-block">
                            Rp {item.price.toLocaleString('id-ID')}
                          </span>
                          <span className="text-[10px] text-rose-500 font-medium hover:underline flex items-center gap-0.5">
                            Lihat Rincian &rarr;
                          </span>
                        </div>
                        {item.allowInstant === false && (
                          <span className="mt-1 inline-block bg-amber-50 text-amber-800 border border-amber-200 text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase tracking-wider">
                            Khusus Pre-Order
                          </span>
                        )}
                      </div>

                      {/* Quantity Selector or Add Button */}
                      {(() => {
                        const cartItem = cart.find(i => i.menuItemId === item.id);
                        if (cartItem) {
                          return (
                            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                              {/* Decrease button */}
                              <button
                                type="button"
                                onClick={() => updateCartQuantity(item.id, -1)}
                                className="w-7 h-7 rounded-lg hover:bg-rose-50 text-slate-500 hover:text-rose-600 flex items-center justify-center transition-all"
                                title="Kurangi Jumlah"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              
                              <span className="w-6 text-center text-xs font-bold font-mono text-slate-800">
                                {cartItem.quantity}
                              </span>

                              {/* Increase button */}
                              <button
                                type="button"
                                onClick={() => updateCartQuantity(item.id, 1)}
                                className="w-7 h-7 rounded-lg hover:bg-slate-50 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-all"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        }

                        return (
                          <button
                            onClick={() => addToCart(item, selectedMerchant)}
                            disabled={!item.available || !selectedMerchant.active}
                            className={`p-2 rounded-xl border transition-all ${
                              !item.available || !selectedMerchant.active
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-600 shadow-sm'
                            }`}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        );
                      })()}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* 3. CART SUMMARY */}
        {cart.length > 0 && homeSubView === 'food' && activeTab !== 'checkout' && activeTab !== 'payment' && (
          <div className="fixed bottom-[68px] left-4 right-4 max-w-sm mx-auto bg-slate-900 text-white p-3.5 rounded-2xl shadow-xl flex justify-between items-center z-[100] animate-bounce">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <ShoppingBag className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-rose-300 tracking-wider">Keranjang {cartMerchant?.name?.split(' ')[0]}</span>
                <span className="text-xs font-semibold">{cart.length} Item • Rp {getSubtotal().toLocaleString('id-ID')}</span>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('checkout')}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-1 shadow-md shadow-rose-600/15"
            >
              Checkout
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 4. CHECKOUT TAB */}
        {activeTab === 'checkout' && cartMerchant && (
          <form onSubmit={handleCheckout} className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={() => setActiveTab('merchant-detail')}
                className="p-1 hover:bg-slate-200 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h3 className="font-display font-bold text-lg text-slate-800">Konfirmasi Pemesanan</h3>
            </div>

            {/* Merchant Recap */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Toko Tujuan</span>
              <p className="font-semibold text-slate-800 text-sm mt-0.5">{cartMerchant.name}</p>
            </div>

            {/* Daftar Pesanan Anda */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <h4 className="font-display font-semibold text-xs text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
                  <ShoppingBag className="w-3.5 h-3.5 text-rose-500" />
                  Daftar Pesanan Anda
                </h4>
                <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">
                  {cart.length} Menu
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {cart.map((item) => {
                  const minQty = getMenuItemPreOrderMin(item);
                  const isPreOrder = cartMerchant.preOrderOnly || checkoutDeliveryType === 'PREORDER';
                  const isBelowMin = isPreOrder && item.quantity < minQty;

                  return (
                    <div 
                      key={item.menuItemId} 
                      className={`flex gap-3 items-center p-3 rounded-xl border transition-colors ${
                        isBelowMin 
                          ? 'border-rose-200 bg-rose-50/10' 
                          : 'border-slate-100 bg-slate-50/30'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <h5 className="font-semibold text-slate-800 text-xs truncate">{item.name}</h5>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                          Rp {item.price.toLocaleString('id-ID')} / porsi
                        </p>
                        
                        {isPreOrder && minQty > 1 && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ${
                              isBelowMin 
                                ? 'bg-rose-100 text-rose-700 border border-rose-200' 
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            }`}>
                              Min. Order: {minQty}
                            </span>
                            {isBelowMin && (
                              <span className="text-[9px] text-rose-600 font-bold animate-pulse">
                                (Kurang {minQty - item.quantity} porsi)
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Quantity Selector */}
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-sm">
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.menuItemId, -1)}
                            className="w-5 h-5 rounded-md hover:bg-slate-50 text-slate-500 font-bold text-xs flex items-center justify-center transition-colors"
                            title="Kurangi Jumlah"
                          >
                            -
                          </button>
                          <span className="w-6 text-center text-xs font-bold font-mono text-slate-800">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.menuItemId, 1)}
                            className="w-5 h-5 rounded-md hover:bg-slate-50 text-slate-500 font-bold text-xs flex items-center justify-center transition-colors"
                            title="Tambah Jumlah"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* If Merchant supports both Instant and Pre-Order, allow customer selection */}
            {cartMerchant.allowInstantAndPreOrder && (
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm flex flex-col gap-2.5">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Metode Pemesanan</span>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setCheckoutDeliveryType('INSTANT')}
                    className={`py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      checkoutDeliveryType === 'INSTANT'
                        ? 'bg-white text-rose-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>🚀 Kirim Instan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckoutDeliveryType('PREORDER')}
                    className={`py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      checkoutDeliveryType === 'PREORDER'
                        ? 'bg-white text-amber-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>📅 Pre-Order</span>
                  </button>
                </div>
              </div>
            )}

            {/* Pre-order Delivery Date Selector */}
            {(cartMerchant.preOrderOnly || (cartMerchant.allowInstantAndPreOrder && checkoutDeliveryType === 'PREORDER')) && (
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 shadow-sm flex flex-col gap-2.5">
                <div className="flex justify-between items-center border-b border-amber-200/60 pb-2">
                  <h4 className="font-display font-semibold text-xs text-amber-900 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-amber-700" />
                    Tanggal Pengiriman Pre-Order
                  </h4>
                  <span className="text-[9px] bg-amber-200 text-amber-900 font-extrabold px-2 py-0.5 rounded-full uppercase">
                    Wajib H-{cartMerchant.preOrderLeadDays || 1}
                  </span>
                </div>
                
                <p className="text-[10px] text-amber-700 leading-relaxed">
                  Toko ini membutuhkan waktu persiapan minimal <strong>{cartMerchant.preOrderLeadDays || 1} hari</strong>. Silakan pilih tanggal pengiriman Anda di bawah ini:
                </p>

                <div>
                  <input
                    type="date"
                    required
                    value={preOrderDate}
                    onChange={(e) => setPreOrderDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs focus:outline-none focus:border-rose-500 font-bold text-slate-700"
                  />
                </div>
              </div>
            )}

            {/* Customer Inputs */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3.5">
              <h4 className="font-display font-semibold text-sm text-slate-700 border-b border-slate-100 pb-2">Detail Penerima</h4>
              
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={checkoutName}
                  onChange={(e) => setCheckoutName(e.target.value)}
                  placeholder="Masukkan nama Anda"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:outline-none focus:border-rose-500 mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">No WhatsApp (Aktif)</label>
                <input
                  type="tel"
                  required
                  value={checkoutPhone}
                  onChange={(e) => setCheckoutPhone(e.target.value)}
                  placeholder="Contoh: 0812XXXXXXXX"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:outline-none focus:border-rose-500 mt-1"
                />
              </div>
            </div>

            {/* Pin Location on Map */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
              <h4 className="font-display font-semibold text-sm text-slate-700 border-b border-slate-100 pb-2">Tandai Peta Pengantaran</h4>
              <div className="w-full h-[250px] overflow-hidden rounded-xl">
                <MapPicker 
                  initialLat={checkoutLat}
                  initialLng={checkoutLng}
                  onLocationSelected={(lat, lng, address) => {
                    setCheckoutLat(lat);
                    setCheckoutLng(lng);
                    if (address && !checkoutAddress) {
                      setCheckoutAddress(address);
                    }
                  }}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Detail Alamat Lengkap</label>
                <textarea
                  required
                  rows={2}
                  value={checkoutAddress}
                  onChange={(e) => setCheckoutAddress(e.target.value)}
                  placeholder="Nama jalan, nomor rumah, RT/RW, Dusun..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:outline-none focus:border-rose-500 mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Patokan Lokasi (Opsional)</label>
                <input
                  type="text"
                  value={checkoutLandmark}
                  onChange={(e) => setCheckoutLandmark(e.target.value)}
                  placeholder="Contoh: Depan masjid, sebelah konter pulsa"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:outline-none focus:border-rose-500 mt-1"
                />
              </div>
            </div>

            {/* Portions/Items Progress and Validation for Pre-order */}
            {(() => {
              if (!cartMerchant) return null;
              const isPreOrder = cartMerchant.preOrderOnly || checkoutDeliveryType === 'PREORDER';
              if (!isPreOrder) return null;

              const safeCart = Array.isArray(cart) ? cart : [];
              const invalidItems = safeCart.filter(item => {
                if (!item) return false;
                const min = getMenuItemPreOrderMin(item);
                return item.quantity < min;
              });

              const hasInvalidItem = invalidItems.length > 0;
              const merchantMin = Number(cartMerchant.preOrderMinAmount || 0);
              const totalQty = safeCart.reduce((sum, item) => Number(sum) + Number(item?.quantity || 0), 0);
              const isTotalInvalid = totalQty < merchantMin;

              const isBlocked = hasInvalidItem || isTotalInvalid;

              return (
                <div className={`p-4 rounded-xl border flex flex-col gap-2 text-xs transition-all ${
                  !isBlocked 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                    : 'bg-rose-50 border-rose-200 text-rose-800 animate-pulse'
                }`}>
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      <ClipboardList className="w-4 h-4" />
                      Status Batas Minimal Order Pre-Order:
                    </span>
                    <span className="font-mono text-[9px] bg-white/60 px-2 py-0.5 rounded-full border border-slate-200/40">
                      {isBlocked ? '⚠️ BELUM TERPENUHI' : '✓ TERPENUHI'}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5 mt-1">
                    {/* Overall merchant min check */}
                    {merchantMin > 0 && (
                      <div className="flex justify-between items-center text-[11px]">
                        <span>• Total Order Toko (Min. {merchantMin} porsi):</span>
                        <span className={`font-bold ${totalQty >= merchantMin ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {totalQty} / {merchantMin} porsi
                        </span>
                      </div>
                    )}

                    {/* Item-specific checks */}
                    {cart.map(item => {
                      const min = getMenuItemPreOrderMin(item);
                      const satisfies = item.quantity >= min;
                      if (min <= 1) return null; // No custom minimum
                      return (
                        <div key={item.menuItemId} className="flex justify-between items-center text-[11px] pl-3 border-l-2 border-slate-200">
                          <span className="truncate max-w-[180px]">{item.name}:</span>
                          <span className={`font-bold ${satisfies ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {item.quantity} / {min} porsi {satisfies ? '✓' : `(Kurang ${min - item.quantity})`}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[10px] opacity-90 leading-normal border-t border-slate-200/40 pt-1.5 mt-1 font-medium">
                    {!isBlocked 
                      ? '✓ Semua syarat jumlah minimal pesanan terpenuhi! Anda dapat melakukan checkout.' 
                      : '⚠️ Silakan sesuaikan jumlah pesanan Anda agar memenuhi batas minimal sebelum menekan tombol checkout.'}
                  </p>
                </div>
              );
            })()}

            {/* Ringkasan Biaya */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h4 className="font-display font-semibold text-sm text-slate-700 border-b border-slate-100 pb-2 mb-3">Ringkasan Pembayaran</h4>
              <div className="flex flex-col gap-2.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal Makanan</span>
                  <span className="font-semibold">Rp {getSubtotal().toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ongkos Kirim</span>
                  {(() => {
                    const isPreOrder = cartMerchant.preOrderOnly || checkoutDeliveryType === 'PREORDER';
                    if (isPreOrder) {
                      return (
                        <span className="font-extrabold text-amber-600 flex flex-col items-end">
                          <span>Negosiasi (COD)</span>
                          <span className="text-[9px] text-slate-400 font-normal">Hubungi Admin/Seller</span>
                        </span>
                      );
                    }
                    return <span className="font-semibold">Rp {getDeliveryFee().toLocaleString('id-ID')}</span>;
                  })()}
                </div>
                <div className="flex justify-between">
                  <span>Biaya Layanan</span>
                  <span className="font-semibold">Rp {getServiceFee().toLocaleString('id-ID')}</span>
                </div>
                <div className="border-t border-slate-100 pt-2.5 flex justify-between text-sm font-bold text-slate-800">
                  <span>Estimasi Total</span>
                  <span className="text-rose-600 flex flex-col items-end">
                    {(() => {
                      const isPreOrder = cartMerchant.preOrderOnly || checkoutDeliveryType === 'PREORDER';
                      const deliveryVal = isPreOrder ? 0 : getDeliveryFee();
                      const finalTotal = getSubtotal() + deliveryVal + getServiceFee();
                      return (
                        <>
                          <span>Rp {finalTotal.toLocaleString('id-ID')}*</span>
                          {isPreOrder && <span className="text-[9px] text-amber-600 font-medium mt-0.5">(Belum Termasuk Ongkir COD)</span>}
                        </>
                      );
                    })()}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
                *Total akhir akan ditambahkan 3 digit Kode Unik Pembayaran (Rp 1 - Rp 99) pada halaman berikutnya untuk mempermudah verifikasi.
              </p>
            </div>

            {(() => {
              if (!cartMerchant) return null;
              const isPreOrder = cartMerchant.preOrderOnly || checkoutDeliveryType === 'PREORDER';
              
              const safeCart = Array.isArray(cart) ? cart : [];
              const invalidItems = isPreOrder ? safeCart.filter(item => {
                if (!item) return false;
                const min = getMenuItemPreOrderMin(item);
                return item.quantity < min;
              }) : [];

              const hasInvalidItem = invalidItems.length > 0;
              const merchantMin = Number(cartMerchant.preOrderMinAmount || 0);
              const totalQty = safeCart.reduce((sum, item) => Number(sum) + Number(item?.quantity || 0), 0);
              const isTotalInvalid = isPreOrder && totalQty < merchantMin;

              const isBlocked = isPreOrder && (hasInvalidItem || isTotalInvalid);

              return (
                <button
                  type="submit"
                  disabled={isBlocked}
                  className={`w-full py-3 font-bold rounded-xl transition-all text-sm flex items-center justify-center gap-1.5 ${
                    isBlocked
                      ? 'bg-slate-200 text-slate-400 border border-slate-300 shadow-none cursor-not-allowed'
                      : 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/20 cursor-pointer'
                  }`}
                >
                  {isBlocked ? 'Batas Minimal Order Belum Terpenuhi' : 'Proses ke Pembayaran'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              );
            })()}
          </form>
        )}

        {/* 5. PAYMENT / BILLING TAB */}
        {activeTab === 'payment' && activeOrder && (
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <h3 className="font-display font-extrabold text-lg text-slate-800">Pembayaran Pesanan</h3>
              <p className="text-xs text-slate-500 mt-0.5">ID Pesanan: <span className="font-mono font-bold text-slate-700">{activeOrder.id}</span></p>
            </div>

            {/* Payment Method Selector */}
            <div className="bg-slate-200/80 p-1 rounded-2xl flex text-xs font-bold">
              <button
                type="button"
                onClick={() => setPaymentMethodTab('ARTOPAY')}
                className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  paymentMethodTab === 'ARTOPAY'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <QrCode className="w-4 h-4 text-emerald-600" />
                <span>QRIS Dinamis ArtoPay</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full uppercase tracking-wider font-extrabold">Otomatis</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethodTab('MANUAL')}
                className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  paymentMethodTab === 'MANUAL'
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CreditCard className="w-4 h-4 text-slate-500" />
                <span>Transfer Manual</span>
              </button>
            </div>

            {/* TAB 1: ARTOPAY DYNAMIC QRIS */}
            {paymentMethodTab === 'ARTOPAY' && (
              <div className="flex flex-col gap-3.5">
                {/* Total Bill Card */}
                <div className="bg-gradient-to-br from-emerald-50 via-white to-teal-50 border border-emerald-200/80 rounded-2xl p-5 shadow-sm text-center relative overflow-hidden">
                  <span className="text-[10px] text-emerald-800 font-extrabold uppercase tracking-widest block">TOTAL NOMINAL TAGIHAN</span>
                  <h2 className="font-display font-black text-3xl text-emerald-900 mt-1">
                    Rp {activeOrder.total.toLocaleString('id-ID')}
                  </h2>

                  <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-white border border-emerald-200 shadow-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    <span className="text-emerald-700">QRIS Dinamis Otomatis</span>
                  </div>

                  {/* ArtoPay Transaction Status Badge */}
                  <div className="mt-3 pt-3 border-t border-emerald-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Status Pembayaran:</span>
                    <span className={`font-extrabold px-2.5 py-0.5 rounded-lg text-[11px] ${
                      activeOrder.status === OrderStatus.PAYMENT_VERIFIED || activeOrder.artopayStatus === 'SUCCESS'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {activeOrder.status === OrderStatus.PAYMENT_VERIFIED || activeOrder.artopayStatus === 'SUCCESS'
                        ? 'LUNAS (Terverifikasi)'
                        : 'MENUNGGU PEMBAYARAN'}
                    </span>
                  </div>
                </div>

                {/* Status Message Notification */}
                {artopayStatusMsg && (
                  <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                    artopayStatusMsg.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : artopayStatusMsg.type === 'error'
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-blue-50 border-blue-200 text-blue-800'
                  }`}>
                    <Info className="w-4 h-4 flex-shrink-0" />
                    <span>{artopayStatusMsg.text}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2.5">
                  {activeOrder.artopayCheckoutUrl ? (
                    <div className="flex flex-col gap-2">
                      <a
                        href={activeOrder.artopayCheckoutUrl}
                        className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md shadow-emerald-600/20 text-xs flex items-center justify-center gap-2 transition-all cursor-pointer text-center"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>Buka Halaman Pembayaran ArtoPay (Payment Link)</span>
                      </a>
                    </div>
                  ) : activeOrder.artopayPaymentId && activeOrder.artopayClientSecret ? (
                    <button
                      type="button"
                      onClick={() => handleOpenArtopaySdk()}
                      disabled={artopayLoading}
                      className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold rounded-xl shadow-md shadow-emerald-600/20 text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Buka Modal Pembayaran ArtoPay (QRIS)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCreateArtoPayPayment}
                      disabled={artopayLoading}
                      className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold rounded-xl shadow-md shadow-emerald-600/20 text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      {artopayLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Menyiapkan Sesi Pembayaran ArtoPay...</span>
                        </>
                      ) : (
                        <>
                          <QrCode className="w-4 h-4" />
                          <span>Bayar Sekarang via ArtoPay (QRIS)</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCheckArtoPayStatus}
                    disabled={artopayChecking}
                    className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${artopayChecking ? 'animate-spin' : ''}`} />
                    <span>{artopayChecking ? 'Memeriksa ke Gateway ArtoPay...' : 'Cek Status Pembayaran (Sinkronkan)'}</span>
                  </button>
                </div>

                {/* Explanation Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 leading-relaxed flex flex-col gap-1">
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Verifikasi Otomatis Tanpa Upload Bukti:
                  </span>
                  <span>1. Klik tombol di atas untuk membuka QRIS dinamis resmi ArtoPay.</span>
                  <span>2. Scan menggunakan aplikasi m-Banking atau e-Wallet apa pun.</span>
                  <span>3. Pesanan Anda akan otomatis lunas dalam hitungan detik setelah pembayaran berhasil.</span>
                </div>
              </div>
            )}

            {/* TAB 2: MANUAL TRANSFER (FALLBACK) */}
            {paymentMethodTab === 'MANUAL' && (
              <div className="flex flex-col gap-3.5">
                <div className="bg-amber-50 border border-amber-100 text-amber-800 p-3.5 rounded-xl text-xs flex flex-col gap-1">
                  <span className="font-bold">⚠️ Panduan Transfer Manual</span>
                  <span>Lakukan transfer pas sesuai nominal hingga tiga digit terakhir. Batas waktu transfer adalah 10 menit.</span>
                </div>

                {/* Invoice Bill Card */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col items-center">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">TOTAL TRANSFER MANUAL</span>
                  <h2 className="font-display font-extrabold text-2xl text-slate-800 mt-1">
                    Rp {activeOrder.total.toLocaleString('id-ID')}
                  </h2>
                  
                  <div className="mt-2 bg-rose-50 text-rose-700 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    <span>Termasuk Kode Unik: </span>
                    <span className="bg-rose-600 text-white px-1.5 py-0.5 rounded text-[10px]">+{activeOrder.uniqueCode}</span>
                  </div>

                  {/* QRIS Code Image */}
                  <div className="w-56 h-56 bg-slate-50 border-2 border-slate-100 rounded-xl overflow-hidden mt-6 flex flex-col items-center justify-center relative p-3">
                    <img 
                      src={systemConfig?.qrisImage || 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=400&auto=format&fit=crop&q=60'} 
                      alt="QRIS Statis" 
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 text-center mt-3 font-semibold tracking-wide uppercase">QRIS REKENING MANUAL TUMPANG</p>
                </div>

                {/* Upload Proof */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <h4 className="font-display font-semibold text-sm text-slate-800 border-b border-slate-100 pb-2.5">Unggah Bukti Pembayaran Manual</h4>
                  
                  <form onSubmit={handlePaymentProofUpload} className="flex flex-col gap-3.5 mt-4">
                    <div>
                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Pilih Foto Bukti</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Atau Tautan Gambar (Url)</label>
                      <input
                        type="text"
                        value={paymentProofUrl}
                        onChange={(e) => {
                          setPaymentProofUrl(e.target.value);
                          setPaymentProofFile(null);
                        }}
                        placeholder="https://example.com/bukti.jpg"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-500"
                      />
                    </div>

                    {(paymentProofFile || paymentProofUrl) && (
                      <div className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden mt-2 relative">
                        <img 
                          src={paymentProofFile || paymentProofUrl} 
                          alt="Preview Bukti" 
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={uploadLoading || (!paymentProofFile && !paymentProofUrl)}
                      className={`w-full py-2.5 font-bold rounded-xl transition-all shadow-md text-xs flex items-center justify-center gap-1.5 ${
                        uploadLoading || (!paymentProofFile && !paymentProofUrl)
                          ? 'bg-slate-200 text-slate-400 border-slate-300 shadow-none cursor-not-allowed'
                          : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/10 cursor-pointer'
                      }`}
                    >
                      {uploadLoading ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          Mengirim Bukti...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          Kirim Bukti Pembayaran Manual
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            )}


            {/* Check Tracking */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setTrackingOrderId(activeOrder.id);
                  setActiveTab('tracking');
                }}
                className="flex-1 py-3 bg-slate-900 text-white hover:bg-slate-800 font-semibold rounded-xl transition-all text-xs text-center"
              >
                Pantau Status Pesanan
              </button>
            </div>
          </div>
        )}

        {/* 6. TRACKING PESANAN TAB */}
        {activeTab === 'tracking' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setActiveTab('home')}
                className="p-1 hover:bg-slate-200 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h3 className="font-display font-bold text-lg text-slate-800">Detail & Pelacakan Pesanan</h3>
            </div>

            {/* Manual Refresh / Tracker input if no active order */}
            {!activeOrder ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-3">
                <p className="text-slate-500 text-xs leading-relaxed">Masukkan ID Pesanan Anda untuk memantau status secara langsung.</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={trackingOrderId}
                    onChange={(e) => setTrackingOrderId(e.target.value)}
                    placeholder="ord_xxxxx"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none"
                  />
                  <button
                    onClick={refreshActiveOrder}
                    className="px-4 py-2 bg-rose-600 text-white font-bold rounded-xl text-xs"
                  >
                    Lacak
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Active Info Header */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">ID PESANAN</span>
                      <span className="font-mono text-sm font-bold text-slate-800 mt-0.5">{activeOrder.id}</span>
                    </div>
                    <button
                      onClick={refreshActiveOrder}
                      className="p-1.5 hover:bg-slate-100 text-slate-500 rounded-lg transition-colors border border-slate-200 shadow-sm"
                      title="Perbarui Status"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Order Core Info */}
                  <div className="grid grid-cols-2 gap-3 mt-3.5 text-xs text-slate-600">
                    <div>
                      <span className="text-slate-400 font-medium">Toko Kuliner:</span>
                      <p className="font-semibold text-slate-800 mt-0.5">{activeOrder.merchantName}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium">Penerima:</span>
                      <p className="font-semibold text-slate-800 mt-0.5">{activeOrder.customerName}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium">No WhatsApp:</span>
                      <p className="font-semibold text-slate-800 mt-0.5">{activeOrder.customerPhone}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium">Driver:</span>
                      <p className="font-semibold text-emerald-600 mt-0.5">{activeOrder.driverName || 'Menunggu penugasan...'}</p>
                    </div>
                    
                    {activeOrder.preOrderDate && (
                      <div className="col-span-2 bg-amber-50 border border-amber-200/60 p-2.5 rounded-xl text-amber-900 mt-1">
                        <span className="font-bold flex items-center gap-1 text-[10px] text-amber-800 uppercase tracking-wide">
                          📅 Tanggal Pengantaran Pre-Order
                        </span>
                        <p className="font-extrabold text-sm mt-0.5">{new Date(activeOrder.preOrderDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tracking Progress Steps */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <h4 className="font-display font-semibold text-sm text-slate-800 border-b border-slate-100 pb-2.5 mb-4">Status Pengantaran</h4>
                  
                  <div className="flex flex-col gap-5 relative pl-4 border-l border-slate-200">
                    
                    {/* Step 1: Menunggu pembayaran */}
                    <div className="relative">
                      <div className={`absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full ring-4 ${
                        activeOrder.status === OrderStatus.WAITING_PAYMENT 
                          ? 'bg-rose-500 ring-rose-100 animate-ping' 
                          : 'bg-emerald-500 ring-emerald-100'
                      }`} />
                      <span className="text-xs font-bold text-slate-800">Pesanan Dibuat</span>
                      <p className="text-[11px] text-slate-500 mt-0.5">Pesanan berhasil dicatat dengan kode unik.</p>
                    </div>

                    {/* Step 2: Menunggu verifikasi */}
                    <div className="relative">
                      <div className={`absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full ring-4 ${
                        [OrderStatus.WAITING_PAYMENT].includes(activeOrder.status) 
                          ? 'bg-slate-200 ring-slate-100' 
                          : activeOrder.status === OrderStatus.WAITING_PAYMENT_VERIFICATION 
                            ? 'bg-rose-500 ring-rose-100' 
                            : 'bg-emerald-500 ring-emerald-100'
                      }`} />
                      <span className="text-xs font-bold text-slate-800">Verifikasi Pembayaran</span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {activeOrder.status === OrderStatus.WAITING_PAYMENT 
                          ? 'Menunggu unggahan bukti transfer.' 
                          : activeOrder.status === OrderStatus.WAITING_PAYMENT_VERIFICATION 
                            ? 'Admin sedang memverifikasi bukti pembayaran.' 
                            : 'Pembayaran telah dikonfirmasi oleh Admin.'}
                      </p>
                    </div>

                    {/* Step 3: Memasak */}
                    <div className="relative">
                      <div className={`absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full ring-4 ${
                        [OrderStatus.WAITING_PAYMENT, OrderStatus.WAITING_PAYMENT_VERIFICATION, OrderStatus.PAYMENT_REJECTED].includes(activeOrder.status) 
                          ? 'bg-slate-200 ring-slate-100' 
                          : activeOrder.status === OrderStatus.COOKING 
                            ? 'bg-rose-500 ring-rose-100' 
                            : [OrderStatus.PAYMENT_VERIFIED].includes(activeOrder.status)
                              ? 'bg-amber-500 ring-amber-100'
                              : 'bg-emerald-500 ring-emerald-100'
                      }`} />
                      <span className="text-xs font-bold text-slate-800">Diproses Toko</span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {activeOrder.status === OrderStatus.COOKING 
                          ? `Toko sedang memasak. Estimasi waktu: ${activeOrder.cookingTimeMinutes || 30} menit.` 
                          : [OrderStatus.PAYMENT_VERIFIED].includes(activeOrder.status)
                            ? 'Pesanan diteruskan ke toko, menunggu respon...'
                            : [OrderStatus.WAITING_PAYMENT, OrderStatus.WAITING_PAYMENT_VERIFICATION].includes(activeOrder.status)
                              ? 'Menunggu pembayaran selesai.'
                              : 'Toko telah menyelesaikan proses memasak.'}
                      </p>
                    </div>

                    {/* Step 4: Menuju lokasi */}
                    <div className="relative">
                      <div className={`absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full ring-4 ${
                        [OrderStatus.READY_FOR_PICKUP, OrderStatus.ORDER_PICKED_UP].includes(activeOrder.status)
                          ? 'bg-rose-500 ring-rose-100'
                          : [OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(activeOrder.status)
                            ? 'bg-emerald-500 ring-emerald-100'
                            : 'bg-slate-200 ring-slate-100'
                      }`} />
                      <span className="text-xs font-bold text-slate-800">Pengantaran oleh Kurir</span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {activeOrder.status === OrderStatus.READY_FOR_PICKUP 
                          ? 'Pesanan siap dijemput. Kurir menuju toko.' 
                          : activeOrder.status === OrderStatus.ORDER_PICKED_UP 
                            ? `Kurir (${activeOrder.driverName || 'Kurir'}) sedang membawa makanan ke lokasi Anda.` 
                            : [OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(activeOrder.status)
                              ? 'Makanan telah diambil dan diantar oleh kurir.'
                              : 'Menunggu proses memasak selesai.'}
                      </p>
                    </div>

                    {/* Step 5: Sampai */}
                    <div className="relative">
                      <div className={`absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full ring-4 ${
                        [OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(activeOrder.status)
                          ? 'bg-emerald-500 ring-emerald-100'
                          : 'bg-slate-200 ring-slate-100'
                      }`} />
                      <span className="text-xs font-bold text-slate-800">Pesanan Selesai (Sudah Terkirim)</span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {[OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(activeOrder.status)
                          ? 'Terima kasih, pesanan telah selesai secara otomatis setelah driver mengirimkan bukti pengantaran!' 
                          : 'Menunggu pengantaran kurir.'}
                      </p>
                    </div>
                  </div>

                  {/* Terminal / Cancel / Rejections states */}
                  {activeOrder.status === OrderStatus.PAYMENT_REJECTED && (
                    <div className="mt-5 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-800">
                      <span className="font-bold">❌ Pembayaran Ditolak</span>
                      <p className="mt-0.5">Alasan: {activeOrder.cancelReason || 'Bukti transfer tidak sesuai nominal.'}</p>
                      <button 
                        onClick={() => setActiveTab('payment')} 
                        className="mt-2 text-rose-600 font-bold hover:underline"
                      >
                        Kirim Ulang Bukti Pembayaran
                      </button>
                    </div>
                  )}

                  {activeOrder.status === OrderStatus.CANCELLED && (
                    <div className="mt-5 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-800">
                      <span className="font-bold">❌ Pesanan Dibatalkan</span>
                      <p className="mt-0.5">Alasan: {activeOrder.cancelReason || 'Dibatalkan oleh sistem atau toko.'}</p>
                    </div>
                  )}
                </div>
                
                {/* Back to Home */}
                <button
                  onClick={() => {
                    setActiveOrder(null);
                    setTrackingOrderId('');
                    setActiveTab('home');
                  }}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl text-xs text-center transition-colors"
                >
                  Kembali Belanja
                </button>
              </div>
            )}
          </div>
        )}

        {/* 7. HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setActiveTab('home')}
                className="p-1 hover:bg-slate-200 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h3 className="font-display font-bold text-lg text-slate-800">Riwayat Pembelian</h3>
            </div>

            {/* Search History Form */}
            <form onSubmit={searchHistory} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-3">
              <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">CARI BERDASARKAN NO WHATSAPP</span>
              <div className="flex gap-2">
                <input
                  type="tel"
                  required
                  value={historyPhone}
                  onChange={(e) => setHistoryPhone(e.target.value)}
                  placeholder="Masukkan nomor WhatsApp saat checkout"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500"
                />
                <button
                  type="submit"
                  disabled={historyLoading}
                  className="px-5 py-3 bg-rose-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 hover:bg-rose-700 shadow-md shadow-rose-600/10"
                >
                  {historyLoading ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    'Cari'
                  )}
                </button>
              </div>
            </form>

            {/* History Results */}
            {historySearched && (
              <div className="flex flex-col gap-3 mt-2">
                <h4 className="font-display font-semibold text-sm text-slate-700">Ditemukan ({historyOrders.length}) Pesanan</h4>
                
                {historyOrders.length === 0 ? (
                  <div className="text-center py-8 bg-white border border-slate-200 rounded-xl">
                    <ClipboardList className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-slate-400 text-xs mt-2">Belum ada riwayat pesanan untuk nomor ini.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {historyOrders.map(o => (
                      <div 
                        key={o.id}
                        onClick={() => {
                          setActiveOrder(o);
                          setTrackingOrderId(o.id);
                          setActiveTab('tracking');
                        }}
                        className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col gap-2"
                      >
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-mono font-bold text-slate-500">{o.id}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            o.status === OrderStatus.COMPLETED 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : o.status === OrderStatus.CANCELLED || o.status === OrderStatus.EXPIRED
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                          }`}>
                            {o.status}
                          </span>
                        </div>

                        <div className="flex justify-between items-end mt-1">
                          <div className="flex flex-col">
                            <h5 className="font-semibold text-slate-800 text-sm leading-snug">{o.merchantName}</h5>
                            <span className="text-[10px] text-slate-400 mt-0.5">{new Date(o.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          </div>
                          <span className="font-display font-bold text-rose-600 text-xs">
                            Rp {o.total.toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 8. PARTNER REGISTER TAB */}
        {activeTab === 'partner-register' && (
          <div className="flex flex-col gap-5 pb-6">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setActiveTab('home')}
                className="p-1 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5 text-slate-700" />
              </button>
              <h3 className="font-display font-extrabold text-lg text-slate-800 tracking-tight">Kemitraan Tumpang Food</h3>
            </div>

            {checkingRegistration ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-xl flex flex-col items-center justify-center gap-3 animate-pulse">
                <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-slate-500 text-xs font-semibold">Memeriksa status kemitraan Anda...</span>
              </div>
            ) : activeRegistration ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl flex flex-col gap-5 animate-fade-in">
                {/* Header Status */}
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Status Pengajuan</span>
                    <h4 className="font-display font-extrabold text-base text-slate-800">{activeRegistration.storeName || activeRegistration.name}</h4>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold shadow-sm ${
                    activeRegistration.status === 'APPROVED' || activeRegistration.status === 'ACTIVATED'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      : activeRegistration.status === 'REJECTED'
                        ? 'bg-red-50 text-red-700 border border-red-100'
                        : 'bg-amber-50 text-amber-700 border border-amber-100 animate-pulse'
                  }`}>
                    {activeRegistration.status === 'APPROVED' || activeRegistration.status === 'ACTIVATED'
                      ? '✓ DISETUJUI'
                      : activeRegistration.status === 'REJECTED'
                        ? '✗ DITOLAK'
                        : '⏳ MENUNGGU VERIFIKASI'}
                  </span>
                </div>

                {/* Status-specific body */}
                {(activeRegistration.status === 'APPROVED' || activeRegistration.status === 'ACTIVATED') ? (
                  <div className="flex flex-col gap-4 text-center items-center py-2 animate-fade-in">
                    <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm animate-bounce">
                      <CheckCircle2 className="w-9 h-9" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <h3 className="font-display font-extrabold text-lg text-slate-800">🎉 Selamat! Pendaftaran Berhasil!</h3>
                      <p className="text-slate-500 text-xs leading-relaxed max-w-sm">
                        Akun mitra kuliner Anda telah resmi aktif di platform Tumpang Food. Gunakan data berikut untuk mengelola toko Anda.
                      </p>
                    </div>

                    {/* Access Credentials Card */}
                    <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left flex flex-col gap-3">
                      <div className="border-b border-slate-200/60 pb-2 flex justify-between items-center">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">KREDENSIAL AKSES PORTAL</span>
                        <span className="bg-rose-50 text-rose-700 text-[9px] font-bold px-2 py-0.5 rounded-full border border-rose-100">Aktif</span>
                      </div>
                      <div className="flex flex-col gap-2.5 text-xs text-slate-600">
                        <div className="flex justify-between items-center">
                          <span>Email Terdaftar</span>
                          <span className="font-bold text-slate-800 font-mono">{activeRegistration.email}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Kata Sandi (Password)</span>
                          <span className="font-bold text-slate-800 font-mono bg-amber-100 px-2 py-0.5 rounded border border-amber-200 select-all">{activeRegistration.password || 'TF-1234'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Direct Login Button */}
                    <button
                      onClick={() => {
                        // Redirect to portal login screen with roles
                        window.location.href = `/?role=merchant&id=${activeRegistration.storeId || ''}`;
                      }}
                      className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-rose-600/20 text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      Akses Portal Merchant Sekarang
                    </button>
                  </div>
                ) : activeRegistration.status === 'REJECTED' ? (
                  <div className="flex flex-col gap-4 text-center items-center py-2">
                    <div className="w-16 h-16 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center text-red-600 shadow-sm">
                      <XCircle className="w-9 h-9" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <h3 className="font-display font-extrabold text-base text-slate-800">Pengajuan Belum Disetujui</h3>
                      <p className="text-slate-500 text-xs leading-relaxed max-w-sm">
                        Mohon maaf, pengajuan kemitraan Anda saat ini belum dapat disetujui oleh tim peninjau Tumpang Food.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 py-2">
                    {/* Pending State */}
                    <div className="flex items-center gap-3 bg-amber-50 border border-amber-100/80 rounded-xl p-3 text-xs text-amber-800">
                      <span className="text-base">⏳</span>
                      <span className="font-medium">Data pendaftaran Anda sedang dalam peninjauan verifikasi oleh Administrator.</span>
                    </div>

                    {/* Step-by-Step Status Flow */}
                    <div className="flex flex-col gap-3.5 mt-2 pl-2">
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold">✓</span>
                          <div className="w-0.5 h-6 bg-slate-200"></div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-800">Data Pendaftaran Terkirim</span>
                          <span className="text-[10px] text-slate-400">Berkas profil & kontrak Anda berhasil disimpan</span>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold animate-pulse">2</span>
                          <div className="w-0.5 h-6 bg-slate-200"></div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-800">Verifikasi Dokumen & Kontrak</span>
                          <span className="text-[10px] text-slate-400">Tim Admin sedang meninjau kelengkapan berkas fisik & KTP Anda</span>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-[10px] font-bold">3</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-400">Aktivasi Akun Portal</span>
                          <span className="text-[10px] text-slate-400">Sandi akses akan otomatis dirilis di halaman ini</span>
                        </div>
                      </div>
                    </div>

                    {/* Admin Contact info */}
                    <div className="text-center mt-3 py-3 border-t border-slate-100">
                      <p className="text-[11px] text-slate-500">
                        Butuh bantuan atau ingin proses lebih cepat? Hubungi Admin WhatsApp:
                      </p>
                      <a 
                        href="https://wa.me/628123456789" 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 mt-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-1.5 rounded-full text-[11px] border border-emerald-100 transition-colors"
                      >
                        <span>🟢 Hubungi Admin (WhatsApp)</span>
                      </a>
                    </div>
                  </div>
                )}

                {/* Reset button to clear local storage */}
                <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-2.5">
                  <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                    💡 <strong>Catatan:</strong> Pendaftaran <span className="font-semibold">{activeRegistration.storeName || activeRegistration.name}</span> yang sudah dikirim <strong>tidak akan terhapus dari sistem</strong>. Tombol di bawah hanya untuk mengosongkan halaman ini agar Anda atau merchant lain dapat mengisi pendaftaran baru.
                  </p>
                  <button
                    type="button"
                    onClick={resetPartnerForm}
                    className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 border border-slate-200 cursor-pointer shadow-sm hover:scale-[1.01] active:scale-[0.99]"
                  >
                    ➕ Mendaftar Merchant / Outlet Baru
                  </button>
                </div>
              </div>
            ) : partnerSubmitSuccess ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-6 text-center shadow-xl flex flex-col items-center gap-4 animate-fade-in">
                <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm animate-bounce">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <h4 className="font-display font-bold text-base text-slate-800">Pendaftaran Berhasil Dikirim!</h4>
                <p className="text-slate-500 text-xs leading-relaxed max-w-xs">
                  Terima kasih telah mendaftar. Data Anda telah disimpan dalam sistem kami. Hubungi Administrator di WhatsApp <span className="font-semibold text-rose-600">sawahjayagroup@gmail.com</span> untuk verifikasi & aktivasi instan akun Anda.
                </p>
                <button
                  onClick={resetPartnerForm}
                  className="mt-2 w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Kirim Pendaftaran Lain
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Info Cards / Benefits */}
                <div className="bg-gradient-to-br from-rose-600 to-emerald-700 text-white rounded-2xl p-5 shadow-lg flex flex-col gap-1.5 relative overflow-hidden">
                  <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
                  <h4 className="font-display font-bold text-sm">Pendaftaran Kemitraan tumpangGo</h4>
                  <p className="text-[11px] text-rose-100 leading-relaxed">
                    tumpangGo membantu UMKM lokal dan mitra pengantar (kurir) menjangkau ribuan pelanggan di Tumpang & sekitarnya dengan sistem kemitraan yang praktis.
                  </p>
                </div>

                {/* Tipe Kemitraan Switcher */}
                <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200/50">
                  <button
                    type="button"
                    onClick={() => {
                      setPartnerType('MERCHANT');
                      setPartnerStep(1);
                    }}
                    className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      partnerType === 'MERCHANT'
                        ? 'bg-rose-500 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <span>🍲 Mitra Toko / Merchant</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPartnerType('DRIVER');
                      setPartnerStep(1);
                    }}
                    className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      partnerType === 'DRIVER'
                        ? 'bg-rose-500 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <span>🏍️ Mitra Kurir / Driver</span>
                  </button>
                </div>

                 {/* Progress Tracker */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between text-[11px] font-bold">
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${partnerStep >= 1 ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-400'}`}>1</span>
                      <span className={partnerStep === 1 ? 'text-rose-600' : 'text-slate-500'}>Profil & Dokumen</span>
                    </div>
                    <div className="h-px bg-slate-200 flex-1 mx-3"></div>
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${partnerStep >= 2 ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-400'}`}>2</span>
                      <span className={partnerStep === 2 ? 'text-rose-600' : 'text-slate-500'}>Tanda Tangan Kontrak</span>
                    </div>
                    <div className="h-px bg-slate-200 flex-1 mx-3"></div>
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${partnerStep >= 3 ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-400'}`}>3</span>
                      <span className={partnerStep === 3 ? 'text-rose-600' : 'text-slate-500'}>Kirim</span>
                    </div>
                  </div>

                 {/* Registration Form */}
                 <form onSubmit={(e) => {
                   e.preventDefault();
                   if (partnerStep < 3) {
                     if (partnerStep === 1) {
                       if (partnerType === 'MERCHANT') {
                         if (!partnerName || !partnerPhone || !partnerEmail || !partnerStoreName || !partnerStoreAddress) {
                           alert('Mohon lengkapi profil dan alamat toko Anda.');
                           return;
                         }
                         if (!businessPhoto || !idPhoto) {
                           alert('Mohon unggah Foto Tempat Usaha dan Foto KTP Anda sebelum melanjutkan.');
                           return;
                         }
                       } else {
                         if (!partnerName || !partnerPhone || !partnerVehicle || !partnerArea) {
                           alert('Mohon lengkapi profil, nomor plat kendaraan, dan wilayah operasional Anda.');
                           return;
                         }
                         if (!businessPhoto || !idPhoto) {
                           alert('Mohon unggah Foto Kendaraan dan Foto KTP/SIM Anda sebelum melanjutkan.');
                           return;
                         }
                       }
                       setPartnerStep(2);
                     } else if (partnerStep === 2) {
                       if (!contractPhoto) {
                         alert('Mohon unduh draf kontrak, cetak, beri Materai Rp10.000 fisik, tanda tangani secara basah, lalu foto/scan dan unggah kembali berkas tersebut.');
                         return;
                       }
                       setPartnerStep(3);
                     }
                   } else {
                     handlePartnerRegister(e);
                   }
                 }} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4">

                  {/* STEP 1: Profil & Alamat */}
                  {partnerStep === 1 && (
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          {partnerType === 'MERCHANT' ? 'Nama Lengkap Pemilik' : 'Nama Lengkap Driver'}
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Masukkan nama lengkap Anda sesuai KTP"
                          value={partnerName}
                          onChange={(e) => setPartnerName(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500 focus:bg-white transition-colors"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className={partnerType === 'MERCHANT' ? 'flex flex-col gap-1' : 'col-span-2 flex flex-col gap-1'}>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nomor WhatsApp</label>
                          <input
                            type="tel"
                            required
                            placeholder="Contoh: 081234567890"
                            value={partnerPhone}
                            onChange={(e) => setPartnerPhone(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500 focus:bg-white transition-colors"
                          />
                        </div>
                        {partnerType === 'MERCHANT' && (
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Alamat Email Akses</label>
                            <input
                              type="email"
                              required
                              placeholder="Contoh: merchant@gmail.com"
                              value={partnerEmail}
                              onChange={(e) => setPartnerEmail(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500 focus:bg-white transition-colors"
                            />
                          </div>
                        )}
                      </div>

                      {partnerType === 'MERCHANT' ? (
                        <>
                          <div className="flex flex-col gap-1 border-t border-slate-100 pt-3">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nama Toko / UMKM Kuliner</label>
                            <input
                              type="text"
                              required
                              placeholder="Contoh: Warung Soto Mak Nyus Tumpang"
                              value={partnerStoreName}
                              onChange={(e) => setPartnerStoreName(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500 focus:bg-white transition-colors"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kategori Menu Kuliner</label>
                            <select
                              value={partnerCategory}
                              onChange={(e) => setPartnerCategory(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500 focus:bg-white transition-colors cursor-pointer"
                            >
                              <option value="Bakso & Mie">🍜 Bakso & Mie</option>
                              <option value="Nasi & Lauk">🍛 Nasi & Lauk</option>
                              <option value="Sate & Bakaran">🍢 Sate & Bakaran</option>
                              <option value="Cemilan & Jajanan">🍘 Cemilan & Jajanan</option>
                              <option value="Minuman Segar">🥤 Minuman Segar</option>
                              <option value="Lainnya">🍽️ Kuliner Lainnya</option>
                            </select>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Alamat Lengkap Toko</label>
                            <textarea
                              required
                              placeholder="Sebutkan alamat lengkap, jalan, RT/RW, kelurahan di Kecamatan Tumpang"
                              rows={2}
                              value={partnerStoreAddress}
                              onChange={(e) => setPartnerStoreAddress(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500 focus:bg-white transition-colors"
                            ></textarea>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex flex-col gap-1 border-t border-slate-100 pt-3">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nomor Plat / Seri Kendaraan</label>
                            <input
                              type="text"
                              required
                              placeholder="Contoh: N 1234 XX (Motor / Mobil)"
                              value={partnerVehicle}
                              onChange={(e) => setPartnerVehicle(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500 focus:bg-white transition-colors"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Wilayah Operasional Utama</label>
                            <select
                              value={partnerArea}
                              onChange={(e) => setPartnerArea(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500 focus:bg-white transition-colors cursor-pointer"
                            >
                              <option value="">-- Pilih Wilayah Operasional --</option>
                              <option value="Tumpang Kota">📍 Tumpang Kota</option>
                              <option value="Desa Jeru">📍 Desa Jeru</option>
                              <option value="Desa Pulungdowo">📍 Desa Pulungdowo</option>
                              <option value="Desa Slamet">📍 Desa Slamet</option>
                              <option value="Desa Wringinsongo">📍 Desa Wringinsongo</option>
                              <option value="Desa Kidal">📍 Desa Kidal</option>
                              <option value="Desa Ngingit">📍 Desa Ngingit</option>
                              <option value="Desa Duwet">📍 Desa Duwet</option>
                              <option value="Desa Pandanajeng">📍 Desa Pandanajeng</option>
                              <option value="Desa Malangsuko">📍 Desa Malangsuko</option>
                              <option value="Desa Bokor">📍 Desa Bokor</option>
                            </select>
                          </div>
                        </>
                      )}

                      {/* Coordinate/Location Picker */}
                      <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          {partnerType === 'MERCHANT' ? 'Koordinat Tempat Usaha (Untuk Kurir)' : 'Koordinat Rumah / Titik Mangkal Base'}
                        </label>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-col">
                            <span className="text-[9px] font-semibold text-slate-400">Latitude</span>
                            <input 
                              type="number" 
                              step="0.000001" 
                              value={partnerLat} 
                              onChange={(e) => setPartnerLat(parseFloat(e.target.value) || -7.9482)}
                              className="bg-transparent border-none outline-none p-0 text-xs font-bold font-mono mt-0.5" 
                            />
                          </div>
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-col">
                            <span className="text-[9px] font-semibold text-slate-400">Longitude</span>
                            <input 
                              type="number" 
                              step="0.000001" 
                              value={partnerLng} 
                              onChange={(e) => setPartnerLng(parseFloat(e.target.value) || 112.7612)}
                              className="bg-transparent border-none outline-none p-0 text-xs font-bold font-mono mt-0.5" 
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.geolocation.getCurrentPosition(
                              (pos) => {
                                setPartnerLat(pos.coords.latitude);
                                setPartnerLng(pos.coords.longitude);
                                alert('Lokasi berhasil dideteksi!');
                              },
                              () => {
                                // Use default random coordinates in Tumpang area to simulate success
                                setPartnerLat(-7.9482 + (Math.random() - 0.5) * 0.01);
                                setPartnerLng(112.7612 + (Math.random() - 0.5) * 0.01);
                                alert('Gagal mendeteksi koordinat otomatis. Kami menggunakan koordinat titik pusat Kecamatan Tumpang.');
                              }
                            );
                          }}
                          className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-[10px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        >
                          📍 Gunakan Lokasi Saya Sekarang
                        </button>
                      </div>

                      {/* Image Attachments Uploaders */}
                      <div className="border-t border-slate-100 pt-3 flex flex-col gap-3">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Unggah Dokumen Pendukung</span>
                        
                        {/* Business Photo */}
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[10px] text-slate-600 font-bold">
                            {partnerType === 'MERCHANT' ? '1. Foto Tempat Usaha / Outlet UMKM' : '1. Foto Kendaraan Bersama Plat Nomor'}
                          </span>
                          <div className="flex items-center gap-3">
                            <label className="flex-1 border-2 border-dashed border-slate-200 hover:border-rose-400 bg-slate-50 rounded-xl p-4 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors text-center">
                              <input 
                                type="file" 
                                accept="image/*" 
                                onChange={(e) => handlePartnerFileChange(e, setBusinessPhoto)} 
                                className="hidden" 
                              />
                              <Store className="w-5 h-5 text-slate-400" />
                              <span className="text-[10px] font-bold text-slate-700">
                                {partnerType === 'MERCHANT' ? 'Pilih Foto Tempat Usaha' : 'Pilih Foto Kendaraan'}
                              </span>
                              <span className="text-[8px] text-slate-400">Format JPG, PNG (Max 5MB)</span>
                            </label>
                            {businessPhoto && (
                              <div className="w-16 h-16 rounded-xl border border-slate-200 overflow-hidden relative group">
                                <img src={businessPhoto} alt="Foto Pendukung" className="w-full h-full object-cover" />
                                <button 
                                  type="button" 
                                  onClick={() => setBusinessPhoto('')} 
                                  className="absolute inset-0 bg-red-600/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold cursor-pointer"
                                >
                                  Hapus
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ID Card Photo */}
                        <div className="flex flex-col gap-1.5 mt-1">
                          <span className="text-[10px] text-slate-600 font-bold">
                            {partnerType === 'MERCHANT' ? '2. Foto KTP / Kartu Identitas' : '2. Foto KTP / SIM Mitra Kurir'}
                          </span>
                          <div className="flex items-center gap-3">
                            <label className="flex-1 border-2 border-dashed border-slate-200 hover:border-rose-400 bg-slate-50 rounded-xl p-4 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors text-center">
                              <input 
                                type="file" 
                                accept="image/*" 
                                onChange={(e) => handlePartnerFileChange(e, setIdPhoto)} 
                                className="hidden" 
                              />
                              <Users className="w-5 h-5 text-slate-400" />
                              <span className="text-[10px] font-bold text-slate-700">
                                {partnerType === 'MERCHANT' ? 'Pilih Foto KTP' : 'Pilih Foto KTP/SIM'}
                              </span>
                              <span className="text-[8px] text-slate-400">Identitas pemilik usaha atau pengemudi</span>
                            </label>
                            {idPhoto && (
                              <div className="w-16 h-16 rounded-xl border border-slate-200 overflow-hidden relative group">
                                <img src={idPhoto} alt="Foto KTP/SIM" className="w-full h-full object-cover" />
                                <button 
                                  type="button" 
                                  onClick={() => setIdPhoto('')} 
                                  className="absolute inset-0 bg-red-600/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold cursor-pointer"
                                >
                                  Hapus
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>
                  )}

                  {/* STEP 2: Unduh & Tanda Tangan Kontrak */}
                  {partnerStep === 2 && (
                    <div className="flex flex-col gap-4 animate-fadeIn">
                      
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <span className="text-[10px] font-bold text-slate-700 block border-b border-slate-200 pb-1">Draf Dokumen Kontrak Perjanjian Kerjasama</span>
                        <div className="mt-2 text-[9px] text-slate-500 font-mono leading-relaxed h-[250px] overflow-y-auto pr-1 border border-slate-100 rounded-lg p-2 bg-white">
                          <p className="font-bold text-slate-800 text-center mb-1 text-[10px]">
                            {partnerType === 'MERCHANT' 
                              ? 'SURAT PERJANJIAN KERJA SAMA KEMITRAAN UMKM KULINER TUMPANG FOOD' 
                              : 'SURAT PERJANJIAN KERJA SAMA KEMITRAAN MITRA KURIR (DRIVER) TUMPANG FOOD'}
                          </p>
                          
                          <p className="font-bold text-slate-700 mt-2">PASAL 1: Para Pihak</p>
                          <p className="mb-1">Perjanjian Kerja Sama Kemitraan ini dibuat dan disepakati oleh:</p>
                          <p className="ml-2"><strong>PIHAK PERTAMA:</strong> Pengelola Platform Digital dan Layanan Pengantaran Tumpang Food, selanjutnya disebut "Tumpang Food".</p>
                          <p className="ml-2">
                            <strong>PIHAK KEDUA:</strong>{' '}
                            {partnerType === 'MERCHANT' ? (
                              <>{partnerName || '....................'} selaku Pemilik atau penanggung jawab usaha kuliner "{partnerStoreName || '....................'}", selanjutnya disebut "Merchant".</>
                            ) : (
                              <>{partnerName || '....................'} selaku Mitra Kurir Mandiri dengan Kendaraan No Plat {partnerVehicle || '....................'} di Wilayah {partnerArea || '....................'}, selanjutnya disebut "Mitra Driver".</>
                            )}
                          </p>

                          <p className="font-bold text-slate-700 mt-2">PASAL 2: Ruang Lingkup Kemitraan</p>
                          {partnerType === 'MERCHANT' ? (
                            <ol className="list-decimal ml-4 gap-0.5">
                              <li>Pihak Pertama menyediakan platform digital Tumpang Food sebagai media promosi, pemesanan makanan dan minuman, pembayaran, pengelolaan transaksi, serta layanan pengantaran kepada pelanggan.</li>
                              <li>Pihak Kedua memberikan kuasa kepada Pihak Pertama untuk memasarkan dan menerima pesanan atas produk yang dijual melalui aplikasi Tumpang Food.</li>
                              <li>Seluruh layanan pengantaran pesanan kepada pelanggan merupakan tanggung jawab Pihak Pertama melalui Driver Tumpang Food.</li>
                              <li>Merchant hanya bertanggung jawab menyiapkan pesanan sesuai standar kualitas dan menyerahkannya kepada Driver Tumpang Food.</li>
                              <li>Merchant tidak berkewajiban menyediakan layanan pengantaran sendiri terhadap pesanan yang diterima melalui aplikasi Tumpang Food, kecuali terdapat kesepakatan tertulis yang berbeda.</li>
                            </ol>
                          ) : (
                            <ol className="list-decimal ml-4 gap-0.5">
                              <li>Pihak Pertama menugaskan Pihak Kedua untuk menyediakan jasa pengantaran makanan/minuman yang dipesan Pelanggan melalui Platform Tumpang Food.</li>
                              <li>Pihak Kedua bertindak sebagai penyedia jasa mandiri (independen) dan bukan merupakan karyawan dari Pihak Pertama.</li>
                              <li>Pihak Kedua wajib mengantarkan pesanan dengan aman, higienis, utuh, dan sesuai dengan estimasi waktu pengiriman sistem.</li>
                            </ol>
                          )}

                          <p className="font-bold text-slate-700 mt-2">
                            {partnerType === 'MERCHANT' ? 'PASAL 3: Pendaftaran Merchant' : 'PASAL 3: Pendaftaran Mitra Driver'}
                          </p>
                          {partnerType === 'MERCHANT' ? (
                            <>
                              <p className="mb-1">Merchant wajib mengisi data yang benar meliputi: Nama Pemilik ({partnerName || '-'}), Nama Usaha ({partnerStoreName || '-'}), Email ({partnerEmail || '-'}), Nomor WhatsApp ({partnerPhone || '-'}), Alamat ({partnerStoreAddress || '-'}), Lokasi Usaha, Foto KTP, Foto Tempat Usaha, serta dokumen pendukung lainnya.</p>
                              <p>Merchant wajib mengunduh, mencetak, menandatanganinya di atas materai Rp10.000, kemudian mengunggah kembali Surat Perjanjian ini sebelum pendaftaran dapat diproses.</p>
                            </>
                          ) : (
                            <>
                              <p className="mb-1">Mitra Driver wajib melengkapi data profil asli berupa: Nama Lengkap ({partnerName || '-'}), No WhatsApp ({partnerPhone || '-'}), Plat Kendaraan ({partnerVehicle || '-'}), Wilayah Operasional ({partnerArea || '-'}), Koordinat Base, Foto KTP/SIM, Foto Kendaraan, serta berkas pendukung lainnya.</p>
                              <p>Mitra Driver wajib menyetujui, mencetak, menandatangani di atas materai Rp10.000 fisik, lalu mengunggah draf kontrak ini kembali untuk diperiksa.</p>
                            </>
                          )}

                          <p className="font-bold text-slate-700 mt-2">
                            {partnerType === 'MERCHANT' ? 'PASAL 4: Verifikasi Merchant' : 'PASAL 4: Verifikasi Mitra Driver'}
                          </p>
                          <ol className="list-decimal ml-4">
                            <li>Seluruh data akan diverifikasi oleh Tumpang Food.</li>
                            <li>Tumpang Food berhak menerima atau menolak pendaftaran {partnerType === 'MERCHANT' ? 'Merchant' : 'Mitra Driver'} apabila ditemukan data yang tidak sesuai.</li>
                            <li>Keputusan hasil verifikasi menjadi kewenangan Tumpang Food.</li>
                          </ol>

                           {partnerType === 'MERCHANT' ? (
                            <>
                              <p className="font-bold text-slate-700 mt-2">PASAL 5: Sistem Pembayaran</p>
                              <ol className="list-decimal ml-4">
                                <li>Seluruh pembayaran transaksi dilakukan melalui QRIS resmi milik Tumpang Food.</li>
                                <li>Dana transaksi akan diterima terlebih dahulu oleh Pihak Pertama.</li>
                                <li>Merchant tidak diperkenankan menerima pembayaran secara langsung dari pelanggan atas transaksi yang berasal dari aplikasi Tumpang Food, kecuali mendapat persetujuan tertulis dari Pihak Pertama.</li>
                                <li>Setelah transaksi dinyatakan selesai, dana akan diproses untuk pencairan kepada Merchant sesuai ketentuan dalam Perjanjian ini.</li>
                              </ol>

                              <p className="font-bold text-slate-700 mt-2">PASAL 6: Biaya Layanan, Komisi, Ongkos Pengantaran, dan Pencairan Dana</p>
                              <ol className="list-decimal ml-4">
                                <li>Merchant menyetujui bahwa Pihak Pertama berhak memperoleh komisi sebesar 10% (sepuluh persen) dari nilai subtotal makanan atau minuman yang terjual pada setiap transaksi melalui aplikasi Tumpang Food.</li>
                                <li>Biaya Layanan (Service Fee) dibebankan kepada Pelanggan (Customer) sebagai biaya penggunaan platform digital Tumpang Food dan bukan merupakan potongan dari pendapatan Merchant.</li>
                                <li>Besaran Biaya Layanan kepada Pelanggan ditetapkan oleh Tumpang Food sesuai kebijakan yang berlaku dan dapat berubah sewaktu-waktu dengan pemberitahuan melalui aplikasi.</li>
                                <li>Biaya pengantaran (ongkos kirim) yang dibayarkan oleh Pelanggan merupakan pendapatan Pihak Pertama sebagai penyedia layanan pengantaran melalui Driver Tumpang Food dan bukan merupakan bagian dari pendapatan Merchant.</li>
                                <li>Dana hasil penjualan Merchant akan dipotong komisi sebesar 10% (sepuluh persen) sebelum ditransfer ke rekening Merchant.</li>
                                <li>Dana hasil penjualan Merchant setelah dipotong komisi akan ditransfer ke rekening Merchant paling lambat H+1 (satu hari kalender) setelah transaksi dinyatakan selesai.</li>
                                <li>Apabila H+1 jatuh pada hari libur nasional, cuti bersama, atau terjadi gangguan sistem perbankan, pencairan dana akan dilakukan pada hari kerja berikutnya.</li>
                                <li>Merchant wajib memastikan bahwa data rekening bank yang didaftarkan adalah benar, aktif, dan atas nama yang sah. Pihak Pertama tidak bertanggung jawab atas keterlambatan atau kegagalan pencairan yang disebabkan oleh kesalahan data rekening yang diberikan oleh Merchant.</li>
                                <li>Pihak Pertama berhak melakukan perubahan terhadap kebijakan Biaya Layanan kepada Pelanggan dengan pemberitahuan melalui aplikasi atau media komunikasi resmi Tumpang Food. Perubahan tersebut tidak memengaruhi besaran komisi Merchant, kecuali ditentukan lain melalui kesepakatan tertulis antara Pihak Pertama dan Merchant.</li>
                              </ol>

                              <p className="font-bold text-slate-700 mt-2">PASAL 7: Harga Produk</p>
                              <ol className="list-decimal ml-4">
                                <li>Merchant berhak menentukan harga jual setiap produk yang dipasarkan melalui aplikasi Tumpang Food.</li>
                                <li>Merchant bertanggung jawab atas kebenaran harga yang ditampilkan pada aplikasi.</li>
                                <li>Perubahan harga hanya dapat dilakukan melalui Dashboard Merchant.</li>
                                <li>Tumpang Food tidak bertanggung jawab atas kerugian akibat kesalahan harga yang diinput oleh Merchant.</li>
                              </ol>

                              <p className="font-bold text-slate-700 mt-2">PASAL 8: Hak dan Kewajiban Merchant</p>
                              <p className="mb-0.5">Merchant wajib:</p>
                              <ul className="list-disc ml-4 mb-1">
                                <li>Menyediakan makanan sesuai pesanan.</li>
                                <li>Menjaga kualitas dan kebersihan makanan.</li>
                                <li>Menyelesaikan pesanan tepat waktu.</li>
                                <li>Menyerahkan pesanan kepada Driver Tumpang Food.</li>
                                <li>Tidak mengenakan biaya tambahan di luar harga yang tercantum pada aplikasi.</li>
                                <li>Memperbarui stok dan harga apabila terdapat perubahan.</li>
                                <li>Menjaga kerahasiaan akun Merchant.</li>
                              </ul>
                              <p className="mb-0.5">Merchant dilarang:</p>
                              <ul className="list-disc ml-4">
                                <li>Menjual barang ilegal.</li>
                                <li>Menjual makanan kedaluwarsa.</li>
                                <li>Memalsukan transaksi.</li>
                                <li>Mengalihkan transaksi ke luar aplikasi.</li>
                                <li>Menyalahgunakan sistem Tumpang Food.</li>
                              </ul>

                              <p className="font-bold text-slate-700 mt-2">PASAL 9: Hak Pihak Pertama</p>
                              <p className="mb-0.5">Pihak Pertama berhak:</p>
                              <ul className="list-disc ml-4">
                                <li>Melakukan verifikasi Merchant.</li>
                                <li>Menentukan besaran biaya layanan sesuai kebijakan perusahaan.</li>
                                <li>Memotong komisi sebesar 10% dari setiap transaksi Merchant serta biaya layanan harian sesuai skema yang berlaku.</li>
                                <li>Mengelola pembayaran pelanggan.</li>
                                <li>Mengelola layanan pengantaran.</li>
                                <li>Menentukan Driver yang akan mengambil pesanan.</li>
                                <li>Menolak transaksi yang terindikasi penipuan.</li>
                                <li>Melakukan audit apabila diperlukan.</li>
                                <li>Menangguhkan atau mengakhiri kerja sama apabila Merchant melanggar ketentuan.</li>
                              </ul>

                              <p className="font-bold text-slate-700 mt-2">PASAL 10: Penangguhan dan Pengakhiran Kerja Sama</p>
                              <p className="mb-0.5">Tumpang Food berhak menangguhkan atau mengakhiri kerja sama apabila Merchant:</p>
                              <ul className="list-disc ml-4">
                                <li>Memberikan data palsu.</li>
                                <li>Melakukan penipuan.</li>
                                <li>Menjual produk yang dilarang.</li>
                                <li>Melanggar ketentuan dalam Perjanjian ini.</li>
                              </ul>
                            </>
                          ) : (
                            <>
                              <p className="font-bold text-slate-700 mt-2">PASAL 5: Sistem Pendapatan & Ongkos Kirim</p>
                              <ol className="list-decimal ml-4">
                                <li>Mitra Driver berhak menerima pembayaran delivery fee (ongkos kirim) atas setiap pengantaran pesanan yang berhasil diselesaikan secara penuh ke saldo dompet aplikasi Driver Tumpang Food.</li>
                                <li>Besaran tarif pengantaran dihitung secara otomatis oleh sistem Tumpang Food berdasarkan jarak tempuh (kilometer) dan kondisi operasional wilayah Kecamatan Tumpang.</li>
                                <li>Pembagian pendapatan dan potongan komisi platform (jika ada) akan dipotong secara otomatis di dalam saldo dompet Driver sesuai kebijakan resmi platform.</li>
                              </ol>

                              <p className="font-bold text-slate-700 mt-2">PASAL 6: Tata Tertib, Kode Etik & Sanksi</p>
                              <ol className="list-decimal ml-4">
                                <li>Driver wajib mengenakan pakaian yang rapi, sopan, bersih, serta menjaga integritas nama baik Tumpang Food di hadapan pelanggan dan merchant.</li>
                                <li>Driver wajib mematuhi seluruh peraturan lalu lintas dan memiliki SIM serta dokumen kendaraan fisik (STNK) yang sah dan aktif.</li>
                                <li>Driver dilarang keras melakukan kecurangan berupa transaksi fiktif, pemalsuan lokasi GPS, atau bekerjasama secara curang dengan merchant/pelanggan.</li>
                                <li>Apabila terbukti melanggar kode etik atau melakukan kecurangan, Pihak Pertama berhak melakukan pembekuan saldo serta penangguhan akun (suspend) sementara maupun permanen.</li>
                              </ol>
                            </>
                          )}

                          <p className="font-bold text-slate-700 mt-2">PASAL 11: Keadaan Kahar (Force Majeure)</p>
                          <p>Kedua belah pihak dibebaskan dari tanggung jawab apabila tidak dapat melaksanakan kewajibannya akibat bencana alam, kebakaran, perang, gangguan sistem nasional, atau keadaan lain di luar kendali para pihak.</p>

                          <p className="font-bold text-slate-700 mt-2">PASAL 12: Penyelesaian Perselisihan</p>
                          <ol className="list-decimal ml-4">
                            <li>Apabila terjadi perselisihan, kedua belah pihak sepakat menyelesaikannya terlebih dahulu melalui musyawarah.</li>
                            <li>Apabila tidak tercapai kesepakatan, penyelesaian dilakukan sesuai dengan ketentuan hukum yang berlaku di Republik Indonesia.</li>
                          </ol>

                          <p className="font-bold text-slate-700 mt-2">PASAL 13: Penutup</p>
                          <p className="mb-1">Dengan menandatangani Perjanjian ini, Merchant menyatakan telah membaca, memahami, dan menyetujui seluruh isi Perjanjian Kerja Sama Kemitraan Tumpang Food tanpa adanya paksaan dari pihak mana pun.</p>
                          <p>Perjanjian ini mulai berlaku sejak tanggal disetujui oleh Tumpang Food.</p>

                          <p className="mt-4 text-center border-t border-slate-200 pt-3 font-semibold">TANDA TANGAN</p>
                          <p className="text-center text-[8px] text-slate-400 mb-2">Malang, {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                          
                          <div className="grid grid-cols-2 text-center mt-3 font-semibold text-slate-700">
                            <div>
                              <p>PIHAK PERTAMA,</p>
                              <p>TUMPANG FOOD</p>
                              <br /><br /><br />
                              <p className="underline">(...............................)</p>
                              <p className="text-[7px] text-slate-400 font-normal">Nama Jelas</p>
                            </div>
                            <div>
                              <p>PIHAK KEDUA,</p>
                              <p>MERCHANT</p>
                              <p className="text-[7px] text-slate-400 font-normal mt-0.5">(Materai Rp10.000)</p>
                              <br /><br />
                              <p className="underline font-bold">(...............................)</p>
                              <p className="text-[8px] font-normal text-slate-400">Nama Pemilik / Owner "{partnerStoreName || 'Nama Toko'}"</p>
                            </div>
                          </div>
                        </div>

                        {/* Download Contract Button */}
                        <button
                          type="button"
                          onClick={() => {
                            const contractText = `SURAT PERJANJIAN KERJA SAMA KEMITRAAN UMKM KULINER TUMPANG FOOD\n` +
                              `========================================================================\n\n` +
                              `PASAL 1\n` +
                              `Para Pihak\n\n` +
                              `Perjanjian Kerja Sama Kemitraan ini dibuat dan disepakati oleh:\n\n` +
                              `PIHAK PERTAMA\n` +
                              `Pengelola Platform Digital dan Layanan Pengantaran Tumpang Food, selanjutnya disebut "Tumpang Food".\n\n` +
                              `PIHAK KEDUA\n` +
                              `Nama Pemilik : ${partnerName || '....................'}\n` +
                              `Nama Usaha   : "${partnerStoreName || '....................'}"\n` +
                              `Email        : ${partnerEmail || '....................'}\n` +
                              `WhatsApp     : ${partnerPhone || '....................'}\n` +
                              `Alamat       : ${partnerStoreAddress || '....................'}\n` +
                              `selanjutnya disebut "Merchant".\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 2\n` +
                              `Ruang Lingkup Kerja Sama\n\n` +
                              `1. Pihak Pertama menyediakan platform digital Tumpang Food sebagai media promosi, pemesanan makanan dan minuman, pembayaran, pengelolaan transaksi, serta layanan pengantaran kepada pelanggan.\n` +
                              `2. Pihak Kedua memberikan kuasa kepada Pihak Pertama untuk memasarkan dan menerima pesanan atas produk yang dijual melalui aplikasi Tumpang Food.\n` +
                              `3. Seluruh layanan pengantaran pesanan kepada pelanggan merupakan tanggung jawab Pihak Pertama melalui Driver Tumpang Food.\n` +
                              `4. Merchant hanya bertanggung jawab menyiapkan pesanan sesuai standar kualitas dan menyerahkannya kepada Driver Tumpang Food.\n` +
                              `5. Merchant tidak berkewajiban menyediakan layanan pengantaran sendiri terhadap pesanan yang diterima melalui aplikasi Tumpang Food, kecuali terdapat kesepakatan tertulis yang berbeda.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 3\n` +
                              `Pendaftaran Merchant\n\n` +
                              `Merchant wajib mengisi data yang benar meliputi: Nama Pemilik, Nama Usaha, Email, Nomor WhatsApp, Alamat, Lokasi Usaha, Foto KTP, Foto Tempat Usaha, dan Dokumen pendukung lainnya.\n` +
                              `Merchant wajib mengunduh, mencetak, menandatanganinya di atas materai Rp10.000, kemudian mengunggah kembali Surat Perjanjian ini sebelum pendaftaran dapat diproses.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 4\n` +
                              `Verifikasi Merchant\n\n` +
                              `1. Seluruh data akan diverifikasi oleh Tumpang Food.\n` +
                              `2. Tumpang Food berhak menerima atau menolak pendaftaran Merchant apabila ditemukan data yang tidak sesuai.\n` +
                              `3. Keputusan hasil verifikasi menjadi kewenangan Tumpang Food.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 5\n` +
                              `Sistem Pembayaran\n\n` +
                              `1. Seluruh pembayaran transaksi dilakukan melalui QRIS resmi milik Tumpang Food.\n` +
                              `2. Dana transaksi akan diterima terlebih dahulu oleh Pihak Pertama.\n` +
                              `3. Merchant tidak diperkenankan menerima pembayaran secara langsung dari pelanggan atas transaksi yang berasal dari aplikasi Tumpang Food, kecuali mendapat persetujuan tertulis dari Pihak Pertama.\n` +
                              `4. Setelah transaksi dinyatakan selesai, dana akan diproses untuk pencairan kepada Merchant sesuai ketentuan dalam Perjanjian ini.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 6\n` +
                              `Biaya Layanan, Komisi, Ongkos Pengantaran, dan Pencairan Dana\n\n` +
                              `1. Merchant menyetujui bahwa Pihak Pertama berhak memperoleh komisi sebesar 10% (sepuluh persen) dari nilai subtotal makanan atau minuman yang terjual pada setiap transaksi melalui aplikasi Tumpang Food.\n` +
                              `2. Biaya Layanan (Service Fee) dibebankan kepada Pelanggan (Customer) sebagai biaya penggunaan platform digital Tumpang Food dan bukan merupakan potongan dari pendapatan Merchant.\n` +
                              `3. Besaran Biaya Layanan kepada Pelanggan ditetapkan oleh Tumpang Food sesuai kebijakan yang berlaku dan dapat berubah sewaktu-waktu dengan pemberitahuan melalui aplikasi.\n` +
                              `4. Biaya pengantaran (ongkos kirim) yang dibayarkan oleh Pelanggan merupakan pendapatan Pihak Pertama sebagai penyedia layanan pengantaran melalui Driver Tumpang Food dan bukan merupakan bagian dari pendapatan Merchant.\n` +
                              `5. Dana hasil penjualan Merchant akan dipotong komisi sebesar 10% (sepuluh persen) sebelum ditransfer ke rekening Merchant.\n` +
                              `6. Dana hasil penjualan Merchant setelah dipotong komisi akan ditransfer ke rekening Merchant paling lambat H+1 (satu hari kalender) setelah transaksi dinyatakan selesai.\n` +
                              `7. Apabila H+1 jatuh pada hari libur nasional, cuti bersama, atau terjadi gangguan sistem perbankan, pencairan dana akan dilakukan pada hari kerja berikutnya.\n` +
                              `8. Merchant wajib memastikan bahwa data rekening bank yang didaftarkan adalah benar, aktif, dan atas nama yang sah. Pihak Pertama tidak bertanggung jawab atas keterlambatan atau kegagalan pencairan yang disebabkan oleh kesalahan data rekening yang diberikan oleh Merchant.\n` +
                              `9. Pihak Pertama berhak melakukan perubahan terhadap kebijakan Biaya Layanan kepada Pelanggan dengan pemberitahuan melalui aplikasi atau media komunikasi resmi Tumpang Food. Perubahan tersebut tidak memengaruhi besaran komisi Merchant, kecuali ditentukan lain melalui kesepakatan tertulis antara Pihak Pertama dan Merchant.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 7\n` +
                              `Harga Produk\n\n` +
                              `1. Merchant berhak menentukan harga jual setiap produk yang dipasarkan melalui aplikasi Tumpang Food.\n` +
                              `2. Merchant bertanggung jawab atas kebenaran harga yang ditampilkan pada aplikasi.\n` +
                              `3. Perubahan harga hanya dapat dilakukan melalui Dashboard Merchant.\n` +
                              `4. Tumpang Food tidak bertanggung jawab atas kerugian akibat kesalahan harga yang diinput oleh Merchant.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 8\n` +
                              `Hak dan Kewajiban Merchant\n\n` +
                              `Merchant wajib:\n` +
                              `- Menyediakan makanan sesuai pesanan.\n` +
                              `- Menjaga kualitas dan kebersihan makanan.\n` +
                              `- Menyelesaikan pesanan tepat waktu.\n` +
                              `- Menyerahkan pesanan kepada Driver Tumpang Food.\n` +
                              `- Tidak mengenakan biaya tambahan di luar harga yang tercantum pada aplikasi.\n` +
                              `- Memperbarui stok dan harga apabila terdapat perubahan.\n` +
                              `- Menjaga kerahasiaan akun Merchant.\n\n` +
                              `Merchant dilarang:\n` +
                              `- Menjual barang ilegal.\n` +
                              `- Menjual makanan kedaluwarsa.\n` +
                              `- Memalsukan transaksi.\n` +
                              `- Mengalihkan transaksi ke luar aplikasi.\n` +
                              `- Menyalahgunakan sistem Tumpang Food.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 9\n` +
                              `Hak Pihak Pertama\n\n` +
                              `Pihak Pertama berhak:\n` +
                              `- Melakukan verifikasi Merchant.\n` +
                              `- Menentukan besaran biaya layanan sesuai kebijakan perusahaan.\n` +
                              `- Memotong komisi sebesar 10% dari setiap transaksi Merchant serta biaya layanan harian.\n` +
                              `- Mengelola pembayaran pelanggan.\n` +
                              `- Mengelola layanan pengantaran.\n` +
                              `- Menentukan Driver yang akan mengambil pesanan.\n` +
                              `- Menolak transaksi yang terindikasi penipuan.\n` +
                              `- Melakukan audit apabila diperlukan.\n` +
                              `- Menangguhkan atau mengakhiri kerja sama apabila Merchant melanggar ketentuan.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 10\n` +
                              `Penangguhan dan Pengakhiran Kerja Sama\n\n` +
                              `Tumpang Food berhak menangguhkan atau mengakhiri kerja sama apabila Merchant:\n` +
                              `- Memberikan data palsu.\n` +
                              `- Melakukan penipuan.\n` +
                              `- Menjual produk yang dilarang.\n` +
                              `- Melanggar ketentuan dalam Perjanjian ini.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 11\n` +
                              `Keadaan Kahar (Force Majeure)\n\n` +
                              `Kedua belah pihak dibebaskan dari tanggung jawab apabila tidak dapat melaksanakan kewajibannya akibat bencana alam, kebakaran, perang, gangguan sistem nasional, atau keadaan lain di luar kendali para pihak.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 12\n` +
                              `Penyelesaian Perselisihan\n\n` +
                              `1. Apabila terjadi perselisihan, kedua belah pihak sepakat menyelesaikannya terlebih dahulu melalui musyawarah.\n` +
                              `2. Apabila tidak tercapai kesepakatan, penyelesaian dilakukan sesuai dengan ketentuan hukum yang berlaku di Republik Indonesia.\n\n` +
                              `------------------------------------------------------------------------\n\n` +
                              `PASAL 13\n` +
                              `Penutup\n\n` +
                              `Dengan menandatangani Perjanjian ini, Merchant menyatakan telah membaca, memahami, dan menyetujui seluruh isi Perjanjian Kerja Sama Kemitraan Tumpang Food tanpa adanya paksaan dari pihak mana pun.\n` +
                              `Perjanjian ini mulai berlaku sejak tanggal disetujui oleh Tumpang Food.\n\n\n` +
                              `                               TANDA TANGAN\n\n` +
                              `Malang, ${new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}\n\n` +
                              `      PIHAK PERTAMA,                              PIHAK KEDUA,\n` +
                              `       TUMPANG FOOD                                MERCHANT\n\n\n` +
                              `                                              [ MATERAI Rp10.000 ]\n\n\n` +
                              `  ( ________________________ )              ( ________________________ )\n` +
                              `          Nama Jelas                                 Nama Jelas\n` +
                              `                                            Owner "${partnerStoreName || 'Nama Toko'}"`;
                            
                            const blob = new Blob([contractText], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = `Kontrak_Kemitraan_${(partnerStoreName || 'Toko').replace(/\s+/g, '_')}.txt`;
                            link.click();
                            URL.revokeObjectURL(url);
                            alert('File Kontrak berhasil diunduh ke komputer Anda. Silakan simpan, cetak, beri Materai Rp10.000 fisik, dan tanda tangani.');
                          }}
                          className="w-full mt-2.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-[10px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Unduh Dokumen Kontrak (.txt)
                        </button>
                      </div>

                      {/* Instructions for Physical Sign and Stamp */}
                      <div className="flex flex-col gap-2.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Panduan Penyelesaian Kontrak Fisik</span>
                        
                        <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 flex flex-col gap-2.5 text-[10px] text-slate-700 leading-relaxed">
                          <div className="flex gap-2">
                            <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center font-bold text-[8px] flex-shrink-0 mt-0.5">1</span>
                            <p><strong>Unduh draf kontrak</strong> di atas menggunakan tombol <strong>"Unduh Dokumen Kontrak (.txt)"</strong>.</p>
                          </div>
                          <div className="flex gap-2">
                            <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center font-bold text-[8px] flex-shrink-0 mt-0.5">2</span>
                            <p><strong>Cetak (Print)</strong> dokumen draf tersebut pada kertas fisik.</p>
                          </div>
                          <div className="flex gap-2">
                            <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center font-bold text-[8px] flex-shrink-0 mt-0.5">3</span>
                            <p>Tempelkan <strong>Materai Rp10.000 Fisik</strong> pada area tanda tangan Pihak Kedua, lalu bubuhkan <strong>tanda tangan basah</strong> Anda di atas materai tersebut.</p>
                          </div>
                          <div className="flex gap-2">
                            <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center font-bold text-[8px] flex-shrink-0 mt-0.5">4</span>
                            <p><strong>Foto atau Pindai (Scan)</strong> dokumen kontrak bermaterai tersebut secara utuh dan jelas (tulisan harus terbaca terang).</p>
                          </div>
                          <div className="flex gap-2">
                            <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center font-bold text-[8px] flex-shrink-0 mt-0.5">5</span>
                            <p><strong>Unggah kembali</strong> hasil foto/scan dokumen kontrak bermaterai tersebut pada tombol di bawah ini.</p>
                          </div>
                        </div>

                        {/* File Upload Component */}
                        <div className="flex flex-col gap-1.5 mt-1 border-t border-slate-100 pt-3">
                          <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">Unggah Foto / Hasil Scan Kontrak Bermaterai Rp10.000</label>
                          <div className="flex items-center gap-3">
                            <label className="flex-1 border-2 border-dashed border-slate-200 hover:border-rose-400 bg-slate-50 rounded-xl p-4 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors text-center">
                              <input 
                                type="file" 
                                accept="image/*" 
                                onChange={(e) => {
                                  handlePartnerFileChange(e, (dataUrl) => {
                                    setContractPhoto(dataUrl);
                                    setSignatureSigned(true);
                                  });
                                }} 
                                className="hidden" 
                              />
                              <ClipboardList className="w-5 h-5 text-slate-400" />
                              <span className="text-[10px] font-bold text-slate-700">Pilih Foto Kontrak Bermaterai Anda</span>
                              <span className="text-[8px] text-slate-400">Format gambar JPG, PNG (seluruh kertas kontrak terlihat utuh)</span>
                            </label>
                            {contractPhoto && (
                              <div className="w-16 h-16 rounded-xl border border-slate-200 overflow-hidden relative group">
                                <img src={contractPhoto} alt="Hasil Kontrak Bermaterai" className="w-full h-full object-cover" />
                                <button 
                                  type="button" 
                                  onClick={() => {
                                    setContractPhoto('');
                                    setSignatureSigned(false);
                                  }} 
                                  className="absolute inset-0 bg-red-600/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold cursor-pointer"
                                >
                                  Hapus
                                </button>
                              </div>
                            )}
                          </div>
                          {signatureSigned && (
                            <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-0.5 mt-1 justify-center">
                              ✓ Dokumen Kontrak Bermaterai Rp10.000 Berhasil Diunggah!
                            </span>
                          )}
                        </div>
                      </div>

                    </div>
                  )}

                  {/* STEP 3: Ringkasan Sebelum Kirim */}
                  {partnerStep === 3 && (
                    <div className="flex flex-col gap-4">
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2 text-xs">
                        <span className="font-bold text-slate-800 text-center text-sm border-b border-slate-200 pb-1">Ringkasan Berkas Pendaftaran</span>
                        
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div>
                            <span className="text-slate-400 block font-semibold">Nama Pemilik</span>
                            <span className="text-slate-800 font-bold">{partnerName}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-semibold">Toko UMKM</span>
                            <span className="text-slate-800 font-bold">{partnerStoreName}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-semibold">Email Kunci</span>
                            <span className="text-slate-800 font-bold">{partnerEmail}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-semibold">No WhatsApp</span>
                            <span className="text-slate-800 font-bold">{partnerPhone}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-400 block font-semibold">Alamat Usaha</span>
                            <span className="text-slate-800 font-bold">{partnerStoreAddress}</span>
                          </div>
                        </div>

                        <div className="border-t border-slate-200/60 pt-2 flex justify-between gap-1 text-[8px] font-bold text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-slate-400 uppercase">Tempat Usaha</span>
                            <img src={businessPhoto} className="w-10 h-10 object-cover rounded border border-slate-200" />
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-slate-400 uppercase">KTP Pemilik</span>
                            <img src={idPhoto} className="w-10 h-10 object-cover rounded border border-slate-200" />
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-slate-400 uppercase">Tanda Tangan</span>
                            <img src={contractPhoto} className="w-10 h-10 object-cover rounded border border-slate-200 bg-white" />
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start gap-2.5">
                        <input
                          id="agree-merchant-terms"
                          type="checkbox"
                          checked={partnerTermsAccepted}
                          onChange={(e) => setPartnerTermsAccepted(e.target.checked)}
                          className="w-4 h-4 mt-0.5 rounded text-rose-600 focus:ring-rose-500 border-slate-300 accent-rose-600 cursor-pointer"
                        />
                        <label htmlFor="agree-merchant-terms" className="text-[11px] text-slate-600 leading-normal cursor-pointer font-medium">
                          Saya menyatakan bahwa seluruh berkas di atas adalah benar dan sah, serta saya menyetujui seluruh ketentuan dalam <strong>Surat Perjanjian Kerja Sama Kemitraan Tumpang Food</strong>.
                        </label>
                      </div>

                      <div className="text-[10px] text-slate-400 text-center leading-relaxed">
                        Dengan menekan tombol Kirim, Anda secara sah mengirim berkas pendaftaran kemitraan beserta tanda tangan digital untuk ditinjau oleh Admin Tumpang Food.
                      </div>
                    </div>
                  )}

                   {/* Wizard Navigation Action Buttons */}
                  <div className="flex gap-2.5 mt-2 border-t border-slate-100 pt-3">
                    {partnerStep > 1 && (
                      <button
                        type="button"
                        onClick={() => setPartnerStep((prev) => prev - 1)}
                        className="py-3 px-4 border border-slate-200 hover:border-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer flex-shrink-0"
                      >
                        Kembali
                      </button>
                    )}

                    <button
                      type="submit"
                      disabled={
                        partnerSubmitLoading || 
                        (partnerStep === 3 && !partnerTermsAccepted)
                      }
                      className="w-full py-3 bg-rose-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 hover:bg-rose-700 disabled:opacity-60 shadow-lg shadow-rose-600/10 cursor-pointer"
                    >
                      {partnerSubmitLoading ? (
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      ) : partnerStep < 3 ? (
                        'Lanjut ke Tanda Tangan Kontrak'
                      ) : (
                        'Kirim Formulir Pendaftaran'
                      )}
                    </button>
                  </div>

                </form>
              </div>
            )}

            {/* Footer Section */}
            {renderFooter('-partner')}
          </div>
        )}
      </main>

      {/* Sticky Bottom Navigation Footer - Only displayed inside specific services */}
      {homeSubView !== 'main' && (
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-slate-100 px-6 py-2.5 flex justify-between items-center z-[90] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] rounded-t-3xl transition-all duration-300">
          {/* Beranda Layanan */}
          <button 
            onClick={() => {
              setSelectedMerchant(null);
              setActiveTab('home');
            }}
            className={`flex flex-col items-center gap-1.5 flex-1 py-1 cursor-pointer transition-all ${
              (activeTab === 'home' || activeTab === 'merchant-detail' || activeTab === 'cart' || activeTab === 'checkout')
                ? homeSubView === 'food' ? 'text-[#EE2737] font-extrabold scale-105' 
                  : homeSubView === 'shop' ? 'text-[#0F82FF] font-extrabold scale-105' 
                  : homeSubView === 'taxi' ? 'text-amber-500 font-extrabold scale-105' 
                  : homeSubView === 'pay' ? 'text-purple-600 font-extrabold scale-105' 
                  : 'text-emerald-700 font-extrabold scale-105'
                : 'text-slate-400 hover:text-slate-600 font-semibold'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] tracking-tight">
              {homeSubView === 'food' ? 'Beranda Food' : homeSubView === 'shop' ? 'Beranda Shop' : homeSubView === 'taxi' ? 'Beranda Taxi' : homeSubView === 'pay' ? 'Beranda Pay' : 'Beranda'}
            </span>
          </button>

          {/* Riwayat Pesanan Layanan */}
          <button 
            onClick={() => {
              setHistorySearched(false);
              setHistoryPhone('');
              setHistoryOrders([]);
              setActiveTab('history');
            }}
            className={`flex flex-col items-center gap-1.5 flex-1 py-1 cursor-pointer transition-all ${
              (activeTab === 'history' || activeTab === 'tracking' || activeTab === 'payment')
                ? homeSubView === 'food' ? 'text-[#EE2737] font-extrabold scale-105' 
                  : homeSubView === 'shop' ? 'text-[#0F82FF] font-extrabold scale-105' 
                  : homeSubView === 'taxi' ? 'text-amber-500 font-extrabold scale-105' 
                  : homeSubView === 'pay' ? 'text-purple-600 font-extrabold scale-105' 
                  : 'text-emerald-700 font-extrabold scale-105'
                : 'text-slate-400 hover:text-slate-600 font-semibold'
            }`}
          >
            <ClipboardList className="w-5 h-5" />
            <span className="text-[10px] tracking-tight">
              {homeSubView === 'food' ? 'Riwayat Food' : homeSubView === 'shop' ? 'Riwayat Shop' : homeSubView === 'taxi' ? 'Riwayat Taxi' : homeSubView === 'pay' ? 'Riwayat Pay' : 'Riwayat'}
            </span>
          </button>

          {/* Pendaftaran Kemitraan Layanan */}
          <button 
            id="nav-partner-register"
            onClick={() => {
              setActiveTab('partner-register');
            }}
            className={`flex flex-col items-center gap-1.5 flex-1 py-1 cursor-pointer transition-all ${
              activeTab === 'partner-register' 
                ? homeSubView === 'food' ? 'text-[#EE2737] font-extrabold scale-105' 
                  : homeSubView === 'shop' ? 'text-[#0F82FF] font-extrabold scale-105' 
                  : homeSubView === 'taxi' ? 'text-amber-500 font-extrabold scale-105' 
                  : homeSubView === 'pay' ? 'text-purple-600 font-extrabold scale-105' 
                  : 'text-emerald-700 font-extrabold scale-105'
                : 'text-slate-400 hover:text-slate-600 font-semibold'
            }`}
          >
            <UserPlus className="w-5 h-5" />
            <span className="text-[10px] tracking-tight">
              {homeSubView === 'food' ? 'Mitra Food' : homeSubView === 'shop' ? 'Mitra Shop' : homeSubView === 'taxi' ? 'Driver Taxi' : 'Kemitraan'}
            </span>
          </button>

          {/* Portal Demo */}
          <button 
            id="nav-portal-demo"
            onClick={onOpenAuthModal}
            className="flex flex-col items-center gap-1.5 flex-1 py-1 cursor-pointer transition-all text-amber-600 hover:text-amber-700 font-extrabold hover:scale-105"
          >
            <Key className="w-5 h-5 animate-pulse text-amber-500" />
            <span className="text-[10px] tracking-tight">Portal Demo</span>
          </button>
        </nav>
      )}

      {/* FLOATING WHATSAPP BUTTON */}
      <button
        type="button"
        onClick={handleOpenWhatsApp}
        className="fixed bottom-20 right-4 sm:right-6 z-[95] w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#25D366] hover:bg-[#20ba5a] text-white flex items-center justify-center shadow-lg shadow-[#25D366]/30 transition-all hover:scale-110 active:scale-95 group cursor-pointer"
        title="Chat WhatsApp Admin Tumpang Go"
        aria-label="WhatsApp Admin"
      >
        <svg className="w-6 h-6 sm:w-7 sm:h-7 fill-current" viewBox="0 0 24 24">
          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.205 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.285-.143-1.689-.833-1.951-.928-.262-.095-.453-.143-.645.143-.19.285-.74.928-.908 1.118-.168.19-.335.214-.62.071-.285-.143-1.205-.444-2.296-1.416-.848-.757-1.421-1.692-1.588-1.978-.168-.285-.018-.439.125-.581.128-.128.285-.335.428-.501.142-.167.19-.285.285-.476.095-.19.047-.357-.024-.501-.071-.143-.645-1.571-.884-2.143-.233-.557-.47-.481-.645-.49-.168-.008-.359-.01-.55-.01-.191 0-.501.071-.763.357-.262.285-.999.977-.999 2.38 0 1.404 1.023 2.76 1.166 2.951.143.19 2.013 3.074 4.877 4.312.681.294 1.213.47 1.628.601.684.217 1.307.186 1.8.113.55-.082 1.689-.69 1.927-1.356.238-.666.238-1.237.167-1.356-.07-.12-.262-.19-.547-.333z"/>
        </svg>
      </button>
    </div>
  );
}
