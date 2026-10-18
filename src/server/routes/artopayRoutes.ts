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
 * GET /api/artopay/config-status
 * Checks status of ArtoPay gateway credentials and integration readiness.
 * Safe public diagnostics: does not reveal secret keys.
 */
artopayRouter.get('/config-status', (_req: Request, res: Response) => {
  const hasSecretKey = Boolean(artopayConfig.secretKey);
  const hasPublicKey = Boolean(artopayConfig.publicKey);
  const hasWebhookSecret = Boolean(artopayConfig.webhookSecret);
  const isProduction = artopayConfig.isProduction || artopayConfig.environment === 'production';

  const missing: string[] = [];
  if (!hasSecretKey) missing.push('ARTOPAY_SECRET_KEY');
  if (!hasPublicKey) missing.push('ARTOPAY_PUBLIC_KEY');
  if (!hasWebhookSecret) missing.push('ARTOPAY_WEBHOOK_SECRET');

  return res.json({
    gatewayConfigured: hasSecretKey && hasPublicKey,
    environment: artopayConfig.environment,
    isProduction,
    hasSecretKey,
    hasPublicKey,
    hasWebhookSecret,
    missingCredentials: missing,
    status: hasSecretKey && hasPublicKey ? 'READY' : 'PREPARATION_PENDING_CREDENTIALS',
    message: hasSecretKey && hasPublicKey
      ? 'Gateway ArtoPay telah terkonfigurasi dan siap memproses transaksi.'
      : 'Tahap persiapan: Kredensial ArtoPay belum diisi di Environment Variables. Alur aplikasi, validasi server, dan database telah siap.'
  });
});

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

/**
 * POST /api/artopay/simulate-payment
 * Safe testing endpoint for Sandbox/Preview mode.
 * Dispatches an internal verified webhook transition for the order.
 */
