/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Order Validation & Transaction Service
 * Enforces price recalculations, menu availability checks, and order state machine rules.
 */

import { Order, OrderItem, OrderStatus, MenuItem, Merchant, SystemConfig, calculateTieredServiceFee, AssignmentMode } from '../../types';

export interface CreateOrderInput {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryDetails?: string;
  landmark?: string;
  latitude: number;
  longitude: number;
  items: Array<{
    menuItemId: string;
    quantity: number;
    notes?: string;
  }>;
  merchantId: string;
  preOrderDate?: string;
}

export class OrderService {
  /**
   * Validates and recalculates an incoming order against official database records.
   * Prevents customer-side price tampering and validates pre-order rules.
   */
  public static validateAndBuildOrder(
    input: CreateOrderInput,
    merchant: Merchant,
    menuItems: MenuItem[],
    systemConfig: SystemConfig,
    activeUniqueCodes: number[]
  ): Omit<Order, 'id' | 'createdAt' | 'updatedAt'> {
    if (!merchant) {
      throw new Error('Merchant tidak ditemukan.');
    }

    if (!merchant.active) {
      throw new Error(`Toko "${merchant.name}" saat ini sedang tutup dan tidak menerima pesanan.`);
    }

    if (!input.items || input.items.length === 0) {
      throw new Error('Keranjang belanja kosong. Silakan pilih menu terlebih dahulu.');
    }

    if (!input.customerName || !input.customerPhone || !input.deliveryAddress) {
      throw new Error('Mohon lengkapi Nama Pemesan, Nomor WhatsApp, dan Alamat Pengiriman.');
    }

    // Pre-order verification
    const isPreOrder = Boolean(merchant.preOrderOnly || input.preOrderDate);
    const totalItemCount = input.items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);

    if (merchant.preOrderOnly && !input.preOrderDate) {
      throw new Error('Toko ini beroperasi dengan sistem Pre-Order. Mohon tentukan tanggal pengiriman.');
    }

    if (isPreOrder && merchant.preOrderMinAmount && totalItemCount < merchant.preOrderMinAmount) {
      throw new Error(`Minimal pemesanan untuk toko Pre-Order ini adalah ${merchant.preOrderMinAmount} porsi/item.`);
    }

    // Validate each menu item against official catalog
    const validatedItems: OrderItem[] = [];
    let calculatedSubtotal = 0;

