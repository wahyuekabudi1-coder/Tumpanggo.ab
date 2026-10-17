/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Order Routes
 * Handles order placements, recalculations, driver assignments, and payment proofs.
 * Enforces payment expiration rules, terminal state guards, and RBAC order visibility.
 */

import { Router, Request, Response } from 'express';
import { foodDb } from '../db';
import { OrderStatus } from '../../types';
import { requireRole } from '../auth';

export const orderRouter = Router();

// Order list - Protected by RBAC
orderRouter.get('/', (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Autentikasi diperlukan untuk melihat daftar pesanan.' });
  }

  if (user.role === 'ADMIN') {
    return res.json(foodDb.getOrders());
  }

  if (user.role === 'MERCHANT' && user.entityId) {
    return res.json(foodDb.getOrdersByMerchant(user.entityId));
  }

  if (user.role === 'DRIVER' && user.entityId) {
    return res.json(foodDb.getOrdersByDriver(user.entityId));
  }

  return res.status(403).json({ error: 'Akses ditolak.' });
});

// Single order tracking (Public tracking with ID)
orderRouter.get('/:id', async (req: Request, res: Response) => {
  const o = await foodDb.findOrder(req.params.id);
  if (!o) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  res.json(o);
});

// Customer order history by phone number
orderRouter.get('/customer/:phone', (req: Request, res: Response) => {
  res.json(foodDb.getOrdersByCustomerPhone(req.params.phone));
});

// Order creation - Recalculates official prices
orderRouter.post('/', async (req: Request, res: Response) => {
  try {
    const created = await foodDb.createOrder(req.body);
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Gagal membuat pesanan.' });
  }
});

