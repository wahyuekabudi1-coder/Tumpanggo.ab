/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop Customer Marketplace Component
 * Complete with Catalog Browsing, Search & Categories, Variations Cart,
 * Transparent Checkout, Idempotency Protection, Payment Confirmation, and Secure Tracking.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShopProduct, ShopCategory, ShopConfig, ShopOrder, 
  ShopPaymentStatus, ShopOrderStatus 
} from '../types/shop';
import BannerCarousel from './BannerCarousel';
import { apiFetch as fetch, extractArrayResponse } from '../utils/apiClient.ts';
import { openPayment, configure } from '@arto-pay/js-sdk';
import { 
  Search, ShoppingBag, Plus, Minus, Trash2, X, ArrowLeft, 
  AlertCircle, RefreshCw, Check, Package, Tag, Info, Layers, 
  Store, ChevronRight, AlertTriangle, Truck, Clock, ShieldCheck, 
  Copy, Upload, CreditCard, MapPin, User, Phone, FileText, 
  CheckCircle2, QrCode, ExternalLink
} from 'lucide-react';

export interface ShopCartItem {
  cartItemId: string; // `${productId}_${optionId || 'base'}`
  product: ShopProduct;
  selectedVariation?: {
    variationId: string;
    variationName: string;
    optionId: string;
    optionName: string;
    priceDelta: number;
    optionStock: number;
  };
  unitPrice: number;
  quantity: number;
}

interface ShopMarketplaceViewProps {
  onBackToMain: () => void;
}

const DISTRICT_OPTIONS = [
  'Kecamatan Tumpang',
  'Kecamatan Poncokusumo',
  'Kecamatan Pakis',
  'Kecamatan Jabung',
  'Kecamatan Wajak',
  'Kecamatan Tajinan',
  'Lainnya (Sekitar Tumpang)'
];

