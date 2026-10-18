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
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
  isDemo?: boolean;
  gatewayConfigured?: boolean;
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

    // 3. Attempt official ArtoPay Gateway call if secret key is available
    if (artopayConfig.secretKey) {
      try {
        const payload = {
          amount: String(amount),
          currency: 'IDR',
          customerId: customerPhone ? customerPhone.replace(/\D/g, '') : `cust_${Date.now()}`,
          description: params.description || `Pembayaran tumpangGo ${serviceType} #${orderId}`,
          metadata: {
            orderId: orderId,
            serviceType: serviceType,
            customerName: customerName,
            customerPhone: customerPhone,
            customerEmail: customerEmail || undefined
          }
        };

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Secret-Key': artopayConfig.secretKey,
          'Authorization': `Bearer ${artopayConfig.secretKey}`
        };
        if (artopayConfig.apiKey) {
          headers['x-api-key'] = artopayConfig.apiKey;
        }

        // Try primary /v1.1/payment-intents endpoint first, then /v1/payment-intents
        let response = await fetch(`${artopayConfig.baseUrl}/v1.1/payment-intents`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        }).catch(() => null);

        if (!response || !response.ok) {
          response = await fetch(`${artopayConfig.baseUrl}/v1/payment-intents`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          }).catch(() => null);
        }

        if (response && response.ok) {
          const resJson = await response.json();
          const d = resJson.data || resJson;
          const returnedId = String(d.id || d.paymentIntentId || d.transactionId || '');
          const clientSecret = d.clientSecret || d.secret || '';
          const customerToken = d.customerToken || d.token || '';
          
          // Form official payment link URL
          const returnedUrl = d.checkoutUrl || d.paymentUrl || (returnedId ? `${artopayConfig.payBaseUrl}/${returnedId}` : '');

          if (returnedId) {
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
              clientSecret,
              customerToken,
              status: 'PENDING',
              expiresAt: d.expiresAt || expiresAt,
              createdAt,
              isDemo: false,
              gatewayConfigured: true
            };
          }
        } else {
          const status = response ? response.status : 'NETWORK_ERROR';
          const errText = response ? await response.text() : 'Gagal menghubungi server ArtoPay.';
          console.warn(`[ArtoPay Gateway] HTTP ${status} from ${artopayConfig.baseUrl}: ${errText}`);
          if (isProduction) {
            throw new Error(`Gateway ArtoPay menolak pembuatan transaksi (HTTP ${status}). Silakan coba beberapa saat lagi.`);
          }
        }
      } catch (err: any) {
        console.error('[ArtoPay Gateway Error]', err.message);
        if (isProduction) {
          throw new Error(`Gagal menghubungi server ArtoPay: ${err.message}`);
        }
      }
    }

    // 4. Sandbox / Preview Fallback with dedicated in-app demo payment link
    // Allows full UI testing and interactive webhook simulation in Google AI Studio Preview
    const demoId = `demo_artopay_pi_${serviceType.toLowerCase()}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const demoClientSecret = `demo_secret_${crypto.randomBytes(8).toString('hex')}`;
    const demoCustomerToken = `demo_token_${crypto.randomBytes(8).toString('hex')}`;
    // In-app interactive preview payment link
    const demoCheckoutUrl = `/api/artopay/checkout/${demoId}?order=${encodeURIComponent(orderId)}&amt=${amount}&service=${serviceType}`;

    return {
      success: true,
      id: demoId,
      paymentIntentId: demoId,
      orderId,
      serviceType,
      amount,
      currency: 'IDR',
      checkoutUrl: demoCheckoutUrl,
      clientSecret: demoClientSecret,
      customerToken: demoCustomerToken,
      status: 'PENDING',
      expiresAt,
      createdAt,
      isDemo: true,
      gatewayConfigured: Boolean(artopayConfig.secretKey)
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
