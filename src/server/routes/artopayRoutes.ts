/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ArtoPay Payment Gateway API Routes
 * Endpoints for Payment Intent creation, Webhook handling, and on-demand status verification.
 */

import { Router, Request, Response } from 'express';
import { ArtoPayService } from '../../lib/artopay';
import { foodDb } from '../db';
import { shopDb } from '../shopDb';
import { OrderStatus } from '../../types';
import { ShopPaymentStatus, ShopOrderStatus } from '../../types/shop';
import { artopayConfig } from '../config';

export const artopayRouter = Router();

// In-memory idempotency cache for webhook notifications
const processedWebhookKeys = new Set<string>();

/**
 * POST /api/artopay/payment-intent
 * Creates an ArtoPay dynamic QRIS payment intent.
 * Strict server-side nominal extraction from database records.
 */
artopayRouter.post('/payment-intent', async (req: Request, res: Response) => {
  try {
    const { orderId, serviceType, customerPhone, amount: clientAmount } = req.body;

    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ error: 'orderId wajib diisi.' });
    }

    const type = (serviceType || '').toUpperCase();
    if (type !== 'FOOD' && type !== 'SHOP') {
      return res.status(400).json({ error: 'serviceType harus bernilai "FOOD" atau "SHOP".' });
    }

    if (type === 'FOOD') {
      const order = await foodDb.findOrder(orderId.trim());
      if (!order) {
        return res.status(404).json({ error: `Pesanan Tumpang Food dengan ID "${orderId}" tidak ditemukan.` });
      }

      // Check order status
      if (order.status !== OrderStatus.WAITING_PAYMENT) {
        if (order.status === OrderStatus.PAYMENT_VERIFIED || order.status === OrderStatus.COOKING || order.status === OrderStatus.READY_FOR_PICKUP || order.status === OrderStatus.ORDER_PICKED_UP || order.status === OrderStatus.DELIVERED || order.status === OrderStatus.COMPLETED) {
          return res.status(400).json({ error: 'Pesanan ini sudah terbayar / lunas.' });
        }
        if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.EXPIRED) {
          return res.status(400).json({ error: `Pesanan tidak dapat dibayar karena berstatus ${order.status}.` });
        }
      }

      // Expiration check
      if (order.paymentExpiresAt && new Date(order.paymentExpiresAt).getTime() < Date.now()) {
        return res.status(400).json({ error: 'Batas waktu pembayaran pesanan telah habis (Expired).' });
      }

      // Server-side financial enforcement: reject manipulated client amount
      const serverAmount = Math.round(Number(order.total));
      if (clientAmount !== undefined && Number(clientAmount) !== serverAmount) {
        return res.status(400).json({ 
          error: `Manipulasi nominal terdeteksi: nominal client (${clientAmount}) berbeda dengan total server (${serverAmount}).` 
        });
      }

      // Create Payment Intent via ArtoPay
      const intent = await ArtoPayService.createPaymentIntent({
        orderId: order.id,
        amount: serverAmount,
        currency: 'IDR',
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        serviceType: 'FOOD',
        description: `Pembayaran Tumpang Food #${order.id} (${order.merchantName})`,
        expiryMinutes: 15
      });

      // Attach ArtoPay payment details to Food Order
      await foodDb.updateOrder('SYSTEM_ARTOPAY', order.id, {
        paymentMethod: 'ARTOPAY_QRIS',
        artopayPaymentId: intent.paymentIntentId,
        artopayCheckoutUrl: intent.checkoutUrl,
        artopayStatus: 'PENDING',
        artopayExpiredAt: intent.expiresAt
      }, 'SYSTEM');

      return res.status(200).json(intent);

    } else {
      // SHOP
      let order = await shopDb.findOrderById(orderId.trim());
      if (!order && customerPhone) {
        order = await shopDb.findOrderByNumberAndPhone(orderId.trim(), String(customerPhone).trim());
      }

      if (!order) {
        return res.status(404).json({ error: `Pesanan Tumpang Shop dengan ID "${orderId}" tidak ditemukan.` });
      }

      // Check payment status
      if (order.paymentStatus === ShopPaymentStatus.PAID) {
        return res.status(400).json({ error: 'Pesanan belanja ini sudah lunas.' });
      }

      if (order.paymentStatus === ShopPaymentStatus.EXPIRED || order.orderStatus === ShopOrderStatus.CANCELLED) {
        return res.status(400).json({ error: 'Pesanan belanja sudah kedaluwarsa atau dibatalkan.' });
      }

      // Expiration check
      if (order.paymentExpiresAt && new Date(order.paymentExpiresAt).getTime() < Date.now()) {
        return res.status(400).json({ error: 'Batas waktu pembayaran belanja telah habis (Expired).' });
      }

      // Server-side financial enforcement: reject manipulated client amount
      const serverAmount = Math.round(Number(order.total));
      if (clientAmount !== undefined && Number(clientAmount) !== serverAmount) {
        return res.status(400).json({ 
          error: `Manipulasi nominal terdeteksi: nominal client (${clientAmount}) berbeda dengan total server (${serverAmount}).` 
        });
      }

      // Create Payment Intent via ArtoPay
      const intent = await ArtoPayService.createPaymentIntent({
        orderId: order.orderNumber || order.id,
        amount: serverAmount,
        currency: 'IDR',
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        serviceType: 'SHOP',
        description: `Pembayaran Tumpang Shop #${order.orderNumber || order.id}`,
        expiryMinutes: 20
      });

      // Attach ArtoPay payment details to Shop Order
      await shopDb.attachArtopayPayment(order.id, {
        paymentMethod: 'ARTOPAY_QRIS',
        artopayPaymentId: intent.paymentIntentId,
        artopayCheckoutUrl: intent.checkoutUrl,
        artopayStatus: 'PENDING',
        artopayExpiredAt: intent.expiresAt
      });

      return res.status(200).json(intent);
    }
  } catch (err: any) {
    console.error('[ArtoPay Create Intent Error]', err);
    return res.status(500).json({ error: err.message || 'Gagal membuat transaksi ArtoPay.' });
  }
});

