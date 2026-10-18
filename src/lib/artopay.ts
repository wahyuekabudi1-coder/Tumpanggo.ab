/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ArtoPay Payment Gateway Service Module
 * Handles Payment Intent creation, dynamic QRIS generation,
 * webhook HMAC signature validation, idempotency guards, and payment verification.
 */

import crypto from 'crypto';
import { artopayConfig } from '../server/config';

export interface CreatePaymentIntentParams {
  orderId: string;
  amount: number;
  currency?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  serviceType: 'FOOD' | 'SHOP';
  description?: string;
  expiryMinutes?: number;
  callbackUrl?: string;
  returnUrl?: string;
}

export interface PaymentIntentResult {
  success: boolean;
  id: string;
  paymentIntentId: string;
  orderId: string;
  serviceType: 'FOOD' | 'SHOP';
  amount: number;
  currency: string;
  checkoutUrl: string;
  qrString?: string;
  clientSecret?: string;
  customerToken?: string;
  publicKey?: string;
  sandbox?: boolean;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
  gatewayConfigured: boolean;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  reason?: string;
}

export interface ArtoPayWebhookPayload {
  event?: string;
  data?: {
    paymentIntentId?: string;
    id?: string;
    orderId?: string;
    referenceId?: string;
    serviceType?: 'FOOD' | 'SHOP';
    amount?: number | string;
    currency?: string;
    status: 'PAID' | 'SUCCESS' | 'SETTLED' | 'PENDING' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
    paymentMethod?: string;
    paidAt?: string;
    metadata?: Record<string, any>;
  };
  // Flat format fallback
  paymentIntentId?: string;
  id?: string;
  orderId?: string;
  referenceId?: string;
  serviceType?: 'FOOD' | 'SHOP';
  amount?: number | string;
  currency?: string;
  status?: string;
  paidAt?: string;
  metadata?: Record<string, any>;
}

export class ArtoPayService {
  /**
   * Generates a new Payment Intent through ArtoPay Payment Link API.
   * Conforms to official ArtoPay API spec (/v1.1/payment-intents & /v1/payment-intents).
   * Enforces strict server-side nominal validation.
   * Never generates fake demo IDs or simulated transactions for customer flows.
   */
  public static async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
    const { orderId, amount, serviceType, customerName, customerPhone, customerEmail } = params;

    // 1. Mandatory server-side financial validations
    const cleanOrderId = typeof orderId === 'string' ? orderId.trim() : '';
    if (!cleanOrderId) {
      throw new Error('Order ID wajib disertakan dan berupa string yang valid (tidak boleh kosong).');
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error(`Nominal pembayaran tidak valid: Rp ${amount}. Nominal harus berupa bilangan bulat positif.`);
    }

    const currency = (params.currency || 'IDR').toUpperCase();
    if (currency !== 'IDR') {
      throw new Error(`Mata uang "${currency}" tidak didukung. ArtoPay QRIS hanya mendukung mata uang IDR.`);
    }

    const expiryMinutes = params.expiryMinutes || artopayConfig.defaultExpiryMinutes || 15;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
    const createdAt = new Date().toISOString();

    // 2. Strict credentials check - No fake or demo payment intent if credentials not configured
    if (!artopayConfig.secretKey) {
      throw new Error(
        'Kredensial gateway ArtoPay belum dikonfigurasi (ARTOPAY_SECRET_KEY belum disetel di Environment Variables). ' +
        'Silakan masukkan Secret Key resmi dari Dashboard ArtoPay untuk mengaktifkan pembuatan QRIS dinamis.'
      );
    }

    // 3. Official ArtoPay Gateway call
    // ArtoPay API contract requires top-level orderId in request body
    const payload = {
      orderId: cleanOrderId,
      amount: String(amount),
      currency: 'IDR',
      customerId: customerPhone ? customerPhone.replace(/\D/g, '') : `cust_${Date.now()}`,
      description: params.description || `Pembayaran tumpangGo ${serviceType} #${cleanOrderId}`,
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      customerEmail: customerEmail || undefined,
      callbackUrl: params.callbackUrl,
      returnUrl: params.returnUrl,
      metadata: {
        orderId: cleanOrderId,
        serviceType: serviceType,
        customerName: customerName,
        customerPhone: customerPhone,
        customerEmail: customerEmail || undefined
      }
    };

    const headers = {
      'Content-Type': 'application/json',
      'X-Secret-Key': artopayConfig.secretKey
    };

