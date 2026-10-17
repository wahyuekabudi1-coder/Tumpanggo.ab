/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop Types and Interfaces
 * Dedicated models for Marketplace: Products, Categories, Orders, and Config.
 */

export interface ShopProductVariationOption {
  id: string;
  name: string;        // e.g. "1 kg", "500 gr", "Pedas", "Original"
  priceDelta: number;  // Additional price from base price (>= 0)
  stock: number;       // Specific stock for this option
  sku?: string;
}

export interface ShopProductVariation {
  id: string;
  name: string;        // e.g. "Ukuran Kemasan", "Varian Rasa"
  options: ShopProductVariationOption[];
}

export interface ShopProduct {
  id: string;
  sku: string;
  name: string;
  description: string;
  categoryId: string;
  price: number;       // Base price in IDR
  stock: number;       // Base stock count
  images: string[];    // Image URLs or base64
  variations?: ShopProductVariation[];
  unit: string;        // e.g. "kg", "liter", "pcs", "pack", "ikat"
  isActive: boolean;
  isFeatured?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShopCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;       // Lucide icon name or emoji
  orderIndex: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export enum ShopPaymentStatus {
  UNPAID = 'UNPAID',
  WAITING_VERIFICATION = 'WAITING_VERIFICATION',
  PAID = 'PAID',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED'
}

export enum ShopOrderStatus {
  NEW = 'NEW',
  PROCESSING = 'PROCESSING',
  PACKED = 'PACKED',
  SHIPPED = 'SHIPPED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export interface ShopOrderItem {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  selectedVariation?: {
    variationId: string;
    variationName: string;
    optionId: string;
    optionName: string;
  };
  price: number;       // Validated price at order time
  quantity: number;
  subtotal: number;
}

export interface ShopOrder {
  id: string;
  orderNumber: string; // e.g. "TS-20261011-001"
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  customerDistrict: string; // Kecamatan (e.g. "Kecamatan Tumpang")
  shippingMethod: string;    // e.g. "INSTANT" | "REGULAR" | "PICKUP"
  shippingMethodLabel?: string;
  deliveryNotes?: string;
  items: ShopOrderItem[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  uniqueCode: number;
  total: number;
  paymentStatus: ShopPaymentStatus;
  orderStatus: ShopOrderStatus;
  paymentProof?: string;
  paymentVerifiedAt?: string;
  paymentExpiresAt: string;
  cancelReason?: string;
  clientRequestId?: string; // Idempotency key preventing duplicate submission
  shipment?: ShopShipment;
  createdAt: string;
  updatedAt: string;
}

export type ShopShipmentScope = 'LOCAL' | 'INTERNATIONAL';

export enum ShopShipmentStatus {
  WAITING_DISPATCH = 'WAITING_DISPATCH',                   // Menunggu Pengiriman
  PROCESSING = 'PROCESSING',                               // Diproses di Gudang
  DISPATCHED = 'DISPATCHED',                               // Dikirim
  IN_TRANSIT = 'IN_TRANSIT',                               // Dalam Perjalanan
  ARRIVED_INDONESIA = 'ARRIVED_INDONESIA',                 // Tiba di Indonesia (Port of Entry)
  CUSTOMS_CLEARANCE = 'CUSTOMS_CLEARANCE',                 // Pemeriksaan Bea Cukai
  TRANSFERRED_LOCAL_COURIER = 'TRANSFERRED_LOCAL_COURIER', // Diteruskan Kurir Lokal
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',                   // Dalam Pengantaran
  DELIVERED = 'DELIVERED',                                 // Terkirim
  FAILED_DELIVERY = 'FAILED_DELIVERY',                     // Gagal Terkirim
  CUSTOMS_HOLD = 'CUSTOMS_HOLD'                            // Tertahan di Bea Cukai
}

export interface ShopTrackingEvent {
  id: string;
  status: ShopShipmentStatus;
  statusLabel: string;
  location: string;
  description: string;
  timestamp: string;
  source: 'MANUAL_ADMIN' | 'COURIER_API_STUB' | 'SYSTEM';
}

export interface ShopShipment {
  id: string;
  orderId: string;
  orderNumber: string;
  scope: ShopShipmentScope;
  courierCode: string;
  courierName: string;
  serviceType: string;
  serviceName: string;
  trackingNumber: string;
  originCountry: string;      // e.g. "ID", "CN"
  originCity: string;         // e.g. "Tumpang, Malang" or "Shenzhen, Guangdong"
  destinationCountry: string; // e.g. "ID"
  destinationCity: string;    // e.g. "Kecamatan Tumpang, Malang"
  shippingCost: number;
  estimatedArrival: string;
  isEstimateVerified: boolean;
  status: ShopShipmentStatus;
  statusLabel: string;
  trackingHistory: ShopTrackingEvent[];
  liveCourierApiIntegrated: boolean; // false until real courier API credentials exist
  courierAdapterNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShopShippingOption {
  code: string;
  courierCode: string;
  courierName: string;
  serviceName: string;
  scope: ShopShipmentScope;
  originCountry: string;
  originCity: string;
  estimatedDays: string;
  baseCost: number;
  description: string;
  isAvailable: boolean;
  isLiveApiIntegrated: boolean;
  note: string;
}

export interface ShopConfig {
  id: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  isOpen: boolean;
  qrisImage: string;
  defaultDeliveryFee: number;
  serviceFee: number;
  minOrderAmount: number;
  updatedAt?: string;
}

export interface ShopAuditLog {
  id: string;
  action: string;
  userId: string;
  role: 'SHOP_ADMIN' | 'SYSTEM' | 'CUSTOMER';
  details: string;
  createdAt: string;
}