/**
 * POST /api/artopay/webhook
 * Receives and processes real-time transaction updates from ArtoPay.
 * Validates HMAC signature, prevents replay attacks, checks idempotency, and verifies order amounts.
 */
artopayRouter.post('/webhook', async (req: Request, res: Response) => {
  try {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const signature = (
      req.headers['x-artopay-signature'] || 
      req.headers['x-signature'] || 
      req.headers['artopay-signature']
    ) as string | undefined;

    // 1. Signature Verification
    const sigCheck = ArtoPayService.verifyWebhookSignature(rawBody, signature);
    if (!sigCheck.isValid) {
      console.warn(`[ArtoPay Webhook Unauthorized] Invalid signature: ${sigCheck.reason}`);
      return res.status(401).json({ error: 'Tanda tangan webhook tidak sah (Unauthorized).', detail: sigCheck.reason });
    }

    const payload = req.body;
    const event = payload.event || 'payment.update';
    const data = payload.data || payload;

    const paymentIntentId = String(data.paymentIntentId || data.id || '').trim();
    const orderId = String(data.orderId || data.referenceId || '').trim();
    const serviceType = (data.serviceType || '').toUpperCase();
    const amount = Number(data.amount);
    const currency = (data.currency || 'IDR').toUpperCase();
    const rawStatus = (data.status || '').toUpperCase();

    if (!paymentIntentId || !orderId) {
      return res.status(400).json({ error: 'Format payload webhook tidak lengkap: paymentIntentId atau orderId hilang.' });
    }

    // 2. Idempotency Check
    const idempotencyKey = `${paymentIntentId}_${rawStatus}`;
    if (processedWebhookKeys.has(idempotencyKey)) {
      return res.status(200).json({
        received: true,
        idempotent: true,
        message: 'Notifikasi webhook untuk status ini sudah diproses sebelumnya.'
      });
    }

    // 3. Locate Target Order (Food vs Shop)
    let foodOrder = await foodDb.findOrder(orderId);
    let shopOrder: any = undefined;

    if (!foodOrder) {
      shopOrder = await shopDb.findOrderById(orderId);
      if (!shopOrder && orderId) {
        shopOrder = shopDb.getOrders().find(o => o.orderNumber === orderId || o.artopayPaymentId === paymentIntentId);
      }
    }

    if (!foodOrder && !shopOrder) {
      // Search by artopayPaymentId as fallback
      foodOrder = foodDb.getOrders().find(o => o.artopayPaymentId === paymentIntentId);
      if (!foodOrder) {
        shopOrder = shopDb.getOrders().find(o => o.artopayPaymentId === paymentIntentId);
      }
    }

    if (!foodOrder && !shopOrder) {
      return res.status(404).json({ 
        error: `Pesanan dengan ID "${orderId}" atau paymentIntentId "${paymentIntentId}" tidak ditemukan.` 
      });
    }

    const isFood = !!foodOrder;
    const targetOrder = isFood ? foodOrder! : shopOrder!;
    const serverTotal = Math.round(Number(targetOrder.total));

    // 4. Strict Financial Cross-Verification
    if (Number.isNaN(amount) || amount !== serverTotal) {
      console.error(`[ArtoPay Security Alert] Nominal mismatch on order ${orderId}! Expected Rp ${serverTotal}, received Rp ${amount}`);
      return res.status(400).json({ 
        error: `Nominal pembayaran (Rp ${amount}) tidak cocok dengan total tagihan pesanan (Rp ${serverTotal}).` 
      });
    }

    if (currency !== 'IDR') {
      return res.status(400).json({ error: `Mata uang tidak valid (${currency}). Harus IDR.` });
    }

    // 5. Status Transitioning
    const isPaid = ['PAID', 'SUCCESS', 'SETTLED'].includes(rawStatus);
    const isFailedOrExpired = ['EXPIRED', 'FAILED', 'CANCELLED', 'REJECTED'].includes(rawStatus);

    if (isFood) {
      if (isPaid) {
        // Only advance if currently waiting for payment
        if (
          targetOrder.status === OrderStatus.WAITING_PAYMENT || 
          targetOrder.status === OrderStatus.WAITING_PAYMENT_VERIFICATION
        ) {
          await foodDb.updateOrder('SYSTEM_ARTOPAY_WEBHOOK', targetOrder.id, {
            status: OrderStatus.PAYMENT_VERIFIED,
            paymentMethod: 'ARTOPAY_QRIS',
            artopayStatus: 'SUCCESS',
            paymentVerifiedAt: data.paidAt || new Date().toISOString()
          }, 'SYSTEM');
          console.log(`[ArtoPay Webhook] Food Order ${targetOrder.id} successfully marked as PAID.`);
        }
      } else if (isFailedOrExpired) {
        if (targetOrder.status === OrderStatus.WAITING_PAYMENT) {
          await foodDb.updateOrder('SYSTEM_ARTOPAY_WEBHOOK', targetOrder.id, {
            artopayStatus: rawStatus === 'EXPIRED' ? 'EXPIRED' : 'FAILED'
          }, 'SYSTEM');
        }
      }
    } else {
      // SHOP
      if (isPaid) {
        if (targetOrder.paymentStatus !== ShopPaymentStatus.PAID) {
          await shopDb.verifyPayment('SYSTEM_ARTOPAY_WEBHOOK', targetOrder.id, true);
          await shopDb.attachArtopayPayment(targetOrder.id, {
            paymentMethod: 'ARTOPAY_QRIS',
            artopayPaymentId: paymentIntentId,
            artopayCheckoutUrl: targetOrder.artopayCheckoutUrl || '',
            artopayStatus: 'SUCCESS',
            artopayExpiredAt: targetOrder.artopayExpiredAt
          });
          console.log(`[ArtoPay Webhook] Shop Order ${targetOrder.orderNumber} successfully marked as PAID.`);
        }
      } else if (isFailedOrExpired) {
        if (targetOrder.paymentStatus === ShopPaymentStatus.UNPAID) {
          await shopDb.attachArtopayPayment(targetOrder.id, {
            paymentMethod: 'ARTOPAY_QRIS',
            artopayPaymentId: paymentIntentId,
            artopayCheckoutUrl: targetOrder.artopayCheckoutUrl || '',
            artopayStatus: rawStatus === 'EXPIRED' ? 'EXPIRED' : 'FAILED',
            artopayExpiredAt: targetOrder.artopayExpiredAt
          });
        }
      }
    }

    // 6. Record idempotency key
    processedWebhookKeys.add(idempotencyKey);

    return res.status(200).json({
      received: true,
      success: true,
      orderId: targetOrder.id,
      paymentIntentId,
      status: isPaid ? 'PAID' : rawStatus
    });

  } catch (err: any) {
    console.error('[ArtoPay Webhook Exception]', err);
    return res.status(500).json({ error: err.message || 'Gagal memproses webhook ArtoPay.' });
  }
});

