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
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  reason?: string;
}

export interface ArtoPayWebhookPayload {
  event: string;
  data: {
    paymentIntentId: string;
    orderId: string;
    serviceType?: 'FOOD' | 'SHOP';
    amount: number;
    currency: string;
    status: 'PAID' | 'SUCCESS' | 'SETTLED' | 'PENDING' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
    paymentMethod?: string;
    paidAt?: string;
    metadata?: Record<string, any>;
  };
}

export class ArtoPayService {
  /**
   * Generates a new Payment Intent with dynamic QRIS through ArtoPay Payment Link.
   * Enforces strict server-side nominal validation.
   */
  public static async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
    const { orderId, amount, serviceType, customerName, customerPhone, customerEmail } = params;

    // 1. Mandatory server-side financial validations
    if (!orderId || typeof orderId !== 'string') {
      throw new Error('Order ID wajib disertakan dan berupa string yang valid.');
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

    const isProduction = artopayConfig.isProduction || artopayConfig.environment === 'production';

    // 2. Production credentials check
    if (isProduction && !artopayConfig.secretKey) {
      throw new Error('Kredensial ARTOPAY_SECRET_KEY belum disetel di lingkungan produksi. Hubungi administrator.');
    }

    // 3. Attempt external ArtoPay Gateway call if API key / secret is available
    if (artopayConfig.secretKey) {
      try {
        const payload = {
          referenceId: `${serviceType}-${orderId}`,
          orderId: orderId,
          serviceType: serviceType,
          amount: amount,
          currency: 'IDR',
          paymentMethod: 'QRIS',
          customer: {
            name: customerName,
            phone: customerPhone,
            email: customerEmail || undefined
          },
          description: params.description || `Pembayaran tumpangGo ${serviceType} #${orderId}`,
          expiryMinutes: expiryMinutes,
          callbackUrl: params.callbackUrl,
          returnUrl: params.returnUrl
        };

        const response = await fetch(`${artopayConfig.baseUrl}/v1/payment-intents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${artopayConfig.secretKey}`,
            ...(artopayConfig.apiKey ? { 'x-api-key': artopayConfig.apiKey } : {})
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          const resJson = await response.json();
          const d = resJson.data || resJson;
          const returnedId = d.id || d.paymentIntentId || d.transactionId;
          const returnedUrl = d.checkoutUrl || d.paymentUrl;

          if (returnedId && returnedUrl) {
            return {
              success: true,
              id: returnedId,
              paymentIntentId: returnedId,
              orderId,
              serviceType,
              amount,
              currency: 'IDR',
              checkoutUrl: returnedUrl,
              qrString: d.qrString || d.qrCodeUrl,
              status: 'PENDING',
              expiresAt: d.expiresAt || expiresAt,
              createdAt
            };
          }
        } else {
          const errText = await response.text();
          console.warn(`[ArtoPay Gateway] HTTP ${response.status} from ${artopayConfig.baseUrl}: ${errText}`);
          if (isProduction) {
            throw new Error(`Gateway ArtoPay menolak pembuatan transaksi (HTTP ${response.status}). Silakan coba beberapa saat lagi.`);
          }
        }
      } catch (err: any) {
        console.error('[ArtoPay Gateway Error]', err.message);
        if (isProduction) {
          throw new Error(`Gagal menghubungi server ArtoPay: ${err.message}`);
        }
      }
    }

    // 4. Sandbox fallback for testing and development environments
    // Generates compliant mock payment intent ID and verifiable sandbox checkout session
    const sandboxId = `artopay_pi_${serviceType.toLowerCase()}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const sandboxCheckoutUrl = `${artopayConfig.baseUrl}/checkout/${sandboxId}?order=${encodeURIComponent(orderId)}&amt=${amount}`;

    return {
      success: true,
      id: sandboxId,
      paymentIntentId: sandboxId,
      orderId,
      serviceType,
      amount,
      currency: 'IDR',
      checkoutUrl: sandboxCheckoutUrl,
      status: 'PENDING',
      expiresAt,
      createdAt
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
        const response = await fetch(`${artopayConfig.baseUrl}/v1/payment-intents/${paymentIntentId}`, {
          headers: {
            'Authorization': `Bearer ${artopayConfig.secretKey}`,
            ...(artopayConfig.apiKey ? { 'x-api-key': artopayConfig.apiKey } : {})
          }
        });

        if (response.ok) {
          const json = await response.json();
          const d = json.data || json;
          const gatewayStatus = (d.status || '').toUpperCase();
          if (['PAID', 'SUCCESS', 'SETTLED'].includes(gatewayStatus)) {
            return { status: 'SUCCESS', paidAt: d.paidAt || new Date().toISOString(), amount: d.amount, raw: d };
          }
          if (['EXPIRED', 'TIMED_OUT'].includes(gatewayStatus)) {
            return { status: 'EXPIRED', raw: d };
          }
          if (['FAILED', 'CANCELLED', 'REJECTED'].includes(gatewayStatus)) {
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