artopayRouter.post('/simulate-payment', async (req: Request, res: Response) => {
  try {
    const { orderId, paymentIntentId } = req.body;
    if (!orderId && !paymentIntentId) {
      return res.status(400).json({ error: 'orderId atau paymentIntentId wajib diisi.' });
    }

    if (process.env.NODE_ENV === 'production' || (artopayConfig.isProduction && artopayConfig.environment === 'production')) {
      return res.status(403).json({ error: 'Endpoint simulasi pembayaran dilarang dan dinonaktifkan di lingkungan produksi.' });
    }

    let foodOrder = orderId ? await foodDb.findOrder(String(orderId).trim()) : undefined;
    let shopOrder: any = undefined;

    if (!foodOrder && orderId) {
      shopOrder = await shopDb.findOrderById(String(orderId).trim()) || shopDb.getOrders().find(o => o.orderNumber === String(orderId).trim());
    }

    if (!foodOrder && !shopOrder && paymentIntentId) {
      foodOrder = foodDb.getOrders().find(o => o.artopayPaymentId === paymentIntentId);
      if (!foodOrder) {
        shopOrder = shopDb.getOrders().find(o => o.artopayPaymentId === paymentIntentId);
      }
    }

    if (!foodOrder && !shopOrder) {
      return res.status(404).json({ error: 'Pesanan untuk pembayaran ini tidak ditemukan.' });
    }

    const isFood = !!foodOrder;
    const target = isFood ? foodOrder! : shopOrder!;
    const serverTotal = Math.round(Number(target.total));
    const paidAt = new Date().toISOString();

    if (isFood) {
      await foodDb.updateOrder('SIMULATED_ARTOPAY_WEBHOOK', target.id, {
        status: OrderStatus.PAYMENT_VERIFIED,
        paymentMethod: 'ARTOPAY_QRIS',
        artopayStatus: 'SUCCESS',
        paymentVerifiedAt: paidAt
      }, 'SYSTEM');
    } else {
      await shopDb.verifyPayment('SIMULATED_ARTOPAY_WEBHOOK', target.id, true);
      await shopDb.attachArtopayPayment(target.id, {
        paymentMethod: 'ARTOPAY_QRIS',
        artopayPaymentId: paymentIntentId || target.artopayPaymentId || `sim_${Date.now()}`,
        artopayCheckoutUrl: target.artopayCheckoutUrl || '',
        artopayStatus: 'SUCCESS',
        artopayExpiredAt: target.artopayExpiredAt
      });
    }

    return res.json({
      success: true,
      orderId: target.id,
      amount: serverTotal,
      status: 'PAID',
      message: 'Pembayaran ArtoPay berhasil disimulasikan dan diverifikasi.'
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Gagal mensimulasikan pembayaran.' });
  }
});

/**
 * GET /api/artopay/checkout/:paymentIntentId
 * GET /api/artopay/demo-pay/:paymentIntentId
 * Interactive hosted payment checkout page for ArtoPay Payment Link in Preview / Sandbox.
 */
const renderCheckoutPage = async (req: Request, res: Response) => {
  const paymentIntentId = req.params.paymentIntentId;
  const orderParam = (req.query.order as string) || '';
  const amtParam = Number(req.query.amt) || 0;
  const serviceParam = ((req.query.service as string) || 'FOOD').toUpperCase();

  let foodOrder = orderParam ? await foodDb.findOrder(orderParam) : undefined;
  let shopOrder: any = undefined;

  if (!foodOrder && orderParam) {
    shopOrder = await shopDb.findOrderById(orderParam) || shopDb.getOrders().find(o => o.orderNumber === orderParam);
  }

  if (!foodOrder && !shopOrder && paymentIntentId) {
    foodOrder = foodDb.getOrders().find(o => o.artopayPaymentId === paymentIntentId);
    if (!foodOrder) {
      shopOrder = shopDb.getOrders().find(o => o.artopayPaymentId === paymentIntentId);
    }
  }

  const isFood = !!foodOrder;
  const targetOrder = isFood ? foodOrder : shopOrder;
  const resolvedOrderId = targetOrder ? targetOrder.id : orderParam || paymentIntentId;
  const resolvedAmount = targetOrder ? Math.round(Number(targetOrder.total)) : amtParam || 10000;
  const customerName = targetOrder ? (targetOrder.customerName || 'Pelanggan TumpangGo') : 'Pelanggan TumpangGo';
  const serviceTitle = isFood || serviceParam === 'FOOD' ? 'Tumpang Food' : 'Tumpang Shop';
  const formattedAmount = `Rp ${resolvedAmount.toLocaleString('id-ID')}`;
  const isProduction = artopayConfig.isProduction && artopayConfig.environment === 'production';

  // Use genuine QR code if provided by gateway, otherwise display active payment channels
  const qrString = targetOrder?.artopayQrString || (req.query.qr as string) || '';
  const qrImageUrl = qrString ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(qrString)}` : '';

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Checkout Pembayaran ArtoPay - TumpangGo</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: linear-gradient(135deg, #064E3B 0%, #065F46 40%, #047857 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      color: #1F2937;
    }
    .card {
      background: #FFFFFF;
      max-width: 440px;
      width: 100%;
      border-radius: 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
      overflow: hidden;
      animation: fadeIn 0.3s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .header {
      background: #F0FDF4;
      padding: 20px 24px;
      border-bottom: 1px solid #DCFCE7;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-logo {
      width: 36px;
      height: 36px;
      background: #15803D;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 800;
      font-size: 18px;
    }
    .brand-title {
      font-weight: 800;
      font-size: 16px;
      color: #166534;
      letter-spacing: -0.02em;
    }
    .brand-sub {
      font-size: 11px;
      color: #047857;
      font-weight: 600;
    }
    .secure-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: #DCFCE7;
      color: #166534;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
    }
    .body {
      padding: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .order-meta {
      width: 100%;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 14px;
      padding: 12px 16px;
      margin-bottom: 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
    }
    .amount-box {
      margin-bottom: 18px;
    }
    .amount-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748B;
      margin-bottom: 4px;
    }
    .amount-val {
      font-size: 28px;
      font-weight: 800;
      color: #0F172A;
      font-family: 'Space Grotesk', sans-serif;
    }
    .qr-container {
      background: #FFFFFF;
      padding: 14px;
      border-radius: 18px;
      border: 2px solid #E2E8F0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.06);
      margin-bottom: 14px;
      position: relative;
    }
    .qr-image {
      display: block;
      width: 200px;
      height: 200px;
      border-radius: 10px;
    }
    .qr-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #F1F5F9;
      color: #475569;
      font-size: 11px;
      font-weight: 700;
      padding: 5px 12px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    .status-box {
      width: 100%;
      padding: 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .status-pending {
      background: #FEF3C7;
      color: #92400E;
      border: 1px solid #FDE68A;
    }
    .status-success {
      background: #DCFCE7;
      color: #166534;
      border: 1px solid #BBF7D0;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      background: #D97706;
      border-radius: 50%;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0% { transform: scale(0.95); opacity: 0.8; }
      50% { transform: scale(1.3); opacity: 1; }
      100% { transform: scale(0.95); opacity: 0.8; }
    }
    .actions {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .btn {
      width: 100%;
      padding: 12px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-decoration: none;
    }
    .btn-simulate {
      background: #16A34A;
      color: white;
      box-shadow: 0 4px 10px rgba(22, 163, 74, 0.25);
    }
    .btn-simulate:hover { background: #15803D; }
    .btn-secondary {
      background: #F1F5F9;
      color: #334155;
    }
    .btn-secondary:hover { background: #E2E8F0; }
    .footer-note {
      margin-top: 16px;
      font-size: 11px;
      color: #94A3B8;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="brand">
        <div class="brand-logo">T</div>
        <div style="text-align: left;">
          <div class="brand-title">tumpangGo</div>
          <div class="brand-sub">${serviceTitle} Checkout</div>
        </div>
      </div>
      <div class="secure-badge">
        🔒 ArtoPay Verified
      </div>
    </div>

    <div class="body">
      <div class="order-meta">
        <div>
          <div style="color: #64748B; font-size: 11px;">Nomor Pesanan</div>
          <div style="font-weight: 700; color: #0F172A;">${resolvedOrderId}</div>
        </div>
        <div style="text-align: right;">
          <div style="color: #64748B; font-size: 11px;">Pelanggan</div>
          <div style="font-weight: 700; color: #0F172A;">${customerName}</div>
        </div>
      </div>

      <div class="amount-box">
        <div class="amount-label">Total Tagihan</div>
        <div class="amount-val">${formattedAmount}</div>
      </div>

      ${qrImageUrl ? `
      <div class="qr-container">
        <img class="qr-image" src="${qrImageUrl}" alt="ArtoPay QRIS Code" />
      </div>
      <div class="qr-badge">
        📱 Scan menggunakan GoPay, OVO, Dana, ShopeePay, atau m-Banking
      </div>
      ` : `
      <div style="width: 100%; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; padding: 14px; margin-bottom: 16px; text-align: left;">
        <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 8px;">Metode Pembayaran ArtoPay:</div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; color: #334155;">
          <span style="background: white; border: 1px solid #CBD5E1; padding: 4px 8px; border-radius: 6px; font-weight: 600;">QRIS Dinamis</span>
          <span style="background: white; border: 1px solid #CBD5E1; padding: 4px 8px; border-radius: 6px; font-weight: 600;">Virtual Account</span>
          <span style="background: white; border: 1px solid #CBD5E1; padding: 4px 8px; border-radius: 6px; font-weight: 600;">GoPay / ShopeePay</span>
          <span style="background: white; border: 1px solid #CBD5E1; padding: 4px 8px; border-radius: 6px; font-weight: 600;">Kartu Debit / Kredit</span>
        </div>
      </div>
      `}

      <div id="status-box" class="status-box status-pending">
        <div class="pulse-dot" id="pulse-dot"></div>
        <span id="status-text">Menunggu Pembayaran ArtoPay...</span>
      </div>

      <div class="actions">
        ${!isProduction ? `
        <button id="btn-simulate" type="button" class="btn btn-simulate" onclick="simulatePayment()">
          ⚡ Verifikasi Pembayaran (Sandbox Test)
        </button>
        ` : ''}
        <button type="button" class="btn btn-secondary" onclick="checkStatusManual()">
          🔄 Periksa Status Sekarang
        </button>
        <button type="button" class="btn btn-secondary" onclick="returnToApp()">
          ⬅ Kembali ke Aplikasi TumpangGo
        </button>
      </div>

      <div class="footer-note">
        Pembayaran diamankan dengan enkripsi standar ArtoPay Payment Gateway. Halaman akan otomatis beralih setelah transaksi terkonfirmasi.
      </div>
    </div>
  </div>

  <script>
    const orderId = ${JSON.stringify(resolvedOrderId)};
    const paymentIntentId = ${JSON.stringify(paymentIntentId)};
    const serviceType = ${JSON.stringify(serviceParam)};
    let isFinished = false;

    async function checkStatus() {
      if (isFinished) return;
      try {
        const res = await fetch('/api/artopay/status/' + encodeURIComponent(orderId) + '?serviceType=' + encodeURIComponent(serviceType));
        if (res.ok) {
          const data = await res.json();
          if (data.isPaid || data.status === 'PAID' || data.status === 'PAYMENT_VERIFIED') {
            onPaymentSuccess();
          }
        }
      } catch (err) {
        console.warn('Status poll error:', err);
      }
    }

    async function checkStatusManual() {
      const btn = event.target;
      btn.innerText = 'Memeriksa...';
      await checkStatus();
      setTimeout(() => { btn.innerText = '🔄 Periksa Status Sekarang'; }, 1000);
    }

    async function simulatePayment() {
      const btn = document.getElementById('btn-simulate');
      btn.disabled = true;
      btn.innerText = 'Memproses simulasi...';
      try {
        const res = await fetch('/api/artopay/simulate-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: orderId,
            paymentIntentId: paymentIntentId,
            serviceType: serviceType
          })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          onPaymentSuccess();
        } else {
          alert(data.error || 'Gagal mensimulasikan pembayaran.');
          btn.disabled = false;
          btn.innerText = '⚡ Simulasikan Pembayaran Berhasil (Uji Coba Sandbox)';
        }
      } catch (err) {
        alert('Terjadi kesalahan jaringan.');
        btn.disabled = false;
        btn.innerText = '⚡ Simulasikan Pembayaran Berhasil (Uji Coba Sandbox)';
      }
    }

    function onPaymentSuccess() {
      isFinished = true;
      const statusBox = document.getElementById('status-box');
      const pulseDot = document.getElementById('pulse-dot');
      const statusText = document.getElementById('status-text');
      const simBtn = document.getElementById('btn-simulate');

      if (pulseDot) pulseDot.style.display = 'none';
      if (statusBox) {
        statusBox.className = 'status-box status-success';
        statusText.innerHTML = '✅ Pembayaran Berhasil Terverifikasi!';
      }
      if (simBtn) {
        simBtn.style.display = 'none';
      }

      // Notify parent window if in iframe or opened popup
      try {
        if (window.opener) {
          window.opener.postMessage({ type: 'PAYMENT_SUCCESS', orderId: orderId, paymentIntentId: paymentIntentId }, '*');
        }
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'PAYMENT_SUCCESS', orderId: orderId, paymentIntentId: paymentIntentId }, '*');
        }
      } catch (e) {}

      setTimeout(() => {
        returnToApp();
      }, 2500);
    }

    function returnToApp() {
      if (window.opener) {
        window.close();
      } else if (history.length > 1) {
        history.back();
      } else {
        window.location.href = '/';
      }
    }

    // Auto-poll status every 3 seconds
    setInterval(checkStatus, 3000);
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
};

artopayRouter.get('/checkout/:paymentIntentId', renderCheckoutPage);
artopayRouter.get('/demo-pay/:paymentIntentId', renderCheckoutPage);