    let response: any = null;
    try {
      response = await fetch(`${artopayConfig.baseUrl}/v1.1/payment-intents`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
    } catch (err: any) {
      throw new Error(`Gagal menghubungi server gateway ArtoPay (${artopayConfig.baseUrl}): ${err?.message || 'Koneksi jaringan gagal'}`);
    }

    if (!response.ok) {
      const status = response.status;
      let errDetail = '';
      try {
        const errJson = await response.json();
        errDetail = errJson.message || errJson.responseMessage || errJson.error || JSON.stringify(errJson);
      } catch {
        errDetail = await response.text();
      }
      throw new Error(`Gateway ArtoPay menolak pembuatan transaksi (HTTP ${status}): ${errDetail || 'Permintaan tidak dapat diproses'}`);
    }

    const resJson = await response.json();
    const d = resJson.responseData || resJson.data || resJson;
    const returnedId = String(d.id || d.paymentIntentId || d.transactionId || '').trim();
    const clientSecret = d.secret || d.clientSecret || '';
    const customerToken = d.customerToken || d.token || '';

    if (!returnedId) {
      throw new Error('Gateway ArtoPay merespons berhasil namun tidak mengembalikan ID transaksi yang valid.');
    }

    // Official ArtoPay SDK / Gateway checkout URL
    const returnedUrl = d.checkoutUrl || d.paymentUrl || `${artopayConfig.environment === 'production' ? 'https://pay.arto-pay.com/arto-pay' : 'https://pay-sandbox.arto-pay.com/arto-pay'}/${returnedId}`;

    return {
      success: true,
      id: returnedId,
      paymentIntentId: returnedId,
      orderId,
      serviceType,
      amount,
      currency: 'IDR',
      checkoutUrl: returnedUrl,
      qrString: d.qrString || d.qrCodeUrl || undefined,
      clientSecret,
      customerToken,
      publicKey: artopayConfig.publicKey || undefined,
      sandbox: artopayConfig.environment !== 'production',
      status: 'PENDING',
      expiresAt: d.expiresAt || expiresAt,
      createdAt,
      gatewayConfigured: true
    };
  }

  /**
   * Verifies authenticity of ArtoPay Webhook request.
   * Uses HMAC-SHA256 signature verification with timing-attack prevention.
   */
  public static verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string | undefined,
    secretOverride?: string
  ): WebhookVerificationResult {
    const secret = secretOverride || artopayConfig.webhookSecret || artopayConfig.secretKey;
    const isProduction = artopayConfig.isProduction || artopayConfig.environment === 'production';

    if (!secret) {
      if (isProduction) {
        return { isValid: false, reason: 'ARTOPAY_WEBHOOK_SECRET belum dikonfigurasi di server.' };
      }
      console.warn('[ArtoPay Security Warning] ARTOPAY_WEBHOOK_SECRET belum disetel pada mode development/sandbox.');
      return { isValid: true };
    }

    if (!signatureHeader || signatureHeader.trim().length === 0) {
      return { isValid: false, reason: 'Header tanda tangan webhook (x-artopay-signature) tidak ditemukan.' };
    }

    try {
      let timestamp = '';
      let expectedHmac = signatureHeader.trim();

      // Support formatted signature: "t=1729177200,v1=abcdef123456..."
      if (signatureHeader.includes('t=') && signatureHeader.includes('v1=')) {
        const parts = signatureHeader.split(',');
        for (const part of parts) {
          const trimmed = part.trim();
          if (trimmed.startsWith('t=')) timestamp = trimmed.substring(2);
          if (trimmed.startsWith('v1=')) expectedHmac = trimmed.substring(3);
        }
      }

      const payloadToSign = timestamp ? `${timestamp}.${rawBody}` : rawBody;
      const calculatedHmac = crypto.createHmac('sha256', secret).update(payloadToSign).digest('hex');

      const hmacBuf = Buffer.from(calculatedHmac, 'hex');
      const expectedBuf = Buffer.from(expectedHmac, 'hex');

      if (hmacBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(hmacBuf, expectedBuf)) {
        return { isValid: false, reason: 'Tanda tangan HMAC-SHA256 tidak cocok (Invalid Signature).' };
      }

      // Check replay attack tolerance (300 seconds / 5 minutes)
      if (timestamp) {
        const tsNum = parseInt(timestamp, 10);
        if (!isNaN(tsNum)) {
          const nowSec = Math.floor(Date.now() / 1000);
          if (Math.abs(nowSec - tsNum) > 300) {
            return { isValid: false, reason: 'Stempel waktu (timestamp) webhook kedaluwarsa atau terindikasi replay attack.' };
          }
        }
      }

      return { isValid: true };
    } catch (err: any) {
      return { isValid: false, reason: `Gagal memverifikasi tanda tangan webhook: ${err.message}` };
    }
  }

  /**
   * Actively queries the payment status from ArtoPay Gateway.
   */
  public static async checkPaymentStatus(paymentIntentId: string): Promise<{
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
    paidAt?: string;
    amount?: number;
    raw?: any;
  }> {
    if (!paymentIntentId) {
      return { status: 'PENDING' };
    }

    if (artopayConfig.secretKey) {
      try {
        const headers = {
          'X-Secret-Key': artopayConfig.secretKey
        };

        const response = await fetch(`${artopayConfig.baseUrl}/v1.1/payment-intents/${paymentIntentId}`, { headers });
        if (response.ok) {
          const json = await response.json();
          const d = json.data || json;
          const gatewayStatus = (d.status || d.transactionStatus || d.transaction_status || '').toUpperCase();
          if (['PAID', 'SUCCESS', 'SETTLED', 'CAPTURE', 'SETTLEMENT'].includes(gatewayStatus)) {
            return { 
              status: 'SUCCESS', 
              paidAt: d.paidAt || d.settlementTime || new Date().toISOString(), 
              amount: d.amount ? Number(d.amount) : undefined, 
              raw: d 
            };
          }
          if (['EXPIRED', 'TIMED_OUT', 'EXPIRE'].includes(gatewayStatus)) {
            return { status: 'EXPIRED', raw: d };
          }
          if (['FAILED', 'CANCELLED', 'REJECTED', 'DENY', 'CANCEL', 'FAILURE'].includes(gatewayStatus)) {
            return { status: 'FAILED', raw: d };
          }
        }
      } catch (err: any) {
        console.warn(`[ArtoPay Status Check] Error querying ${paymentIntentId}:`, err.message);
      }
    }

    return { status: 'PENDING' };
  }
}