export default function ShopMarketplaceView({ onBackToMain }: ShopMarketplaceViewProps) {
  // Navigation View State: 'catalog' | 'checkout' | 'confirmation' | 'tracking'
  const [viewMode, setViewMode] = useState<'catalog' | 'checkout' | 'confirmation' | 'tracking'>('catalog');

  // Remote Data States
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [shopConfig, setShopConfig] = useState<ShopConfig | null>(null);

  // Status States
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>('all');

  // Modal & Cart States
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const [modalQty, setModalQty] = useState<number>(1);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [cart, setCart] = useState<ShopCartItem[]>([]);

  // Checkout Form States
  const [recipientName, setRecipientName] = useState<string>('');
  const [recipientPhone, setRecipientPhone] = useState<string>('');
  const [recipientAddress, setRecipientAddress] = useState<string>('');
  const [recipientDistrict, setRecipientDistrict] = useState<string>(DISTRICT_OPTIONS[0]);
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  const [shippingMethod, setShippingMethod] = useState<'INSTANT' | 'REGULAR' | 'PICKUP' | 'EXPEDITION_REGULAR' | 'CHINA_AIR_EXPRESS' | 'CHINA_SEA_STANDARD'>('INSTANT');
  const [clientRequestId, setClientRequestId] = useState<string>(() => `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Active / Submitted Order for Confirmation View
  const [activeOrder, setActiveOrder] = useState<ShopOrder | null>(null);
  const [copiedOrderNumber, setCopiedOrderNumber] = useState<boolean>(false);
  const [copiedTrackingNumber, setCopiedTrackingNumber] = useState<boolean>(false);

  // Payment Proof Upload States
  const [proofImageBase64, setProofImageBase64] = useState<string>('');
  const [isUploadingProof, setIsUploadingProof] = useState<boolean>(false);
  const [proofMessage, setProofMessage] = useState<string | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);

  // ArtoPay Payment States for Shop
  const [paymentMethodTab, setPaymentMethodTab] = useState<'ARTOPAY' | 'MANUAL'>('ARTOPAY');
  const [artopayLoading, setArtopayLoading] = useState<boolean>(false);
  const [artopayChecking, setArtopayChecking] = useState<boolean>(false);
  const [artopayStatusMsg, setArtopayStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showArtopayModal, setShowArtopayModal] = useState<boolean>(false);

  // Tracking View Form States
  const [trackOrderNumber, setTrackOrderNumber] = useState<string>('');
  const [trackPhone, setTrackPhone] = useState<string>('');
  const [trackedOrder, setTrackedOrder] = useState<ShopOrder | null>(null);
  const [isSearchingTrack, setIsSearchingTrack] = useState<boolean>(false);
  const [trackError, setTrackError] = useState<string | null>(null);

  // Fetch shop data on mount
  useEffect(() => {
    fetchShopData();

    // Load ArtoPay public gateway configuration on mount
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

  // Auto-listen to payment completion messages and auto-poll status for Shop
  useEffect(() => {
    const handleMsg = async (event: MessageEvent) => {
      if (event.data?.type === 'PAYMENT_SUCCESS') {
        const currentOrder = activeOrder || trackedOrder;
        if (currentOrder && (event.data.orderId === currentOrder.orderNumber || event.data.orderId === currentOrder.id || event.data.paymentIntentId === currentOrder.artopayPaymentId)) {
          // Strictly cross-verify with backend to prevent client-side spoofing
          await handleCheckArtoPayShopStatus(currentOrder);
        }
      }
    };
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, [activeOrder, trackedOrder]);

  useEffect(() => {
    const target = activeOrder || trackedOrder;
    if (!target || target.paymentStatus === ShopPaymentStatus.PAID || !target.artopayPaymentId) return;

    const interval = setInterval(async () => {
      try {
        const orderId = target.orderNumber || target.id;
        const res = await fetch(`/api/artopay/status/${orderId}?serviceType=SHOP`);
        if (res.ok) {
          const data = await res.json();
          if (data.isPaid || data.status === 'PAID') {
            const paidUpdate: Partial<ShopOrder> = {
              paymentStatus: ShopPaymentStatus.PAID,
              artopayStatus: 'SUCCESS'
            };
            if (activeOrder) setActiveOrder(prev => prev ? { ...prev, ...paidUpdate } : null);
            if (trackedOrder) setTrackedOrder(prev => prev ? { ...prev, ...paidUpdate } : null);
            setArtopayStatusMsg({
              type: 'success',
              text: 'Alhamdulillah! Pembayaran QRIS ArtoPay berhasil terverifikasi otomatis.'
            });
            setShowArtopayModal(false);
          }
        }
      } catch {}
    }, 3500);
    return () => clearInterval(interval);
  }, [activeOrder?.paymentStatus, activeOrder?.artopayPaymentId, trackedOrder?.paymentStatus, trackedOrder?.artopayPaymentId]);

  const fetchShopData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, catRes, prodRes] = await Promise.all([
        fetch('/api/shop/config'),
        fetch('/api/shop/categories'),
        fetch('/api/shop/products')
      ]);

      if (!cfgRes.ok || !catRes.ok || !prodRes.ok) {
        const errorMsg = !prodRes.ok 
          ? `Gagal memuat produk Tumpang Shop (HTTP ${prodRes.status})` 
          : (!catRes.ok ? `Gagal memuat kategori Tumpang Shop (HTTP ${catRes.status})` : `Gagal memuat konfigurasi toko (HTTP ${cfgRes.status})`);
        throw new Error(errorMsg);
      }

      const cfgData = await cfgRes.json();
      const catData = await catRes.json();
      const prodData = await prodRes.json();

      const safeCategories = extractArrayResponse<ShopCategory>(catData, 'categories');
      const safeProducts = extractArrayResponse<ShopProduct>(prodData, 'products');

      setShopConfig(cfgData);
      setCategories(safeCategories);
      setProducts(safeProducts);
    } catch (err: any) {
      console.error('[TumpangShop Client] Error fetching data:', err);
      setError(err.message || 'Terjadi kesalahan saat menghubungi server Tumpang Shop.');
      setCategories([]);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  // Filtered Products
  const filteredProducts = useMemo(() => {
    const safeProducts = Array.isArray(products) ? products : [];
    const safeCategories = Array.isArray(categories) ? categories : [];

    return safeProducts.filter((p) => {
      if (!p) return false;

      if (selectedCategorySlug !== 'all') {
        const cat = safeCategories.find(c => c && (c.slug === selectedCategorySlug || c.id === selectedCategorySlug));
        if (cat && p.categoryId !== cat.id) {
          return false;
        }
      }

      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (p.name || '').toLowerCase().includes(q);
        const matchSku = (p.sku || '').toLowerCase().includes(q);
        const matchDesc = (p.description || '').toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchDesc) {
          return false;
        }
      }

      return true;
    });
  }, [products, categories, selectedCategorySlug, searchQuery]);

  // Open Product Detail Modal
  const handleOpenProduct = (product: ShopProduct) => {
    setSelectedProduct(product);
    setModalQty(1);

    if (product.variations && product.variations.length > 0 && product.variations[0].options.length > 0) {
      setSelectedOptionId(product.variations[0].options[0].id);
    } else {
      setSelectedOptionId('');
    }
  };

  // Calculate current selected unit price in modal
  const currentModalPrice = useMemo(() => {
    if (!selectedProduct) return 0;
    let base = selectedProduct.price;

    if (selectedOptionId && selectedProduct.variations) {
      for (const v of selectedProduct.variations) {
        const opt = v.options.find(o => o.id === selectedOptionId);
        if (opt) {
          base += (opt.priceDelta || 0);
          break;
        }
      }
    }
    return base;
  }, [selectedProduct, selectedOptionId]);

  // Calculate current available stock for the selection
  const currentModalMaxStock = useMemo(() => {
    if (!selectedProduct) return 0;
    if (selectedOptionId && selectedProduct.variations) {
      for (const v of selectedProduct.variations) {
        const opt = v.options.find(o => o.id === selectedOptionId);
        if (opt) {
          return typeof opt.stock === 'number' ? opt.stock : selectedProduct.stock;
        }
      }
    }
    return selectedProduct.stock;
  }, [selectedProduct, selectedOptionId]);

  // Add Item to Cart (supporting variations)
  const handleAddToCart = () => {
    if (!selectedProduct) return;

    if (currentModalMaxStock <= 0) {
      alert('Maaf, stok produk/varian ini sedang kosong.');
      return;
    }

    const variation = selectedProduct.variations?.[0];
    const option = variation?.options.find(o => o.id === selectedOptionId);

    const cartItemId = option ? `${selectedProduct.id}_${option.id}` : selectedProduct.id;
    const unitPrice = currentModalPrice;

    setCart(prev => {
      const existing = prev.find(item => item.cartItemId === cartItemId);
      if (existing) {
        const newQty = existing.quantity + modalQty;
        if (newQty > currentModalMaxStock) {
          alert(`Maksimal stok yang tersedia adalah ${currentModalMaxStock} ${selectedProduct.unit}.`);
          return prev.map(item => item.cartItemId === cartItemId ? { ...item, quantity: currentModalMaxStock } : item);
        }
        return prev.map(item => item.cartItemId === cartItemId ? { ...item, quantity: newQty } : item);
      }

      const newItem: ShopCartItem = {
        cartItemId,
        product: selectedProduct,
        selectedVariation: option && variation ? {
          variationId: variation.id,
          variationName: variation.name,
          optionId: option.id,
          optionName: option.name,
          priceDelta: option.priceDelta,
          optionStock: option.stock
        } : undefined,
        unitPrice,
        quantity: modalQty
      };

      return [...prev, newItem];
    });

    setSelectedProduct(null);
  };

  // Update Cart Item Quantity
  const handleUpdateCartQty = (cartItemId: string, delta: number) => {
    setCart(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const item = safePrev.find(i => i && i.cartItemId === cartItemId);
      if (!item) return safePrev;

      const maxStock = item.selectedVariation?.optionStock ?? item.product?.stock ?? 999;
      const targetQty = item.quantity + delta;

      if (targetQty <= 0) {
        return safePrev.filter(i => i && i.cartItemId !== cartItemId);
      }

      if (targetQty > maxStock) {
        alert(`Batas stok tercapai. Maksimal ${maxStock} ${item.product?.unit || 'item'}.`);
        return safePrev;
      }

      return safePrev.map(i => i.cartItemId === cartItemId ? { ...i, quantity: targetQty } : i);
    });
  };

  // Remove Item from Cart
  const handleRemoveFromCart = (cartItemId: string) => {
    setCart(prev => (Array.isArray(prev) ? prev : []).filter(i => i && i.cartItemId !== cartItemId));
  };

  // Cart Metrics
  const cartTotalCount = useMemo(() => {
    return cart.reduce((acc, curr) => acc + curr.quantity, 0);
  }, [cart]);

  const cartSubtotal = useMemo(() => {
    return cart.reduce((acc, curr) => acc + (curr.unitPrice * curr.quantity), 0);
  }, [cart]);

  // Shipping Fee calculation preview based on current shippingMethod
  const currentDeliveryFee = useMemo(() => {
    if (!shopConfig) return 4000;
    if (shippingMethod === 'PICKUP') return 0;
    if (shippingMethod === 'REGULAR') return Math.max(0, Math.round(shopConfig.defaultDeliveryFee * 0.7));
    if (shippingMethod === 'EXPEDITION_REGULAR') return 12000;
    if (shippingMethod === 'CHINA_AIR_EXPRESS') return 35000;
    if (shippingMethod === 'CHINA_SEA_STANDARD') return 20000;
    return shopConfig.defaultDeliveryFee;
  }, [shopConfig, shippingMethod]);

  const currentServiceFee = useMemo(() => {
    return shopConfig?.serviceFee || 1000;
  }, [shopConfig]);

  const estimatedTotal = useMemo(() => {
    return cartSubtotal + currentDeliveryFee + currentServiceFee;
  }, [cartSubtotal, currentDeliveryFee, currentServiceFee]);

  // Start Checkout
  const handleProceedToCheckout = () => {
    setIsCartOpen(false);
    setOrderError(null);
    setClientRequestId(`req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    setViewMode('checkout');
  };

  // Submit Order to POST /api/shop/orders
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingOrder) return;

    setOrderError(null);

    // Validate inputs
    if (!recipientName.trim() || recipientName.trim().length < 2) {
      setOrderError('Nama penerima wajib diisi dengan benar (minimal 2 karakter).');
      return;
    }

    const cleanPhone = recipientPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 9) {
      setOrderError('Nomor WhatsApp tidak valid. Masukkan nomor yang benar (minimal 9 digit angka).');
      return;
    }

    if (!recipientAddress.trim() || recipientAddress.trim().length < 5) {
      setOrderError('Alamat pengantaran lengkap wajib diisi (minimal 5 karakter).');
      return;
    }

    if (!recipientDistrict.trim()) {
      setOrderError('Kecamatan pengantaran wajib dipilih.');
      return;
    }

    if (cart.length === 0) {
      setOrderError('Keranjang belanja kosong. Silakan pilih produk terlebih dahulu.');
      return;
    }

    if (shopConfig && cartSubtotal < shopConfig.minOrderAmount) {
      setOrderError(`Minimal belanja adalah Rp ${shopConfig.minOrderAmount.toLocaleString('id-ID')}. Subtotal saat ini: Rp ${cartSubtotal.toLocaleString('id-ID')}`);
      return;
    }

    setIsSubmittingOrder(true);

    try {
      const orderPayload = {
        customerName: recipientName.trim(),
        customerPhone: recipientPhone.trim(),
        deliveryAddress: recipientAddress.trim(),
        customerDistrict: recipientDistrict.trim(),
        deliveryNotes: deliveryNotes.trim(),
        shippingMethod,
        clientRequestId,
        items: cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          variationId: item.selectedVariation?.variationId,
          optionId: item.selectedVariation?.optionId
        }))
      };

      const res = await fetch('/api/shop/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Gagal memproses pesanan belanja.');
      }

      // Order created successfully
      setActiveOrder(data);
      setCart([]); // Clear cart
      setViewMode('confirmation');
      
      // Sync latest product catalog & stocks in background
      fetchShopData();
    } catch (err: any) {
      console.error('[TumpangShop] Order creation error:', err);
      setOrderError(err.message || 'Terjadi kesalahan saat memproses pesanan.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Copy order number helper
  const handleCopyOrderNumber = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedOrderNumber(true);
    setTimeout(() => setCopiedOrderNumber(false), 2500);
  };

  // Handle image upload for payment proof
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Ukuran file maksimal adalah 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProofImageBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Submit payment proof
  const handleSubmitProof = async (orderId: string, phone: string) => {
    if (!proofImageBase64) {
      setProofError('Silakan pilih foto bukti transfer terlebih dahulu.');
      return;
    }

    setIsUploadingProof(true);
    setProofError(null);
    setProofMessage(null);

    try {
      const res = await fetch(`/api/shop/orders/${orderId}/payment-proof`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentProof: proofImageBase64,
          customerPhone: phone
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengunggah bukti pembayaran.');
      }

      setProofMessage('Bukti pembayaran berhasil diunggah! Status pembayaran kini Menunggu Verifikasi Admin.');
      setActiveOrder(data);
      if (trackedOrder && trackedOrder.id === orderId) {
        setTrackedOrder(data);
      }
      setProofImageBase64('');
    } catch (err: any) {
      setProofError(err.message || 'Terjadi kesalahan saat mengunggah bukti bayar.');
    } finally {
      setIsUploadingProof(false);
    }
  };

  // Open official ArtoPay SDK Modal for Shop
  const handleOpenArtopayShopSdk = (targetOrder?: ShopOrder, paymentId?: string, clientSecret?: string, token?: string, publicKey?: string, sandbox?: boolean, orderId?: string) => {
    const orderToPay = targetOrder || activeOrder || trackedOrder;
    if (!orderToPay) return;
    const targetPaymentId = paymentId || orderToPay.artopayPaymentId;
    if (!targetPaymentId) {
      setArtopayStatusMsg({ type: 'error', text: 'ID transaksi ArtoPay belum dibuat. Silakan klik bayar terlebih dahulu.' });
      return;
    }

    const targetClientSecret = clientSecret || orderToPay.artopayClientSecret;
    const targetToken = token || orderToPay.artopayCustomerToken;
    const targetPublicKey = publicKey || orderToPay.artopayPublicKey || (window as any).__ARTOPAY_PUBLIC_KEY__ || (window as any).VITE_ARTOPAY_PUBLIC_KEY || (import.meta as any).env?.VITE_ARTOPAY_PUBLIC_KEY || undefined;
    const isSandbox = sandbox !== undefined ? sandbox : ((window as any).__ARTOPAY_SANDBOX__ !== undefined ? (window as any).__ARTOPAY_SANDBOX__ : true);
    // Align with the exact orderId returned by the backend for this Payment Intent
    const resolvedOrderId = orderId || orderToPay.artopayOrderId || orderToPay.id || orderToPay.orderNumber;

    if (!targetClientSecret) {
      setArtopayStatusMsg({ type: 'error', text: 'Client secret transaksi ArtoPay tidak ditemukan. Silakan buat sesi pembayaran ulang.' });
      return;
    }

    if (!targetPublicKey) {
      setArtopayStatusMsg({ type: 'error', text: 'Public key ArtoPay belum tersedia. Periksa konfigurasi gateway.' });
      return;
    }

    // Safe diagnostic logging (No full secret/token exposed)
    console.log('[ArtoPay Modal Diagnostics - ShopMarketplace]', {
      environment: isSandbox ? 'sandbox' : 'production',
      orderId: resolvedOrderId,
      paymentIntentId: targetPaymentId,
      hasClientSecret: Boolean(targetClientSecret),
      clientSecretPrefix: targetClientSecret ? `${targetClientSecret.substring(0, 7)}...` : 'missing',
      hasCustomerToken: Boolean(targetToken),
      customerTokenPrefix: targetToken ? `${targetToken.substring(0, 7)}...` : 'missing',
      hasPublicKey: Boolean(targetPublicKey),
      publicKeyPrefix: targetPublicKey ? `${targetPublicKey.substring(0, 6)}...` : 'missing',
      sdkParameters: ['clientSecret', 'secret', 'paymentId', 'orderId', 'token', 'customerToken', 'publicKey', 'sandbox']
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
        orderId: resolvedOrderId,
        token: targetToken,
        customerToken: targetToken,
        sandbox: isSandbox,
        publicKey: targetPublicKey,
        onSuccess: async () => {
          setArtopayStatusMsg({ type: 'success', text: 'Pembayaran terdeteksi! Memverifikasi status ke backend...' });
          // Strictly cross-verify with backend server to avoid spoofing
          await handleCheckArtoPayShopStatus(orderToPay);
        },
        onPending: () => {
          setArtopayStatusMsg({ type: 'info', text: 'Pembayaran pending / sedang diproses oleh gateway.' });
          handleCheckArtoPayShopStatus(orderToPay);
        },
        onError: (err: any) => {
          console.warn('[ArtoPay SDK Shop Error]', err);
          setArtopayStatusMsg({ type: 'error', text: `Gateway: ${err?.message || 'Gagal memproses pembayaran di gateway ArtoPay.'}` });
          handleCheckArtoPayShopStatus(orderToPay);
        },
        onClose: () => {
          handleCheckArtoPayShopStatus(orderToPay);
        }
      } as any);
    } catch (e: any) {
      console.error('[ArtoPay Shop SDK openPayment fallback]', e);
      setArtopayStatusMsg({ type: 'error', text: `Gagal membuka checkout ArtoPay: ${e?.message || 'Error internal SDK'}` });
    }
  };

  // ArtoPay Payment Intent Generation for Shop
  const handleCreateArtoPayShopPayment = async (targetOrder?: ShopOrder) => {
    const orderToPay = targetOrder || activeOrder || trackedOrder;
    const targetOrderId = (orderToPay?.id || orderToPay?.orderNumber || '').trim();
    if (!orderToPay || !targetOrderId) {
      setArtopayStatusMsg({ type: 'error', text: 'ID pesanan belanja tidak ditemukan. Pastikan pesanan telah tersimpan.' });
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
          orderId: targetOrderId,
          serviceType: 'SHOP',
          customerPhone: orderToPay.customerPhone,
          amount: Math.round(Number(orderToPay.total))
        }),
        signal: abortCtrl.signal
      });
      clearTimeout(timeoutTimer);

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal membuat sesi transaksi ArtoPay.');
      }

      // Cross-validate that response belongs to this exact order
      if (data.orderId && data.orderId !== targetOrderId && data.orderId !== orderToPay.id && data.orderId !== orderToPay.orderNumber) {
        throw new Error(`Inkonsistensi respons transaksi: order ID gateway (${data.orderId}) tidak cocok dengan pesanan belanja aktif (${targetOrderId}).`);
      }

      const updatedOrderData: Partial<ShopOrder> = {
        artopayPaymentId: data.paymentIntentId,
        artopayCheckoutUrl: data.checkoutUrl,
        artopayClientSecret: data.clientSecret,
        artopayCustomerToken: data.customerToken,
        artopayPublicKey: data.publicKey,
        artopayOrderId: data.orderId || targetOrderId,
        artopayStatus: 'PENDING',
        paymentMethod: 'ARTOPAY_QRIS',
        artopayExpiredAt: data.expiresAt
      };

      if (activeOrder && (activeOrder.id === orderToPay.id || activeOrder.orderNumber === orderToPay.orderNumber)) {
        setActiveOrder(prev => prev ? { ...prev, ...updatedOrderData } : null);
      }
      if (trackedOrder && (trackedOrder.id === orderToPay.id || trackedOrder.orderNumber === orderToPay.orderNumber)) {
        setTrackedOrder(prev => prev ? { ...prev, ...updatedOrderData } : null);
      }

      const checkoutUrl = String(data.checkoutUrl || '').trim();
      const paymentIntentId = data.paymentIntentId || data.id;

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
      handleOpenArtopayShopSdk(
        orderToPay,
        paymentIntentId,
        data.clientSecret,
        data.customerToken,
        data.publicKey,
        data.sandbox,
        data.orderId || targetOrderId
      );
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      console.error('[ArtoPay Shop Error]', err);
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

  // ArtoPay On-demand Status Sync for Shop
  const handleCheckArtoPayShopStatus = async (targetOrder?: ShopOrder) => {
    const orderToCheck = targetOrder || activeOrder || trackedOrder;
    if (!orderToCheck) return;

    setArtopayChecking(true);
    setArtopayStatusMsg(null);
    try {
      const targetId = orderToCheck.orderNumber || orderToCheck.id;
      const res = await fetch(`/api/artopay/status/${targetId}?serviceType=SHOP`);
      const data = await res.json();

      if (data.isPaid || data.status === 'PAID') {
        const paidUpdate: Partial<ShopOrder> = {
          paymentStatus: ShopPaymentStatus.PAID,
          artopayStatus: 'SUCCESS'
        };
        if (activeOrder && (activeOrder.id === orderToCheck.id || activeOrder.orderNumber === orderToCheck.orderNumber)) {
          setActiveOrder(prev => prev ? { ...prev, ...paidUpdate } : null);
        }
        if (trackedOrder && (trackedOrder.id === orderToCheck.id || trackedOrder.orderNumber === orderToCheck.orderNumber)) {
          setTrackedOrder(prev => prev ? { ...prev, ...paidUpdate } : null);
        }

        setArtopayStatusMsg({
          type: 'success',
          text: 'Alhamdulillah! Pembayaran QRIS ArtoPay berhasil terverifikasi otomatis. Pesanan Anda segera disiapkan toko.'
        });
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

  // Tracking search
  const handleSearchTrackOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackOrderNumber.trim() || !trackPhone.trim()) {
      setTrackError('Nomor pesanan dan nomor WhatsApp wajib diisi.');
      return;
    }

    setIsSearchingTrack(true);
    setTrackError(null);
    setTrackedOrder(null);

    try {
      const res = await fetch('/api/shop/orders/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: trackOrderNumber.trim(),
          customerPhone: trackPhone.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Pesanan tidak ditemukan atau nomor WhatsApp tidak sesuai.');
      }

      setTrackedOrder(data);
    } catch (err: any) {
      setTrackError(err.message || 'Gagal melacak pesanan.');
    } finally {
      setIsSearchingTrack(false);
    }
  };

  // ==========================================
  // VIEW: CHECKOUT SCREEN
  // ==========================================
  if (viewMode === 'checkout') {
    return (
      <div className="flex flex-col gap-5 pb-28 animate-fadeIn max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setViewMode('catalog')}
            className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 py-2 px-3.5 rounded-xl shadow-xs border border-slate-200 transition-all cursor-pointer active:scale-95"
          >
            <ArrowLeft className="w-4 h-4 text-blue-600" />
            <span>Kembali ke Katalog</span>
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Checkout Aman Tumpang Shop</span>
          </div>
        </div>

        {/* Error Alert if any */}
        {orderError && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 animate-shake">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold">Gagal Membuat Pesanan</p>
              <p className="mt-0.5 text-rose-700">{orderError}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmitOrder} className="flex flex-col gap-5">
          {/* Section 1: Customer & Delivery Details */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <MapPin className="w-5 h-5 text-blue-600" />
              <h3 className="font-extrabold text-sm text-slate-900">Alamat & Data Penerima</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Nama Lengkap Penerima <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Budi Santoso"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Nomor WhatsApp Penerima <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="tel"
                    required
                    placeholder="Contoh: 081234567890"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50/50"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Digunakan untuk konfirmasi pesanan dan pelacakan status.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Kecamatan <span className="text-rose-500">*</span>
              </label>
              <select
                value={recipientDistrict}
                onChange={(e) => setRecipientDistrict(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50/50 font-medium"
              >
                {DISTRICT_OPTIONS.map((dist) => (
                  <option key={dist} value={dist}>{dist}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Alamat Lengkap Pengantaran <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                placeholder="Nama jalan, nomor rumah, RT/RW, gang, atau patokan rumah..."
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50/50 resize-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Catatan Pesanan (Opsional)
              </label>
              <div className="relative">
                <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Contoh: Titipkan di pagar atau hubungi sebelum sampai"
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50/50"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Shipping Method */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col gap-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Truck className="w-5 h-5 text-blue-600" />
              <h3 className="font-extrabold text-sm text-slate-900">Pilihan Pengiriman</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* INSTANT */}
              <label
                className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                  shippingMethod === 'INSTANT' 
                    ? 'border-blue-600 bg-blue-50/40 shadow-xs ring-1 ring-blue-500' 
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="shipping"
                      checked={shippingMethod === 'INSTANT'}
                      onChange={() => setShippingMethod('INSTANT')}
                      className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-xs font-black text-slate-900">Instan Go</span>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-100 text-blue-700">Lokal</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Langsung dikirim kurir toko ke alamat Anda.
                </p>
                <p className="text-xs font-black text-blue-700">
                  Rp {(shopConfig?.defaultDeliveryFee || 4000).toLocaleString('id-ID')}
                </p>
              </label>

              {/* REGULAR */}
              <label
                className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                  shippingMethod === 'REGULAR' 
                    ? 'border-blue-600 bg-blue-50/40 shadow-xs ring-1 ring-blue-500' 
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="shipping"
                      checked={shippingMethod === 'REGULAR'}
                      onChange={() => setShippingMethod('REGULAR')}
                      className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-xs font-black text-slate-900">Reguler</span>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700">Hemat</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Jadwal pengiriman pagi berikutnya.
                </p>
                <p className="text-xs font-black text-blue-700">
                  Rp {Math.max(0, Math.round((shopConfig?.defaultDeliveryFee || 4000) * 0.7)).toLocaleString('id-ID')}
                </p>
              </label>

              {/* PICKUP */}
              <label
                className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                  shippingMethod === 'PICKUP' 
                    ? 'border-blue-600 bg-blue-50/40 shadow-xs ring-1 ring-blue-500' 
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="shipping"
                      checked={shippingMethod === 'PICKUP'}
                      onChange={() => setShippingMethod('PICKUP')}
                      className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-xs font-black text-slate-900">Ambil di Toko</span>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">Pickup</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Ambil sendiri di gerai resmi Tumpang Shop.
                </p>
                <p className="text-xs font-black text-emerald-600">
                  Gratis (Rp 0)
                </p>
              </label>

              {/* EKSPEDISI DOMESTIK REGULER */}
              <label
                className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                  shippingMethod === 'EXPEDITION_REGULAR' 
                    ? 'border-blue-600 bg-blue-50/40 shadow-xs ring-1 ring-blue-500' 
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="shipping"
                      checked={shippingMethod === 'EXPEDITION_REGULAR'}
                      onChange={() => setShippingMethod('EXPEDITION_REGULAR')}
                      className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-xs font-black text-slate-900">Ekspedisi Domestik</span>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-100 text-amber-700">J&T / JNE</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Pengiriman reguler 2-3 hari kerja antar kota/luar Tumpang.
                </p>
                <p className="text-xs font-black text-amber-700">
                  Rp 12.000
                </p>
              </label>

              {/* CHINA -> INDONESIA CROSS-BORDER (AIR FREIGHT) */}
              <label
                className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                  shippingMethod === 'CHINA_AIR_EXPRESS' 
                    ? 'border-blue-600 bg-blue-50/40 shadow-xs ring-1 ring-blue-500' 
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="shipping"
                      checked={shippingMethod === 'CHINA_AIR_EXPRESS'}
                      onChange={() => setShippingMethod('CHINA_AIR_EXPRESS')}
                      className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-xs font-black text-slate-900">Impor Udara CN ✈️</span>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700">Air Express</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Kargo udara internasional China → ID (7-12 hari kerja unverified).
                </p>
                <p className="text-xs font-black text-indigo-700">
                  Rp 35.000
                </p>
              </label>

              {/* CHINA -> INDONESIA CROSS-BORDER (SEA FREIGHT) */}
              <label
                className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                  shippingMethod === 'CHINA_SEA_STANDARD' 
                    ? 'border-blue-600 bg-blue-50/40 shadow-xs ring-1 ring-blue-500' 
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="shipping"
                      checked={shippingMethod === 'CHINA_SEA_STANDARD'}
                      onChange={() => setShippingMethod('CHINA_SEA_STANDARD')}
                      className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-xs font-black text-slate-900">Impor Laut CN 🚢</span>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-teal-100 text-teal-700">Sea Freight</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Kargo laut kontainer China → ID hemat (20-30 hari kalender unverified).
                </p>
                <p className="text-xs font-black text-teal-700">
                  Rp 20.000
                </p>
              </label>
            </div>
          </div>

          {/* Section 3: Order Items & Transparent Cost Breakdown */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-blue-600" />
                <h3 className="font-extrabold text-sm text-slate-900">Rincian Barang ({cartTotalCount})</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(true)}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800"
              >
                Ubah Keranjang
              </button>
            </div>

            {/* Item list */}
            <div className="flex flex-col gap-2.5 max-h-60 overflow-y-auto pr-1">
              {cart.map((item) => (
                <div key={item.cartItemId} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-b-0">
                  <img
                    src={item.product.images[0] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60'}
                    alt={item.product.name}
                    className="w-12 h-12 rounded-xl object-cover bg-slate-100 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h5 className="font-extrabold text-xs text-slate-800 truncate">{item.product.name}</h5>
                    {item.selectedVariation && (
                      <p className="text-[10px] text-blue-600 font-semibold truncate">
                        Varian: {item.selectedVariation.optionName}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {item.quantity} x Rp {item.unitPrice.toLocaleString('id-ID')}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="font-black text-xs text-slate-900">
                      Rp {(item.unitPrice * item.quantity).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Financial Breakdown */}
            <div className="bg-slate-50 p-4 rounded-2xl flex flex-col gap-2 text-xs border border-slate-100 mt-2">
              <div className="flex justify-between items-center text-slate-600">
                <span>Subtotal Belanja:</span>
                <span className="font-bold text-slate-900">Rp {cartSubtotal.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Biaya Pengiriman ({shippingMethod}):</span>
                <span className="font-bold text-slate-900">
                  {currentDeliveryFee === 0 ? 'Gratis (Rp 0)' : `Rp ${currentDeliveryFee.toLocaleString('id-ID')}`}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Biaya Layanan & Penanganan:</span>
                <span className="font-bold text-slate-900">Rp {currentServiceFee.toLocaleString('id-ID')}</span>
              </div>
              <div className="border-t border-slate-200/80 pt-2.5 mt-1 flex justify-between items-center text-sm">
                <span className="font-extrabold text-slate-900">Perkiraan Total Bayar:</span>
                <span className="font-black text-base text-blue-700">
                  Rp {estimatedTotal.toLocaleString('id-ID')}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                * Nominal akhir akan dilengkapi 3-digit kode unik verifikasi saat pesanan diterbitkan oleh sistem backend.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmittingOrder || cart.length === 0}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black py-3.5 rounded-2xl text-xs sm:text-sm shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98"
            >
              {isSubmittingOrder ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memvalidasi & Memproses Pesanan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Buat Pesanan Sekarang</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ==========================================
  // VIEW: CONFIRMATION SCREEN
  // ==========================================
  if (viewMode === 'confirmation' && activeOrder) {
    return (
      <div className="flex flex-col gap-5 pb-28 animate-fadeIn max-w-2xl mx-auto w-full">
        {/* Success Banner */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-6 rounded-3xl shadow-lg shadow-emerald-500/15 flex flex-col items-center text-center relative overflow-hidden">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>
          <h2 className="font-black text-xl">Pesanan Berhasil Dibuat!</h2>
          <p className="text-xs text-emerald-100 mt-1 max-w-md">
            Terima kasih telah berbelanja di Tumpang Shop. Pesanan Anda telah tersimpan dengan aman di server dan siap diproses setelah pembayaran diverifikasi.
          </p>
        </div>

        {/* Order Number Card */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nomor Pesanan</p>
              <h3 className="font-mono font-black text-lg text-slate-900 mt-0.5">{activeOrder.orderNumber}</h3>
            </div>
            <button
              onClick={() => handleCopyOrderNumber(activeOrder.orderNumber)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer self-start sm:self-auto"
            >
              {copiedOrderNumber ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Salin Nomor</span>
                </>
              )}
            </button>
          </div>

          {/* Shipment Tracking Number Card if created */}
          {activeOrder.shipment && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-blue-50/70 p-4 rounded-2xl border border-blue-200/80">
              <div>
                <div className="flex items-center gap-1.5 text-blue-700">
                  <Truck className="w-3.5 h-3.5" />
                  <p className="text-[10px] font-black uppercase tracking-wider">
                    Resi Pengiriman ({activeOrder.shipment.courierName})
                  </p>
                </div>
                <h4 className="font-mono font-black text-base text-slate-900 mt-0.5">
                  {activeOrder.shipment.trackingNumber}
                </h4>
                <p className="text-[10px] text-blue-600 font-semibold mt-0.5">
                  Status: {activeOrder.shipment.statusLabel} • {activeOrder.shipment.scope === 'INTERNATIONAL' ? 'Kargo Impor (China 🇨🇳 → ID 🇮🇩)' : 'Kurir Domestik/Lokal'}
                </p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(activeOrder.shipment!.trackingNumber);
                  setCopiedTrackingNumber(true);
                  setTimeout(() => setCopiedTrackingNumber(false), 2500);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer self-start sm:self-auto"
              >
                {copiedTrackingNumber ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Resi Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>Salin Resi</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Status Badges */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-bold text-slate-500 block">Status Pesanan:</span>
              <span className="inline-block mt-1 font-extrabold text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                {activeOrder.orderStatus === 'NEW' ? 'Pesanan Baru (NEW)' : activeOrder.orderStatus}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-bold text-slate-500 block">Status Pembayaran:</span>
              <span className={`inline-block mt-1 font-extrabold text-xs px-2.5 py-0.5 rounded-full ${
                activeOrder.paymentStatus === 'PAID'
                  ? 'bg-emerald-100 text-emerald-800'
                  : activeOrder.paymentStatus === 'WAITING_VERIFICATION'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-rose-100 text-rose-800'
              }`}>
                {activeOrder.paymentStatus === 'UNPAID' ? 'Belum Dibayar (UNPAID)' : 
                 activeOrder.paymentStatus === 'WAITING_VERIFICATION' ? 'Menunggu Verifikasi Admin' :
                 activeOrder.paymentStatus === 'PAID' ? 'Lunas Terverifikasi' : activeOrder.paymentStatus}
              </span>
            </div>
          </div>
        </div>

        {/* Ringkasan Belanja & Detail Pengantaran */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShoppingBag className="w-5 h-5 text-blue-600" />
            <h3 className="font-extrabold text-sm text-slate-900">Ringkasan Belanja ({activeOrder.items.reduce((acc, it) => acc + it.quantity, 0)} Barang)</h3>
          </div>

          {/* Item List */}
          <div className="flex flex-col gap-2.5 max-h-64 overflow-y-auto pr-1">
            {activeOrder.items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0 text-xs">
                <div className="flex-1 min-w-0 pr-2">
                  <h5 className="font-extrabold text-slate-800 truncate">{item.name}</h5>
                  {item.selectedVariation && (
                    <p className="text-[10px] text-blue-600 font-semibold truncate">
                      Varian: {item.selectedVariation.optionName}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {item.quantity} {item.unit} x Rp {item.price.toLocaleString('id-ID')}
                  </p>
                </div>
                <span className="font-black text-slate-900 flex-shrink-0">
                  Rp {item.subtotal.toLocaleString('id-ID')}
                </span>
              </div>
            ))}
          </div>

          {/* Delivery & Recipient Info */}
          <div className="bg-slate-50 p-4 rounded-2xl flex flex-col gap-2 text-xs border border-slate-100">
            <div className="flex justify-between items-start">
              <span className="text-slate-500 flex-shrink-0">Penerima:</span>
              <span className="font-bold text-slate-900 text-right">{activeOrder.customerName} ({activeOrder.customerPhone})</span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-slate-500 flex-shrink-0">Kecamatan:</span>
              <span className="font-bold text-slate-900 text-right">{activeOrder.customerDistrict}</span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-slate-500 flex-shrink-0">Alamat:</span>
              <span className="font-bold text-slate-900 text-right max-w-[65%]">{activeOrder.deliveryAddress}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Pengiriman:</span>
              <span className="font-bold text-blue-700">{activeOrder.shippingMethodLabel || activeOrder.shippingMethod}</span>
            </div>
            {activeOrder.deliveryNotes && (
              <div className="flex justify-between items-start pt-1 border-t border-slate-200/60">
                <span className="text-slate-500 flex-shrink-0">Catatan:</span>
                <span className="italic text-slate-600 text-right max-w-[65%]">"{activeOrder.deliveryNotes}"</span>
              </div>
            )}
          </div>

          {/* Rincian Biaya Transparan */}
          <div className="bg-slate-50 p-4 rounded-2xl flex flex-col gap-2 text-xs border border-slate-100">
            <div className="flex justify-between items-center text-slate-600">
              <span>Subtotal Produk:</span>
              <span className="font-bold text-slate-900">Rp {activeOrder.subtotal.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600">
              <span>Ongkos Kirim:</span>
              <span className="font-bold text-slate-900">
                {activeOrder.deliveryFee === 0 ? 'Gratis (Rp 0)' : `Rp ${activeOrder.deliveryFee.toLocaleString('id-ID')}`}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-600">
              <span>Biaya Layanan & Penanganan:</span>
              <span className="font-bold text-slate-900">Rp {activeOrder.serviceFee.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600">
              <span>Kode Unik Verifikasi:</span>
              <span className="font-bold text-blue-700">+{activeOrder.uniqueCode}</span>
            </div>
            <div className="border-t border-slate-200/80 pt-2.5 mt-1 flex justify-between items-center text-sm">
              <span className="font-black text-slate-900">Total Tagihan:</span>
              <span className="font-black text-base text-blue-700">
                Rp {activeOrder.total.toLocaleString('id-ID')}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Instructions: ArtoPay Dynamic QRIS vs Manual Transfer */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              <h3 className="font-extrabold text-sm text-slate-900">Metode Pembayaran</h3>
            </div>
            <span className="text-[11px] font-bold text-slate-500">
              {activeOrder.paymentStatus === 'PAID' ? 'Status: LUNAS' : 'Pilih Metode Bayar'}
            </span>
          </div>

          {/* Payment Method Selector Tabs */}
          <div className="bg-slate-100 p-1 rounded-2xl flex text-xs font-bold">
            <button
              type="button"
              onClick={() => setPaymentMethodTab('ARTOPAY')}
              className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                paymentMethodTab === 'ARTOPAY'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <QrCode className="w-4 h-4 text-blue-600" />
              <span>QRIS Dinamis ArtoPay</span>
              <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full uppercase tracking-wider font-extrabold">Otomatis</span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethodTab('MANUAL')}
              className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                paymentMethodTab === 'MANUAL'
                  ? 'bg-white text-slate-800 shadow-xs'
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
              <div className="bg-gradient-to-br from-blue-50 via-white to-sky-50 border border-blue-200/80 rounded-2xl p-5 shadow-xs text-center relative overflow-hidden">
                <span className="text-[10px] text-blue-800 font-extrabold uppercase tracking-widest block">TOTAL NOMINAL TAGIHAN</span>
                <h2 className="font-black text-2xl sm:text-3xl text-blue-900 mt-1">
                  Rp {activeOrder.total.toLocaleString('id-ID')}
                </h2>

                <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-white border border-blue-200 shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  <span className="text-blue-700">QRIS Dinamis ArtoPay (Real-Time)</span>
                </div>

                {/* ArtoPay Transaction Status Badge */}
                <div className="mt-3 pt-3 border-t border-blue-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Status Pembayaran:</span>
                  <span className={`font-extrabold px-2.5 py-0.5 rounded-lg text-[11px] ${
                    activeOrder.paymentStatus === 'PAID' || activeOrder.artopayStatus === 'SUCCESS'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {activeOrder.paymentStatus === 'PAID' || activeOrder.artopayStatus === 'SUCCESS'
                      ? 'LUNAS (Terverifikasi Otomatis)'
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
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-2.5">
                {activeOrder.paymentStatus === 'PAID' ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-center font-bold text-xs flex items-center justify-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Pembayaran pesanan belanja ini telah lunas terverifikasi.</span>
                  </div>
                ) : activeOrder.artopayCheckoutUrl ? (
                  <div className="flex flex-col gap-2">
                    <a
                      href={activeOrder.artopayCheckoutUrl}
                      target="_self"
                      className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-md shadow-blue-600/20 text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Buka Halaman Pembayaran ArtoPay (Payment Link)</span>
                    </a>
                  </div>
                ) : activeOrder.artopayPaymentId && activeOrder.artopayClientSecret ? (
                  <button
                    type="button"
                    onClick={() => handleOpenArtopayShopSdk(activeOrder)}
                    disabled={artopayLoading}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold rounded-xl shadow-md shadow-blue-600/20 text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Buka Modal Pembayaran ArtoPay (QRIS)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleCreateArtoPayShopPayment(activeOrder)}
                    disabled={artopayLoading}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold rounded-xl shadow-md shadow-blue-600/20 text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
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

                {activeOrder.paymentStatus !== 'PAID' && (
                  <button
                    type="button"
                    onClick={() => handleCheckArtoPayShopStatus(activeOrder)}
                    disabled={artopayChecking}
                    className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${artopayChecking ? 'animate-spin' : ''}`} />
                    <span>{artopayChecking ? 'Memeriksa ke Gateway ArtoPay...' : 'Cek Status Pembayaran (Sinkronkan)'}</span>
                  </button>
                )}
              </div>

              {/* Explanatory banner */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 leading-relaxed flex flex-col gap-1">
                <span className="font-bold text-slate-800 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                  Verifikasi Otomatis Tanpa Upload Bukti:
                </span>
                <span>1. Klik tombol di atas untuk membuka tautan checkout resmi ArtoPay.</span>
                <span>2. Scan kode QRIS dinamis dengan aplikasi m-Banking atau e-Wallet apa pun.</span>
                <span>3. Status pembayaran otomatis terverifikasi dan pesanan langsung diproses.</span>
              </div>
            </div>
          )}

          {/* TAB 2: MANUAL TRANSFER (FALLBACK) */}
          {paymentMethodTab === 'MANUAL' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row items-center gap-5 bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200">
                <div className="bg-white p-3 rounded-2xl shadow-xs border border-slate-200 flex flex-col items-center flex-shrink-0">
                  <img
                    src={shopConfig?.qrisImage || 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=400&auto=format&fit=crop&q=60'}
                    alt="QRIS Manual Tumpang Shop"
                    className="w-36 h-36 object-cover rounded-xl"
                  />
                  <span className="text-[9px] font-black tracking-wider uppercase text-slate-400 mt-2">QRIS MANUAL TOKO</span>
                </div>

                <div className="flex-1 flex flex-col gap-2 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-bold block">TOTAL NOMINAL YANG HARUS DIBAYAR:</span>
                    <span className="font-mono font-black text-xl text-blue-700 block mt-0.5">
                      Rp {activeOrder.total.toLocaleString('id-ID')}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      (Termasuk kode verifikasi unik: {activeOrder.uniqueCode})
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-600 leading-relaxed space-y-1">
                    <p>1. Scan QRIS manual di atas dan masukkan nominal tepat hingga digit terakhir.</p>
                    <p>2. Simpan struk/tangkapan layar bukti transfer.</p>
                    <p>3. Unggah foto bukti transfer melalui form di bawah ini agar diverifikasi admin.</p>
                  </div>
                </div>
              </div>

              {/* Upload Payment Proof Form */}
              <div className="border-t border-slate-100 pt-3 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-slate-600" />
                  <h4 className="font-extrabold text-xs text-slate-800">Unggah Bukti Transfer / Pembayaran</h4>
                </div>

                {proofMessage && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>{proofMessage}</span>
                  </div>
                )}

                {proofError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    <span>{proofError}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="w-full sm:flex-1 text-xs file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => handleSubmitProof(activeOrder.id, activeOrder.customerPhone)}
                    disabled={!proofImageBase64 || isUploadingProof}
                    className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {isUploadingProof ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Mengunggah...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        <span>Kirim Bukti</span>
                      </>
                    )}
                  </button>
                </div>
                {proofImageBase64 && (
                  <div className="mt-1">
                    <p className="text-[10px] text-slate-500 mb-1">Pratinjau Bukti:</p>
                    <img src={proofImageBase64} alt="Pratinjau" className="w-24 h-24 object-cover rounded-xl border border-slate-200" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={() => {
              setTrackOrderNumber(activeOrder.orderNumber);
              setTrackPhone(activeOrder.customerPhone);
              setTrackedOrder(activeOrder);
              setViewMode('tracking');
            }}
            className="w-full sm:flex-1 bg-slate-900 hover:bg-black text-white font-black py-3 rounded-2xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <Clock className="w-4 h-4" />
            <span>Lacak Status Pesanan Ini</span>
          </button>
          <button
            onClick={() => setViewMode('catalog')}
            className="w-full sm:flex-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold py-3 rounded-2xl text-xs transition-colors cursor-pointer"
          >
            Kembali ke Katalog Belanja
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW: TRACKING SCREEN
  // ==========================================
  if (viewMode === 'tracking') {
    return (
      <div className="flex flex-col gap-5 pb-28 animate-fadeIn max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setViewMode('catalog')}
            className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 py-2 px-3.5 rounded-xl shadow-xs border border-slate-200 transition-all cursor-pointer active:scale-95"
          >
            <ArrowLeft className="w-4 h-4 text-blue-600" />
            <span>Kembali ke Belanja</span>
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Package className="w-3.5 h-3.5 text-blue-600" />
            <span>Lacak Pesanan Pelanggan</span>
          </div>
        </div>

        {/* Search Card */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-600" />
            <h3 className="font-extrabold text-sm text-slate-900">Cek Status Pesanan Anda</h3>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-amber-800 text-[11px] leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Perlindungan Privasi:</strong> Masukkan Nomor Pesanan dan Nomor WhatsApp yang digunakan saat memesan. Data pesanan Anda dilindungi dan tidak dapat diakses orang lain.
            </span>
          </div>

          <form onSubmit={handleSearchTrackOrder} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Nomor Pesanan <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: TS-20261011-001"
                value={trackOrderNumber}
                onChange={(e) => setTrackOrderNumber(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50/50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Nomor WhatsApp <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                required
                placeholder="Contoh: 081234567890"
                value={trackPhone}
                onChange={(e) => setTrackPhone(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50/50"
              />
            </div>

            <div className="sm:col-span-2 mt-1">
              <button
                type="submit"
                disabled={isSearchingTrack}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold py-2.5 rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                {isSearchingTrack ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Mencari Data Pesanan...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5" />
                    <span>Cari Status Pesanan</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {trackError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{trackError}</span>
            </div>
          )}
        </div>

        {/* Tracked Order Details */}
        {trackedOrder && (
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col gap-5 animate-fadeIn">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400">Nomor Pesanan</span>
                <h4 className="font-mono font-black text-lg text-slate-900">{trackedOrder.orderNumber}</h4>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSearchTrackOrder}
                  disabled={isSearchingTrack}
                  className="px-2.5 py-1 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
                  title="Segarkan status pesanan dan pengiriman"
                >
                  <RefreshCw className={`w-3 h-3 ${isSearchingTrack ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
                  <span>Segarkan</span>
                </button>
                <span className={`text-xs font-extrabold px-3 py-1 rounded-full ${
                  trackedOrder.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                  trackedOrder.paymentStatus === 'WAITING_VERIFICATION' ? 'bg-amber-100 text-amber-800' :
                  'bg-rose-100 text-rose-800'
                }`}>
                  Bayar: {trackedOrder.paymentStatus}
                </span>
                <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-blue-100 text-blue-800">
                  Pesanan: {trackedOrder.orderStatus}
                </span>
              </div>
            </div>

            {/* Modul Pengiriman & Pelacakan Paket (Part 5) */}
            {trackedOrder.shipment && (
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-blue-600" />
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                        {trackedOrder.shipment.courierName}
                      </span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                        trackedOrder.shipment.scope === 'INTERNATIONAL' 
                          ? 'bg-indigo-100 text-indigo-700' 
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {trackedOrder.shipment.scope === 'INTERNATIONAL' ? 'Impor China 🇨🇳 → ID 🇮🇩' : 'Pengiriman Lokal'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-bold text-slate-500">No. Resi:</span>
                      <span className="font-mono font-black text-sm text-slate-900">{trackedOrder.shipment.trackingNumber}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(trackedOrder.shipment!.trackingNumber);
                          setCopiedTrackingNumber(true);
                          setTimeout(() => setCopiedTrackingNumber(false), 2500);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-white border border-blue-200 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                        title="Salin Nomor Resi"
                      >
                        {copiedTrackingNumber ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-700">Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-slate-500" />
                            <span>Salin</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-[10px] font-bold text-slate-400 block">Status Terkini Paket:</span>
                    <span className="inline-block mt-0.5 px-3 py-1 rounded-full text-xs font-black bg-blue-600 text-white shadow-2xs">
                      {trackedOrder.shipment.statusLabel}
                    </span>
                  </div>
                </div>

                {/* Rute & Estimasi Tiba */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white p-3.5 rounded-xl border border-slate-200/60">
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold block">Rute Pengiriman:</span>
                    <span className="font-bold text-slate-800 text-xs">
                      {trackedOrder.shipment.originCity} ➔ {trackedOrder.shipment.destinationCity}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold block">Estimasi Waktu Tiba:</span>
                    <span className="font-bold text-slate-800 text-xs">
                      {trackedOrder.shipment.estimatedArrival}
                    </span>
                    {!trackedOrder.shipment.isEstimateVerified && (
                      <span className="text-[9px] text-amber-600 font-medium block">
                        *Estimasi manual belum terverifikasi API kurir live
                      </span>
                    )}
                  </div>
                </div>

                {/* Catatan Transparansi Pembaruan Manual Admin (Requirement 7 & 8) */}
                <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl flex items-start gap-2.5 text-[11px] text-amber-900">
                  <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <p className="font-bold">Pembaruan Manual oleh Admin Toko</p>
                    <p className="text-amber-800 text-[10.5px] mt-0.5">{trackedOrder.shipment.courierAdapterNote}</p>
                  </div>
                </div>

                {/* Visual Pipeline untuk Alur Internasional China -> Indonesia */}
                {trackedOrder.shipment.scope === 'INTERNATIONAL' && (
                  <div>
                    <p className="text-xs font-black text-slate-800 mb-2.5">Tahapan Kargo Internasional (China → Indonesia):</p>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center">
                      {[
                        { step: 'WAITING_DISPATCH', label: 'Gudang China' },
                        { step: 'IN_TRANSIT', label: 'Kargo Udara' },
                        { step: 'ARRIVED_INDONESIA', label: 'Tiba di CGK' },
                        { step: 'CUSTOMS_CLEARANCE', label: 'Bea Cukai' },
                        { step: 'TRANSFERRED_LOCAL_COURIER', label: 'Kurir Lokal' },
                        { step: 'DELIVERED', label: 'Diterima' }
                      ].map((st, sIdx) => {
                        const statusWeights: Record<string, number> = {
                          WAITING_DISPATCH: 0,
                          PROCESSING: 1,
                          DISPATCHED: 1,
                          IN_TRANSIT: 2,
                          ARRIVED_INDONESIA: 3,
                          CUSTOMS_CLEARANCE: 4,
                          CUSTOMS_HOLD: 4,
                          TRANSFERRED_LOCAL_COURIER: 5,
                          OUT_FOR_DELIVERY: 5,
                          DELIVERED: 6
                        };
                        const currentWeight = statusWeights[trackedOrder.shipment!.status] ?? 0;
                        const isReached = currentWeight >= sIdx;
                        const isCurrent = currentWeight === sIdx;

                        return (
                          <div key={st.step} className="flex flex-col items-center">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              isCurrent ? 'bg-indigo-600 text-white ring-2 ring-indigo-200' :
                              isReached ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'
                            }`}>
                              {isReached ? <Check className="w-3 h-3" /> : sIdx + 1}
                            </div>
                            <span className={`text-[9.5px] mt-1 font-bold leading-tight ${
                              isCurrent ? 'text-indigo-700' : isReached ? 'text-slate-800' : 'text-slate-400'
                            }`}>
                              {st.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Riwayat Pelacakan Paket / Tracking History Timeline */}
                <div className="mt-1">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <p className="text-xs font-black text-slate-800">Riwayat Perjalanan Paket ({trackedOrder.shipment.trackingHistory.length} Pembaruan):</p>
                  </div>

                  <div className="flex flex-col gap-2 relative pl-3 border-l-2 border-slate-200 ml-2">
                    {trackedOrder.shipment.trackingHistory.map((evt, eIdx) => (
                      <div key={evt.id || eIdx} className="relative pl-3 pb-2 last:pb-0">
                        <div className={`absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full ${
                          eIdx === 0 ? 'bg-blue-600 ring-4 ring-blue-100' : 'bg-slate-300'
                        }`} />
                        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                          <span className="font-extrabold text-xs text-slate-900">{evt.statusLabel}</span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {new Date(evt.timestamp).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                        </div>
                        <p className="text-[11px] font-medium text-slate-700 mt-0.5">{evt.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-md font-medium">
                            📍 {evt.location}
                          </span>
                          <span className="text-[9px] text-slate-400 italic">
                            ({evt.source === 'MANUAL_ADMIN' ? 'Diperbarui Manual Admin' : 'Sistem'})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Pipeline progress */}
            <div>
              <p className="text-xs font-black text-slate-700 mb-3">Perjalanan Pesanan:</p>
              <div className="grid grid-cols-5 gap-1.5 text-center">
                {[
                  { step: 'NEW', label: 'Diterima' },
                  { step: 'PROCESSING', label: 'Diproses' },
                  { step: 'PACKED', label: 'Dikemas' },
                  { step: 'SHIPPED', label: 'Dikirim' },
                  { step: 'COMPLETED', label: 'Selesai' }
                ].map((s, idx) => {
                  const statuses = ['NEW', 'PROCESSING', 'PACKED', 'SHIPPED', 'COMPLETED'];
                  const currentIdx = statuses.indexOf(trackedOrder.orderStatus);
                  const isDone = currentIdx >= idx;
                  const isCurrent = trackedOrder.orderStatus === s.step;

                  return (
                    <div key={s.step} className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        isCurrent ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
                        isDone ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {isDone ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                      </div>
                      <span className={`text-[10px] mt-1 font-bold ${isCurrent ? 'text-blue-700' : isDone ? 'text-slate-800' : 'text-slate-400'}`}>
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recipient & Shipping summary */}
            <div className="bg-slate-50 p-4 rounded-2xl flex flex-col gap-2 text-xs border border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-500">Penerima:</span>
                <span className="font-bold text-slate-900">{trackedOrder.customerName} ({trackedOrder.customerPhone})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Kecamatan:</span>
                <span className="font-bold text-slate-900">{trackedOrder.customerDistrict || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Alamat:</span>
                <span className="font-bold text-slate-900 max-w-[60%] text-right">{trackedOrder.deliveryAddress}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Metode Kirim:</span>
                <span className="font-bold text-slate-900">{trackedOrder.shippingMethodLabel || trackedOrder.shippingMethod}</span>
              </div>
            </div>

            {/* Items list */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-black text-slate-800">Daftar Produk:</p>
              {trackedOrder.items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs py-1.5 border-b border-slate-100 last:border-b-0">
                  <div>
                    <span className="font-bold text-slate-800">{item.name}</span>
                    {item.selectedVariation && (
                      <span className="text-[10px] text-blue-600 block">Varian: {item.selectedVariation.optionName}</span>
                    )}
                    <span className="text-[10px] text-slate-400">{item.quantity} x Rp {item.price.toLocaleString('id-ID')}</span>
                  </div>
                  <span className="font-black text-slate-900">Rp {item.subtotal.toLocaleString('id-ID')}</span>
                </div>
              ))}
            </div>

            {/* Total Billing */}
            <div className="border-t border-slate-200/80 pt-3 flex justify-between items-center text-sm">
              <span className="font-extrabold text-slate-900">Total Pembayaran:</span>
              <span className="font-black text-blue-700 text-base">Rp {trackedOrder.total.toLocaleString('id-ID')}</span>
            </div>

            {/* If UNPAID, show payment instructions & upload */}
            {trackedOrder.paymentStatus === 'UNPAID' && (
              <div className="bg-gradient-to-br from-blue-50/80 via-white to-amber-50/40 p-4 rounded-2xl border border-blue-200/80 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-blue-900">
                    <QrCode className="w-4 h-4 text-blue-600" />
                    <span className="font-extrabold text-xs">Pesanan Belum Lunas</span>
                  </div>
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                    Menunggu Pembayaran
                  </span>
                </div>

                {artopayStatusMsg && (
                  <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 border ${
                    artopayStatusMsg.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : artopayStatusMsg.type === 'error'
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-blue-50 border-blue-200 text-blue-800'
                  }`}>
                    <Info className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{artopayStatusMsg.text}</span>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {trackedOrder.artopayCheckoutUrl ? (
                    <div className="flex flex-col gap-2">
                      <a
                        href={trackedOrder.artopayCheckoutUrl}
                        target="_self"
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-xs text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Buka Halaman Pembayaran ArtoPay (Payment Link)</span>
                      </a>
                    </div>
                  ) : trackedOrder.artopayPaymentId && trackedOrder.artopayClientSecret ? (
                    <button
                      type="button"
                      onClick={() => handleOpenArtopayShopSdk(trackedOrder)}
                      disabled={artopayLoading}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold rounded-xl shadow-xs text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Buka Modal Pembayaran ArtoPay (QRIS)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCreateArtoPayShopPayment(trackedOrder)}
                      disabled={artopayLoading}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold rounded-xl shadow-xs text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      {artopayLoading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Menyiapkan Sesi Pembayaran ArtoPay...</span>
                        </>
                      ) : (
                        <>
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Bayar via ArtoPay (QRIS)</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleCheckArtoPayShopStatus(trackedOrder)}
                    disabled={artopayChecking}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${artopayChecking ? 'animate-spin' : ''}`} />
                    <span>{artopayChecking ? 'Memeriksa status gateway...' : 'Cek Status Pembayaran (Sinkronkan)'}</span>
                  </button>
                </div>

                <div className="border-t border-slate-200/60 pt-2.5 mt-1">
                  <span className="text-[10px] text-slate-500 font-bold block mb-1.5">Atau Unggah Bukti Transfer Manual:</span>
                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="w-full text-xs file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-bold file:bg-white file:text-slate-700 cursor-pointer"
                    />
                    <button
                      onClick={() => handleSubmitProof(trackedOrder.id, trackedOrder.customerPhone)}
                      disabled={!proofImageBase64 || isUploadingProof}
                      className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex-shrink-0"
                    >
                      {isUploadingProof ? 'Mengunggah...' : 'Kirim Bukti'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // VIEW: CATALOG SCREEN (DEFAULT)
  // ==========================================
  return (
    <div className="flex flex-col gap-5 pb-28 animate-fadeIn">
      
      {/* Top Header & Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBackToMain}
          className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 py-2 px-3.5 rounded-xl shadow-xs border border-slate-200 transition-all cursor-pointer active:scale-95"
        >
          <ArrowLeft className="w-4 h-4 text-blue-600" />
          <span>Kembali ke Beranda</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Lacak Pesanan Button */}
          <button
            onClick={() => setViewMode('tracking')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 border border-slate-200 shadow-xs text-slate-700 cursor-pointer active:scale-95 transition-all"
          >
            <Package className="w-3.5 h-3.5 text-blue-600" />
            <span>Lacak Pesanan</span>
          </button>

          {/* Admin Shop Portal Link */}
          <a
            href="?role=shop-admin"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-black shadow-xs cursor-pointer active:scale-95 transition-all"
            title="Portal Administrator Tumpang Shop"
          >
            <Store className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Admin Shop</span>
          </a>

          {/* Store Open Status Badge */}
          {shopConfig && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-white border border-slate-200 shadow-xs">
              <span className={`w-2 h-2 rounded-full ${shopConfig.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
              <span className={shopConfig.isOpen ? 'text-emerald-700 font-extrabold' : 'text-rose-700 font-extrabold'}>
                {shopConfig.isOpen ? 'Buka' : 'Tutup'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Official Carousel Banner */}
      <BannerCarousel altPrefix="Banner Tumpang Shop" />

      {/* Hero Welcome Card */}
      <div className="relative bg-gradient-to-r from-blue-600 via-sky-600 to-indigo-700 text-white p-5 sm:p-6 rounded-3xl shadow-lg shadow-blue-500/15 overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-10 -mt-10 blur-xl"></div>
        <div className="relative z-10 max-w-[85%]">
          <div className="inline-flex items-center gap-1.5 bg-white/20 text-[10px] uppercase font-black tracking-wider px-3 py-0.5 rounded-full border border-white/20">
            <Store className="w-3 h-3" />
            <span>{shopConfig?.storeName || 'Tumpang Shop Mart'}</span>
          </div>
          <h3 className="font-display font-black text-xl leading-tight mt-2.5">
            Belanja Sembako & Kebutuhan Harian
          </h3>
          <p className="text-xs text-blue-50 mt-1 leading-relaxed">
            Pasokan sembako, sayur pasar, dan produk khas Tumpang segar dan lengkap. Siap diantar ke rumah Anda!
          </p>
        </div>
        <div className="absolute right-[-10px] bottom-[-10px] opacity-20 pointer-events-none">
          <ShoppingBag className="w-28 h-28 rotate-12" />
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cari beras, minyak, bumbu dapur, kopi khas Tumpang..."
          className="w-full pl-10 pr-10 py-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
        />
        {searchQuery.trim().length > 0 && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Categories Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setSelectedCategorySlug('all')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
            selectedCategorySlug === 'all'
              ? 'bg-blue-600 text-white shadow-xs shadow-blue-500/20'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/70'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Semua Kategori</span>
        </button>

        {categories.map((cat) => {
          const isSelected = selectedCategorySlug === cat.slug || selectedCategorySlug === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategorySlug(cat.slug)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-xs shadow-blue-500/20'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/70'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>{cat.name}</span>
            </button>
          );
        })}
      </div>

      {/* Main Catalog Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h4 className="font-extrabold text-sm text-slate-800">Daftar Produk</h4>
            <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {filteredProducts.length} produk
            </span>
          </div>

          {/* Quick Refresh */}
          <button
            onClick={fetchShopData}
            title="Muat Ulang Katalog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-3 border border-slate-100 flex flex-col gap-2">
                <div className="w-full aspect-square bg-slate-100 rounded-xl"></div>
                <div className="h-4 bg-slate-100 rounded-md w-3/4"></div>
                <div className="h-3 bg-slate-100 rounded-md w-1/2"></div>
                <div className="h-6 bg-slate-100 rounded-xl mt-2"></div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="bg-rose-50 border border-rose-200 rounded-3xl p-6 text-center flex flex-col items-center gap-3">
            <AlertCircle className="w-8 h-8 text-rose-500" />
            <div className="max-w-md">
              <h5 className="font-extrabold text-sm text-rose-900">Gagal Memuat Produk</h5>
              <p className="text-xs text-rose-700 mt-1">{error}</p>
            </div>
            <button
              onClick={fetchShopData}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* Empty Catalog State */}
        {!loading && !error && filteredProducts.length === 0 && (
          <div className="bg-white rounded-3xl p-8 border border-slate-200/80 text-center flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
              <Package className="w-7 h-7" />
            </div>
            <div className="max-w-xs">
              <h5 className="font-extrabold text-sm text-slate-800">Produk Tidak Ditemukan</h5>
              <p className="text-xs text-slate-500 mt-1">
                {searchQuery
                  ? `Tidak ada produk dengan kata kunci "${searchQuery}". Coba kata kunci lain.`
                  : 'Belum ada produk aktif pada kategori ini.'}
              </p>
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
              >
                Hapus Pencarian
              </button>
            )}
          </div>
        )}

        {/* Products Grid */}
        {!loading && !error && filteredProducts.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {filteredProducts.map((product) => {
              const hasVariations = Boolean(product.variations && product.variations.length > 0 && product.variations[0].options.length > 0);
              const isOutOfStock = product.stock <= 0;

              return (
                <div
                  key={product.id}
                  onClick={() => handleOpenProduct(product)}
                  className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 overflow-hidden shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col group"
                >
                  {/* Thumbnail Container */}
                  <div className="relative aspect-square bg-slate-100 overflow-hidden">
                    <img
                      src={product.images[0] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60'}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />

                    {/* Stock Badges */}
                    {isOutOfStock ? (
                      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center">
                        <span className="bg-rose-600 text-white font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider">
                          Habis
                        </span>
                      </div>
                    ) : product.stock <= 5 ? (
                      <div className="absolute top-2 left-2 bg-amber-500 text-white font-extrabold text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                        Sisa {product.stock}
                      </div>
                    ) : null}

                    {/* Variations Badge */}
                    {hasVariations && !isOutOfStock && (
                      <div className="absolute bottom-2 left-2 bg-slate-900/75 backdrop-blur-2xs text-white text-[9px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Layers className="w-2.5 h-2.5 text-blue-400" />
                        <span>Ada Varian</span>
                      </div>
                    )}
                  </div>

                  {/* Product Details */}
                  <div className="p-3 sm:p-4 flex flex-col flex-1 justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">
                        {product.unit ? `Per ${product.unit}` : 'Satuan'}
                      </span>
                      <h5 className="font-extrabold text-xs sm:text-sm text-slate-800 line-clamp-2 mt-0.5 leading-snug">
                        {product.name}
                      </h5>
                    </div>

                    <div className="flex items-center justify-between mt-1">
                      <div>
                        <p className="text-xs sm:text-sm font-black text-blue-700">
                          Rp {product.price.toLocaleString('id-ID')}
                        </p>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenProduct(product);
                        }}
                        disabled={isOutOfStock}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white disabled:bg-slate-100 disabled:text-slate-300 transition-colors flex items-center justify-center cursor-pointer"
                        title="Tambah ke Keranjang"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky Bottom Cart Bar (if cart has items) */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 left-0 right-0 max-w-lg mx-auto px-4 z-40">
          <div className="bg-slate-900 text-white p-3.5 sm:p-4 rounded-2xl shadow-xl shadow-slate-900/30 flex items-center justify-between border border-slate-800 backdrop-blur-md animate-slideUp">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-900">
                  {cartTotalCount}
                </span>
              </div>
              <div>
                <p className="text-[11px] text-slate-300">Subtotal Belanja:</p>
                <p className="font-black text-sm text-white">
                  Rp {cartSubtotal.toLocaleString('id-ID')}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsCartOpen(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <span>Lihat Keranjang</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Product Detail & Variation Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-2xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col shadow-2xl animate-slideUp">
            {/* Modal Header */}
            <div className="relative aspect-video sm:aspect-4/3 bg-slate-100 flex-shrink-0">
              <img
                src={selectedProduct.images[0] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60'}
                alt={selectedProduct.name}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => setSelectedProduct(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-slate-700 flex items-center justify-center cursor-pointer shadow-xs transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 flex flex-col gap-4 flex-1">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                    SKU: {selectedProduct.sku}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">
                    Satuan: {selectedProduct.unit}
                  </span>
                </div>
                <h3 className="font-extrabold text-base sm:text-lg text-slate-900 mt-1">
                  {selectedProduct.name}
                </h3>
                <p className="text-base sm:text-lg font-black text-blue-700 mt-1">
                  Rp {currentModalPrice.toLocaleString('id-ID')}
                </p>
              </div>

              {selectedProduct.description && (
                <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  {selectedProduct.description}
                </div>
              )}

              {/* Variations Selection */}
              {selectedProduct.variations && selectedProduct.variations.length > 0 && (
                <div className="flex flex-col gap-2">
                  {selectedProduct.variations.map((v) => (
                    <div key={v.id}>
                      <span className="text-xs font-bold text-slate-700 block mb-1.5">
                        {v.name}:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {v.options.map((opt) => {
                          const isChosen = selectedOptionId === opt.id;
                          const isOptionEmpty = typeof opt.stock === 'number' && opt.stock <= 0;

                          return (
                            <button
                              key={opt.id}
                              disabled={isOptionEmpty}
                              onClick={() => setSelectedOptionId(opt.id)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                isChosen
                                  ? 'bg-blue-600 text-white shadow-xs shadow-blue-500/20'
                                  : isOptionEmpty
                                  ? 'bg-slate-100 text-slate-300 border border-slate-200 line-through cursor-not-allowed'
                                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <span>{opt.name}</span>
                              {opt.priceDelta > 0 && (
                                <span className={isChosen ? 'text-blue-100' : 'text-slate-400'}>
                                  (+Rp {opt.priceDelta.toLocaleString('id-ID')})
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quantity Selector & Stock Status */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div>
                  <span className="text-xs font-bold text-slate-700 block">Jumlah Pesanan:</span>
                  <span className="text-[11px] text-slate-400 font-semibold">
                    Stok Tersedia: {currentModalMaxStock} {selectedProduct.unit}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-100 rounded-xl p-1">
                    <button
                      onClick={() => setModalQty(Math.max(1, modalQty - 1))}
                      disabled={modalQty <= 1}
                      className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-700 disabled:opacity-40 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-bold w-8 text-center text-slate-800">{modalQty}</span>
                    <button
                      onClick={() => setModalQty(Math.min(currentModalMaxStock, modalQty + 1))}
                      disabled={modalQty >= currentModalMaxStock}
                      className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-700 disabled:opacity-40 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Add to Cart Action */}
              <div className="pt-2">
                <button
                  onClick={handleAddToCart}
                  disabled={currentModalMaxStock <= 0}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-black py-3 rounded-2xl text-xs sm:text-sm shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>
                    {currentModalMaxStock <= 0 ? 'Stok Habis' : `Tambah ke Keranjang - Rp ${(currentModalPrice * modalQty).toLocaleString('id-ID')}`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart Drawer Slide-over */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-2xs flex justify-end animate-fadeIn">
          <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl animate-slideLeft">
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-blue-600" />
                <h4 className="font-extrabold text-sm text-slate-900">Keranjang Belanja</h4>
                <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {cartTotalCount} item
                </span>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-3">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-10 gap-2">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                    <ShoppingBag className="w-7 h-7" />
                  </div>
                  <h5 className="font-extrabold text-xs text-slate-700">Keranjang Masih Kosong</h5>
                  <p className="text-[11px] text-slate-400 max-w-xs">
                    Pilih produk sembako atau oleh-oleh dari katalog untuk menambahkan ke keranjang belanja.
                  </p>
                </div>
              ) : (
                cart.map((item) => {
                  const maxStock = item.selectedVariation?.optionStock ?? item.product.stock;
                  const isStockProblem = item.quantity > maxStock;

                  return (
                    <div
                      key={item.cartItemId}
                      className={`p-3 rounded-2xl border transition-all flex items-center gap-3 ${
                        isStockProblem ? 'border-rose-300 bg-rose-50/30' : 'border-slate-100 bg-white shadow-2xs'
                      }`}
                    >
                      <img
                        src={item.product.images[0] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60'}
                        alt={item.product.name}
                        className="w-12 h-12 rounded-xl object-cover bg-slate-100 flex-shrink-0"
                      />

                      <div className="flex-1 min-w-0">
                        <h5 className="font-extrabold text-xs text-slate-800 truncate">{item.product.name}</h5>
                        {item.selectedVariation && (
                          <p className="text-[10px] text-blue-600 font-semibold truncate">
                            Varian: {item.selectedVariation.optionName}
                          </p>
                        )}
                        <p className="text-xs font-black text-blue-700 mt-0.5">
                          Rp {item.unitPrice.toLocaleString('id-ID')}
                        </p>

                        {isStockProblem && (
                          <p className="text-[10px] text-rose-600 font-bold flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Stok hanya tersisa {maxStock}</span>
                          </p>
                        )}
                      </div>

                      {/* Stepper & Delete */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                          <button
                            onClick={() => handleUpdateCartQty(item.cartItemId, -1)}
                            className="w-6 h-6 rounded bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-bold w-6 text-center text-slate-800">{item.quantity}</span>
                          <button
                            onClick={() => handleUpdateCartQty(item.cartItemId, 1)}
                            className="w-6 h-6 rounded bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          onClick={() => handleRemoveFromCart(item.cartItemId)}
                          className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center cursor-pointer transition-colors"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Cart Footer Summary */}
            {cart.length > 0 && (
              <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex flex-col gap-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-500">Subtotal Belanja:</span>
                  <span className="font-black text-sm text-slate-900">
                    Rp {cartSubtotal.toLocaleString('id-ID')}
                  </span>
                </div>

                {/* Checkout Action Button */}
                <button
                  onClick={handleProceedToCheckout}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-2xl text-xs transition-colors cursor-pointer shadow-md shadow-blue-500/20 flex items-center justify-center gap-2"
                >
                  <span>Lanjut ke Checkout ({cartTotalCount} Barang)</span>
                  <ChevronRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setIsCartOpen(false)}
                  className="w-full bg-white hover:bg-slate-100 text-slate-700 font-bold py-2 rounded-xl text-xs transition-colors cursor-pointer border border-slate-200"
                >
                  Lanjut Belanja Produk Lain
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ArtoPay Embedded Checkout Modal for Shop */}
      {showArtopayModal && (activeOrder || trackedOrder) && (() => {
        const modalOrder = activeOrder || trackedOrder!;
        const orderId = modalOrder.orderNumber || modalOrder.id;
        const totalAmt = Math.round(Number(modalOrder.total));
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white p-4 px-5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center font-extrabold text-white text-base shadow-xs">
                    T
                  </div>
                  <div className="text-left">
                    <h3 className="font-extrabold text-sm leading-tight tracking-tight flex items-center gap-1.5">
                      <span>ArtoPay Payment Link</span>
                      <span className="text-[10px] bg-blue-500/40 border border-blue-300/30 px-2 py-0.5 rounded-full font-bold">Resmi</span>
                    </h3>
                    <p className="text-[11px] text-blue-100/90">QRIS Dinamis • Tumpang Shop</p>
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
                    <span className="font-bold text-slate-800 text-xs">#{orderId}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Total Tagihan</span>
                    <span className="font-extrabold text-blue-700 text-base font-display">
                      Rp {totalAmt.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                {/* ArtoPay Payment Details & Channels */}
                <div className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left">
                  <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Kanal Pembayaran Resmi ArtoPay</span>
                    <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">Terverifikasi</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-700 font-medium">
                    <div className="flex items-center gap-1.5 bg-white p-2 rounded-xl border border-slate-100 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      <span>QRIS Dinamis Otomatis</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white p-2 rounded-xl border border-slate-100 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
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
                  {modalOrder.artopayCheckoutUrl ? (
                    <a
                      href={modalOrder.artopayCheckoutUrl}
                      target="_self"
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-md shadow-blue-600/20 text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Buka Halaman Pembayaran ArtoPay (Payment Link)</span>
                    </a>
                  ) : modalOrder.artopayPaymentId && modalOrder.artopayClientSecret ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowArtopayModal(false);
                        handleOpenArtopayShopSdk(modalOrder);
                      }}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-md shadow-blue-600/20 text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Buka Modal Pembayaran ArtoPay (QRIS)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setShowArtopayModal(false);
                        handleCreateArtoPayShopPayment(modalOrder);
                      }}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-md shadow-blue-600/20 text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Bayar via ArtoPay (QRIS)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleCheckArtoPayShopStatus(modalOrder)}
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
        );
      })()}

    </div>
  );
}