/**
 * GET /api/artopay/status/:orderId
 * On-demand payment verification endpoint.
 * Actively syncs status from ArtoPay Gateway if still pending.
 */
artopayRouter.get('/status/:orderId', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.orderId.trim();
    const serviceType = ((req.query.serviceType as string) || '').toUpperCase();

    let foodOrder: any = undefined;
    let shopOrder: any = undefined;

    if (serviceType === 'SHOP') {
      shopOrder = await shopDb.findOrderById(orderId) || shopDb.getOrders().find(o => o.orderNumber === orderId);
    } else if (serviceType === 'FOOD') {
      foodOrder = await foodDb.findOrder(orderId);
    } else {
      foodOrder = await foodDb.findOrder(orderId);
      if (!foodOrder) {
        shopOrder = await shopDb.findOrderById(orderId) || shopDb.getOrders().find(o => o.orderNumber === orderId);
      }
    }

    if (!foodOrder && !shopOrder) {
      return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    }

    const isFood = !!foodOrder;
    const targetOrder = isFood ? foodOrder : shopOrder;
    const isCurrentlyPaid = isFood
      ? targetOrder.status !== OrderStatus.WAITING_PAYMENT && targetOrder.status !== OrderStatus.WAITING_PAYMENT_VERIFICATION && targetOrder.status !== OrderStatus.CANCELLED && targetOrder.status !== OrderStatus.EXPIRED
      : targetOrder.paymentStatus === ShopPaymentStatus.PAID;

    // If still pending, query gateway actively
    if (!isCurrentlyPaid && targetOrder.artopayPaymentId) {
      const liveCheck = await ArtoPayService.checkPaymentStatus(targetOrder.artopayPaymentId);
      if (liveCheck.status === 'SUCCESS') {
        if (isFood) {
          await foodDb.updateOrder('SYSTEM_ARTOPAY_POLL', targetOrder.id, {
            status: OrderStatus.PAYMENT_VERIFIED,
            paymentMethod: 'ARTOPAY_QRIS',
            artopayStatus: 'SUCCESS',
            paymentVerifiedAt: liveCheck.paidAt || new Date().toISOString()
          }, 'SYSTEM');
        } else {
          await shopDb.verifyPayment('SYSTEM_ARTOPAY_POLL', targetOrder.id, true);
          await shopDb.attachArtopayPayment(targetOrder.id, {
            paymentMethod: 'ARTOPAY_QRIS',
            artopayPaymentId: targetOrder.artopayPaymentId,
            artopayCheckoutUrl: targetOrder.artopayCheckoutUrl || '',
            artopayStatus: 'SUCCESS',
            artopayExpiredAt: targetOrder.artopayExpiredAt
          });
        }

        return res.json({
          orderId: targetOrder.id,
          serviceType: isFood ? 'FOOD' : 'SHOP',
          isPaid: true,
          status: isFood ? OrderStatus.PAYMENT_VERIFIED : ShopPaymentStatus.PAID,
          artopayStatus: 'SUCCESS'
        });
      }
    }

    return res.json({
      orderId: targetOrder.id,
      serviceType: isFood ? 'FOOD' : 'SHOP',
      isPaid: isCurrentlyPaid,
      status: isFood ? targetOrder.status : targetOrder.paymentStatus,
      artopayStatus: targetOrder.artopayStatus || (isCurrentlyPaid ? 'SUCCESS' : 'PENDING'),
      checkoutUrl: targetOrder.artopayCheckoutUrl,
      paymentIntentId: targetOrder.artopayPaymentId,
      amount: targetOrder.total
    });

  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Gagal memeriksa status pembayaran ArtoPay.' });
  }
});