// Order status/details update
orderRouter.put('/:id', async (req: Request, res: Response) => {
  const user = req.user;
  const currentOrder = await foodDb.findOrder(req.params.id);
  if (!currentOrder) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  }

  const { userId, role, customerPhone, cancelReason, overrideExpired, ...rawUpdates } = req.body;
  const updates: any = { ...rawUpdates };

  // STRIP SENSITIVE / TAMPER-PRONE FIELDS
  delete updates.isSettled;
  delete updates.settlementId;
  delete updates.settledAt;
  delete updates.total;
  delete updates.subtotal;
  delete updates.serviceFee;
  delete updates.deliveryFee;
  delete updates.merchantId;
  delete updates.id;

  // 1. UNAUTHENTICATED REQUEST (Customer Cancellation only)
  if (!user) {
    const isCustomerCancel =
      updates.status === OrderStatus.CANCELLED &&
      customerPhone &&
      String(customerPhone).trim() === String(currentOrder.customerPhone).trim() &&
      (currentOrder.status === OrderStatus.WAITING_PAYMENT ||
        currentOrder.status === OrderStatus.WAITING_PAYMENT_VERIFICATION);

    if (!isCustomerCancel) {
      return res.status(401).json({
        error: 'Akses ditolak: Autentikasi diperlukan untuk mengubah status atau data pesanan.'
      });
    }

    try {
      const updated = await foodDb.updateOrder(
        'CUSTOMER',
        req.params.id,
        {
          status: OrderStatus.CANCELLED,
          cancelReason: cancelReason || 'Dibatalkan oleh Pelanggan'
        },
        'CUSTOMER'
      );
      return res.json(updated);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  }

  // 2. MERCHANT ROLE ENFORCEMENT
  if (user.role === 'MERCHANT') {
    if (user.entityId !== currentOrder.merchantId && user.userId !== currentOrder.merchantId) {
      return res.status(403).json({
        error: 'Akses ditolak: Anda tidak memiliki izin untuk mengelola pesanan milik toko lain.'
      });
    }

    // Only allow cooking, ready for pickup, or cancellation
    if (updates.status) {
      const allowedMerchantStatuses: OrderStatus[] = [
        OrderStatus.COOKING,
        OrderStatus.READY_FOR_PICKUP,
        OrderStatus.CANCELLED
      ];
      if (!allowedMerchantStatuses.includes(updates.status)) {
        return res.status(403).json({
          error: `Merchant tidak diizinkan mengubah status pesanan ke ${updates.status}.`
        });
      }
    }
  }

  // 3. DRIVER ROLE ENFORCEMENT
  if (user.role === 'DRIVER') {
    const isAssigned = currentOrder.driverId === user.entityId || currentOrder.driverId === user.userId;
    const canAcceptTask =
      !currentOrder.driverId && currentOrder.status === OrderStatus.READY_FOR_PICKUP;

    if (!isAssigned && !canAcceptTask) {
      return res.status(403).json({
        error: 'Akses ditolak: Pesanan ini bukan tugas pengantaran Anda.'
      });
    }

    if (updates.status) {
      const allowedDriverStatuses: OrderStatus[] = [
        OrderStatus.ORDER_PICKED_UP,
        OrderStatus.COMPLETED
      ];
      if (!allowedDriverStatuses.includes(updates.status)) {
        return res.status(403).json({
          error: `Driver tidak diizinkan mengubah status pesanan ke ${updates.status}.`
        });
      }
    }
  }

  // 4. EXPIRED / CANCELLED ORDERS GUARD
  if (currentOrder.status === OrderStatus.EXPIRED || currentOrder.status === OrderStatus.CANCELLED) {
    if (updates.status && updates.status !== currentOrder.status) {
      if (user.role === 'ADMIN' && currentOrder.status === OrderStatus.EXPIRED) {
        if (!overrideExpired) {
          return res.status(400).json({
            error:
              'Pesanan telah KEDALUWARSA (EXPIRED). Verifikasi pembayaran tidak dapat dilakukan secara tidak sengaja. Sertakan persetujuan eksplisit pembayaran terlambat (overrideExpired: true) beserta catatan administrasi.'
          });
        }
        foodDb.log(
          user.userId,
          `Admin explicitly approved late payment for expired order ${currentOrder.id}`,
          'ADMIN'
        );
      } else {
        return res.status(400).json({
          error: `Pesanan yang telah ${currentOrder.status} tidak dapat diaktifkan kembali secara langsung.`
        });
      }
    }
  }

  // Preserve cancel reason if provided
  if (cancelReason) {
    updates.cancelReason = cancelReason;
  }

  try {
    const updated = await foodDb.updateOrder(
      user.userId || user.entityId || 'system',
      req.params.id,
      updates,
      user.role
    );
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Admin manual driver assignment
orderRouter.post('/:id/assign-driver', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const { driverId } = req.body;
  if (!driverId) {
    return res.status(400).json({ error: 'Driver ID wajib disertakan.' });
  }
  try {
    const updated = await foodDb.manualAssignDriver(req.user?.userId || 'admin', req.params.id, driverId);
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Customer payment proof upload - Enforces 10-minute expiry
orderRouter.post('/:id/upload-payment', async (req: Request, res: Response) => {
  const { paymentProof } = req.body;
  if (!paymentProof) {
    return res.status(400).json({ error: 'Bukti pembayaran wajib diunggah.' });
  }

  const order = await foodDb.findOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  }

  // Validate payment expiration window
  const now = Date.now();
  const expiryTime = order.paymentExpiresAt ? new Date(order.paymentExpiresAt).getTime() : 0;

  if (expiryTime && now > expiryTime && order.status === OrderStatus.WAITING_PAYMENT) {
    await foodDb.updateOrder('SYSTEM', order.id, { status: OrderStatus.EXPIRED }, 'SYSTEM');
    return res.status(400).json({
      error: 'Waktu pembayaran untuk pesanan ini telah kedaluwarsa (melebihi 10 menit). Pesanan ditandai sebagai KEDALUWARSA dan tidak dapat diproses lagi.'
    });
  }

  if (order.status === OrderStatus.EXPIRED) {
    return res.status(400).json({
      error: 'Pesanan ini telah kedaluwarsa dan tidak dapat menerima bukti pembayaran lagi.'
    });
  }

  if (order.status === OrderStatus.CANCELLED) {
    return res.status(400).json({
      error: 'Pesanan ini telah dibatalkan dan tidak dapat menerima bukti pembayaran.'
    });
  }

  try {
    const updated = await foodDb.updateOrder(
      'CUSTOMER',
      req.params.id,
      {
        paymentProof,
        status: OrderStatus.WAITING_PAYMENT_VERIFICATION
      },
      'CUSTOMER'
    );
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Driver delivery proof upload - Protected
orderRouter.post('/:id/upload-delivery', requireRole(['DRIVER', 'ADMIN']), async (req: Request, res: Response) => {
  const { deliveryProof } = req.body;
  if (!deliveryProof) {
    return res.status(400).json({ error: 'Bukti foto pengantaran wajib disertakan.' });
  }

  const order = await foodDb.findOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  }

  const user = req.user!;
  if (user.role === 'DRIVER') {
    if (order.driverId !== user.entityId && order.driverId !== user.userId) {
      return res.status(403).json({ error: 'Akses ditolak: Anda bukan kurir yang ditugaskan untuk pesanan ini.' });
    }
  }

  try {
    const updated = await foodDb.updateOrder(
      user.userId || user.entityId || 'driver',
      req.params.id,
      {
        deliveryProof,
        status: OrderStatus.COMPLETED
      },
      user.role
    );
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
