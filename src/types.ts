/**
 * Types and interfaces for Tumpang Food
 */

export enum OrderStatus {
  WAITING_PAYMENT = 'WAITING_PAYMENT',
  WAITING_PAYMENT_VERIFICATION = 'WAITING_PAYMENT_VERIFICATION',
  PAYMENT_VERIFIED = 'PAYMENT_VERIFIED',
  COOKING = 'COOKING',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  ORDER_PICKED_UP = 'ORDER_PICKED_UP',
  DELIVERED = 'DELIVERED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  PAYMENT_REJECTED = 'PAYMENT_REJECTED'
}

export enum SettlementStatus {
  WAITING_CONFIRMATION = 'WAITING_CONFIRMATION',
  SETTLEMENT_COMPLETED = 'SETTLEMENT_COMPLETED'
}

export enum AssignmentMode {
  MANUAL = 'MANUAL',
  AUTOMATIC = 'AUTOMATIC'
}

export interface Merchant {
  id: string;
  name: string;
  ownerName: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
  openTime: string; // e.g. "08:00"
  closeTime: string; // e.g. "21:00"
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  active: boolean;
  rating: number;
  cookTimeEstimate: string; // e.g. "15-30 min"
  image: string;
  bannerImage?: string;
  description: string;
  category?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
  
  // Pre-order and Delivery Settings (Available for all merchants natively)
  preOrderOnly?: boolean;
  allowInstantAndPreOrder?: boolean;
  preOrderMinAmount?: number;
  preOrderLeadDays?: number; // e.g., 2 for H-2

  // Activation and Authentication
  isActivated?: boolean;
  password?: string;
  businessPhoto?: string;
  idPhoto?: string;
  contractPhoto?: string;
}

export interface Category {
  id: string;
  merchantId: string;
  name: string;
  orderIndex: number;
}

export interface MenuItem {
  id: string;
  merchantId: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  available: boolean;
  image: string;
  createdAt: string;
  updatedAt: string;
  preOrderMinAmount?: number;
  allowInstant?: boolean;
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  preOrderMinAmount?: number;
  allowInstant?: boolean;
}

export interface Order {
  id: string;
  uniqueCode: number; // 3 digit (e.g. 1 to 99, randomized and padded)
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryDetails: string;
  landmark: string;
  latitude: number;
  longitude: number;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number; // subtotal + deliveryFee + serviceFee + uniqueCode/1000 or similar, let's add uniqueCode as integer to total
  paymentProof?: string; // Cloudinary or base64 URL
  deliveryProof?: string; // Cloudinary or base64 URL
  merchantId: string;
  merchantName: string;
  driverId?: string;
  driverName?: string;
  cookingTimeMinutes?: number; // 15, 30, 45, 60
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
  paymentExpiresAt: string; // ISO string (createdAt + 10 mins)
  preOrderDate?: string; // e.g. "2026-07-03" (YYYY-MM-DD)
  clientRequestId?: string;
  paymentMethod?: 'MANUAL_TRANSFER' | 'ARTOPAY_QRIS';
  artopayPaymentId?: string;
  artopayCheckoutUrl?: string;
  artopayStatus?: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
  artopayExpiredAt?: string;
  artopayQrString?: string;
  artopayClientSecret?: string;
  artopayCustomerToken?: string;
  artopayPublicKey?: string;
  artopayOrderId?: string;
  artopaySandbox?: boolean;
  paymentVerifiedAt?: string;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  email?: string;
  active: boolean;
  online: boolean;
  latitude?: number;
  longitude?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Settlement {
  id: string;
  merchantId: string;
  merchantName: string;
  orderCount: number;
  totalSales: number;
  totalCommission: number;
  amountToPay: number;
  status: SettlementStatus;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  createdAt: string;
  paidAt?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  userId: string; // Can be admin id, merchant id, or driver id
  role: 'ADMIN' | 'MERCHANT' | 'DRIVER' | 'SYSTEM' | 'CUSTOMER' | 'SHOP_ADMIN';
  details: string;
  createdAt: string;
}

export interface SystemConfig {
  id?: string;
  serviceFee: number;
  deliveryFeePerKm?: number;
  defaultDeliveryFee: number;
  commissionPercent?: number; // e.g. 10 for 10%
  assignmentMode?: AssignmentMode;
  qrisImage: string;
  systemOpen?: boolean;
}

export interface PartnerRegistration {
  id: string;
  name: string;
  phone: string;
  email?: string;
  type: 'MERCHANT' | 'DRIVER';
  // merchant options
  storeName?: string;
  storeAddress?: string;
  category?: string;
  // driver options
  vehicleNumber?: string;
  operatingArea?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACTIVATED';
  createdAt: string;
  businessPhoto?: string;
  idPhoto?: string;
  contractPhoto?: string;
  latitude?: number;
  longitude?: number;
  password?: string;
  storeId?: string;
}

export function calculateTieredServiceFee(subtotal: number): number {
  if (subtotal <= 100000) return 2000;
  if (subtotal <= 300000) return 3000;
  if (subtotal <= 500000) return 4000;
  if (subtotal <= 700000) return 5000;
  return 10000;
}

// Re-export isolated Tumpang Shop types
export * from './types/shop';