    for (const orderItemInput of input.items) {
      const quantity = Math.max(1, Math.floor(Number(orderItemInput.quantity) || 1));
      const menuItem = menuItems.find(m => m.id === orderItemInput.menuItemId && m.merchantId === merchant.id);

      if (!menuItem) {
        throw new Error(`Menu dengan ID "${orderItemInput.menuItemId}" tidak ditemukan pada toko ini.`);
      }

      if (!menuItem.available) {
        throw new Error(`Maaf, menu "${menuItem.name}" saat ini sedang habis.`);
      }

      const officialPrice = Number(menuItem.price) || 0;
      calculatedSubtotal += officialPrice * quantity;

      validatedItems.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        price: officialPrice,
        quantity: quantity,
        allowInstant: menuItem.allowInstant,
        preOrderMinAmount: menuItem.preOrderMinAmount
      });
    }

    // Recalculate tiered service fee based on verified subtotal
    const calculatedServiceFee = calculateTieredServiceFee(calculatedSubtotal);

    // Calculate delivery fee
    let calculatedDeliveryFee = systemConfig.defaultDeliveryFee || 5000;
    if (merchant.latitude && merchant.longitude && input.latitude && input.longitude) {
      const distanceKm = this.calculateDistanceKm(
        merchant.latitude,
        merchant.longitude,
        input.latitude,
        input.longitude
      );
      const feePerKm = systemConfig.deliveryFeePerKm || 1500;
      calculatedDeliveryFee = Math.max(
        systemConfig.defaultDeliveryFee || 5000,
        Math.round(distanceKm * feePerKm)
      );
    }

    // Generate unique code (01 - 99) not currently used by pending payment orders
    const uniqueCode = this.generateUniqueCode(activeUniqueCodes);

    // Final total calculation
    const total = calculatedSubtotal + calculatedDeliveryFee + calculatedServiceFee + uniqueCode;

    // Payment expiry window (10 minutes)
    const paymentExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    return {
      uniqueCode,
      total,
      status: OrderStatus.WAITING_PAYMENT,
      merchantId: merchant.id,
      merchantName: merchant.name,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      deliveryAddress: input.deliveryAddress.trim(),
      deliveryDetails: input.deliveryDetails ? input.deliveryDetails.trim() : '',
      landmark: input.landmark ? input.landmark.trim() : '',
      latitude: input.latitude,
      longitude: input.longitude,
      items: validatedItems,
      subtotal: calculatedSubtotal,
      deliveryFee: calculatedDeliveryFee,
      serviceFee: calculatedServiceFee,
      paymentExpiresAt,
      preOrderDate: input.preOrderDate || ''
    };
  }

  /**
   * Generates a unique 2-digit verification code avoiding conflicts.
   */
  public static generateUniqueCode(activeCodes: number[]): number {
    for (let attempts = 0; attempts < 100; attempts++) {
      const code = Math.floor(Math.random() * 99) + 1;
      if (!activeCodes.includes(code)) {
        return code;
      }
    }
    return Math.floor(Math.random() * 99) + 1;
  }

  /**
   * Haversine formula to compute distance in km
   */
  public static calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the Earth in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  /**
   * Validates state machine status transition
   */
  public static isValidStatusTransition(
    currentStatus: OrderStatus,
    targetStatus: OrderStatus,
    role: 'ADMIN' | 'MERCHANT' | 'DRIVER' | 'CUSTOMER' | 'SYSTEM' | 'SHOP_ADMIN'
  ): { allowed: boolean; reason?: string } {
    // Admin has master override for legitimate administrative actions
    if (role === 'ADMIN' || role === 'SYSTEM') {
      return { allowed: true };
    }

    if (currentStatus === targetStatus) {
      return { allowed: true };
    }

    // Terminal states cannot be changed by non-admins
    if (
      currentStatus === OrderStatus.COMPLETED ||
      currentStatus === OrderStatus.CANCELLED ||
      currentStatus === OrderStatus.EXPIRED
    ) {
      return { allowed: false, reason: `Pesanan telah berada pada status final (${currentStatus}).` };
    }

    // Role-specific allowed transitions:
    switch (role) {
      case 'CUSTOMER':
        // Customer can only upload proof or cancel before payment verification
        if (
          currentStatus === OrderStatus.WAITING_PAYMENT &&
          (targetStatus === OrderStatus.WAITING_PAYMENT_VERIFICATION || targetStatus === OrderStatus.CANCELLED)
        ) {
          return { allowed: true };
        }
        return { allowed: false, reason: 'Pelanggan hanya dapat mengunggah bukti pembayaran atau membatalkan pesanan baru.' };

      case 'MERCHANT':
        // Merchant can accept verified payment order and begin cooking
        if (currentStatus === OrderStatus.PAYMENT_VERIFIED && targetStatus === OrderStatus.COOKING) {
          return { allowed: true };
        }
        // Merchant can mark ready for pickup
        if (currentStatus === OrderStatus.COOKING && targetStatus === OrderStatus.READY_FOR_PICKUP) {
          return { allowed: true };
        }
        return { allowed: false, reason: `Merchant tidak diizinkan mengubah status dari ${currentStatus} ke ${targetStatus}.` };

      case 'DRIVER':
        // Driver can pick up ready order
        if (
          (currentStatus === OrderStatus.READY_FOR_PICKUP || currentStatus === OrderStatus.COOKING) &&
          targetStatus === OrderStatus.ORDER_PICKED_UP
        ) {
          return { allowed: true };
        }
        // Driver can mark delivered / completed
        if (
          (currentStatus === OrderStatus.ORDER_PICKED_UP || currentStatus === OrderStatus.DELIVERED) &&
          targetStatus === OrderStatus.COMPLETED
        ) {
          return { allowed: true };
        }
        return { allowed: false, reason: `Driver tidak diizinkan mengubah status dari ${currentStatus} ke ${targetStatus}.` };

      default:
        return { allowed: false, reason: 'Peran tidak dikenali.' };
    }
  }
}
