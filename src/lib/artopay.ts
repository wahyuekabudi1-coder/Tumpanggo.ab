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
  allowSdkModal?: boolean;
  requireHostedCheckoutUrl?: boolean;
  customFetch?: typeof fetch;
}

export interface ArtoPayDiagnosticInfo {
  httpStatus: number;
  contentType: string;
  environment: string;
  baseUrl: string;
  businessCodeProvided: boolean;
  topLevelKeys: string[];
  nestedDataKeys: string[];
  transactionIdField: string | null;
  transactionIdExtracted: boolean;
  checkoutUrlField: string | null;
  checkoutUrlFound: boolean;
  gatewayCode?: string;
  gatewayMessage?: string;
  gatewayStatus?: string;
  isHttpSuccess: boolean;
  isBusinessSuccess: boolean;
  isHostedPaymentLinkReady: boolean;
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

/**
 * Safely extracts checkout URL from ArtoPay response data across root and nested objects.
 * Checks candidate fields: checkoutUrl, checkout_url, paymentUrl, payment_url, paymentLink, payment_link, redirectUrl, redirect_url, invoiceUrl, invoice_url, url, action.url, actions[].url, nextAction.redirect.url.
 */
export function extractArtoPayCheckoutUrl(data: any): string | null {
  if (!data || typeof data !== 'object') return null;

  // 1. Direct candidate keys
  const directKeys = [
    'checkoutUrl', 'checkout_url',
    'paymentUrl', 'payment_url',
    'paymentLink', 'payment_link',
    'redirectUrl', 'redirect_url',
    'invoiceUrl', 'invoice_url',
    'url'
  ];
  for (const k of directKeys) {
    if (typeof data[k] === 'string' && data[k].trim().startsWith('http')) {
      return data[k].trim();
    }
  }

  // 2. Nested common envelope keys (payload, data, responseData, result, payment, action, nextAction)
  const envelopeKeys = ['payload', 'data', 'responseData', 'result', 'payment', 'action', 'nextAction', 'next_action'];
  for (const ek of envelopeKeys) {
    if (data[ek] && typeof data[ek] === 'object') {
      const nested = extractArtoPayCheckoutUrl(data[ek]);
      if (nested) return nested;
    }
  }

  // 3. Array of actions
  if (Array.isArray(data.actions)) {
    for (const act of data.actions) {
      if (act && typeof act.url === 'string' && act.url.trim().startsWith('http')) {
        return act.url.trim();
      }
    }
  }

  return null;
}

/**
 * Safely extracts transaction ID from ArtoPay response data across root and nested envelopes.
 */
export function extractArtoPayTransactionId(data: any): string | null {
  if (!data || typeof data !== 'object') return null;

  const directKeys = ['id', 'paymentIntentId', 'payment_intent_id', 'paymentId', 'payment_id', 'transactionId', 'transaction_id', 'uuid'];
  for (const k of directKeys) {
    if (typeof data[k] === 'string' && data[k].trim().length > 0) {
      return data[k].trim();
    }
  }

  const envelopeKeys = ['payload', 'data', 'responseData', 'result', 'payment'];
  for (const ek of envelopeKeys) {
    if (data[ek] && typeof data[ek] === 'object') {
      const nested = extractArtoPayTransactionId(data[ek]);
      if (nested) return nested;
    }
  }

  return null;
}

/**
 * Identifies the exact field key/path where transaction ID was found for diagnostics.
 */
export function findArtoPayTransactionIdField(data: any): string | null {
  if (!data || typeof data !== 'object') return null;

  const directKeys = ['id', 'paymentIntentId', 'payment_intent_id', 'paymentId', 'payment_id', 'transactionId', 'transaction_id', 'uuid'];
  for (const k of directKeys) {
    if (typeof data[k] === 'string' && data[k].trim().length > 0) {
      return k;
    }
  }

  const envelopeKeys = ['payload', 'data', 'responseData', 'result', 'payment'];
  for (const ek of envelopeKeys) {
    if (data[ek] && typeof data[ek] === 'object') {
      const nested = findArtoPayTransactionIdField(data[ek]);
      if (nested) return `${ek}.${nested}`;
    }
  }

  return null;
}

/**
 * Identifies the exact field key/path where checkout URL was found for diagnostics (or null if none).
 */
export function findArtoPayCheckoutUrlField(data: any): string | null {
  if (!data || typeof data !== 'object') return null;

  const directKeys = [
    'checkoutUrl', 'checkout_url',
    'paymentUrl', 'payment_url',
    'paymentLink', 'payment_link',
    'redirectUrl', 'redirect_url',
    'invoiceUrl', 'invoice_url',
    'url'
  ];
  for (const k of directKeys) {
    if (typeof data[k] === 'string' && data[k].trim().startsWith('http')) {
      return k;
    }
  }

  const envelopeKeys = ['payload', 'data', 'responseData', 'result', 'payment', 'action', 'nextAction', 'next_action'];
  for (const ek of envelopeKeys) {
    if (data[ek] && typeof data[ek] === 'object') {
      const nested = findArtoPayCheckoutUrlField(data[ek]);
      if (nested) return `${ek}.${nested}`;
    }
  }

  if (Array.isArray(data.actions)) {
    for (let i = 0; i < data.actions.length; i++) {
      const act = data.actions[i];
      if (act && typeof act.url === 'string' && act.url.trim().startsWith('http')) {
        return `actions[${i}].url`;
      }
    }
  }

  return null;
}

/**
 * Safely extracts client secret from ArtoPay response data.
 */
export function extractArtoPayClientSecret(data: any): string {
  if (!data || typeof data !== 'object') return '';
  const directKeys = ['secret', 'clientSecret', 'client_secret'];
  for (const k of directKeys) {
    if (typeof data[k] === 'string' && data[k].trim().length > 0) return data[k].trim();
  }
  const envelopeKeys = ['payload', 'data', 'responseData', 'result'];
  for (const ek of envelopeKeys) {
    if (data[ek] && typeof data[ek] === 'object') {
      const nested = extractArtoPayClientSecret(data[ek]);
      if (nested) return nested;
    }
  }
  return '';
}

/**
 * Safely extracts customer token from ArtoPay response data.
 */
export function extractArtoPayCustomerToken(data: any): string {
  if (!data || typeof data !== 'object') return '';
  const directKeys = ['customerToken', 'customer_token', 'token'];
  for (const k of directKeys) {
    if (typeof data[k] === 'string' && data[k].trim().length > 0) return data[k].trim();
  }
  const envelopeKeys = ['payload', 'data', 'responseData', 'result'];
  for (const ek of envelopeKeys) {
    if (data[ek] && typeof data[ek] === 'object') {
      const nested = extractArtoPayCustomerToken(data[ek]);
      if (nested) return nested;
    }
  }
  return '';
}

/**
 * Safely extracts public key / client key from ArtoPay response data if returned.
 */
export function extractArtoPayPublicKey(data: any): string {
  if (!data || typeof data !== 'object') return '';
  const directKeys = ['publicKey', 'public_key', 'clientKey', 'client_key'];
  for (const k of directKeys) {
    if (typeof data[k] === 'string' && data[k].trim().length > 0) return data[k].trim();
  }
  const envelopeKeys = ['payload', 'data', 'responseData', 'result'];
  for (const ek of envelopeKeys) {
    if (data[ek] && typeof data[ek] === 'object') {
      const nested = extractArtoPayPublicKey(data[ek]);
      if (nested) return nested;
    }
  }
  return '';
}

/**
 * Validates and normalizes public key, stripping quotes and rejecting placeholder tokens.
 */
export function cleanPublicKey(key?: string): string | undefined {
  if (!key || typeof key !== 'string') return undefined;
  let trimmed = key.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  if (
    trimmed.startsWith('%') ||
    trimmed.includes('%VITE_') ||
    trimmed === 'undefined' ||
    trimmed === 'null' ||
    trimmed.length < 5
  ) {
    return undefined;
  }
  return trimmed;
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
    if (!artopayConfig.secretKey && !params.customFetch) {
      throw new Error(
        'Kredensial gateway ArtoPay belum dikonfigurasi (ARTOPAY_SECRET_KEY belum disetel di Environment Variables). ' +
        'Silakan masukkan Secret Key resmi dari Dashboard ArtoPay untuk mengaktifkan pembuatan QRIS dinamis.'
      );
    }

    // 3. Official ArtoPay Gateway call
    // ArtoPay API contract requires top-level orderId in request body
    const payload: Record<string, any> = {
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

    if (artopayConfig.businessUnitCode) {
      payload.businessUnit = artopayConfig.businessUnitCode;
      payload.businessUnitCode = artopayConfig.businessUnitCode;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Secret-Key': artopayConfig.secretKey || 'mock_secret_key'
    };

    if (artopayConfig.apiKey) {
      headers['X-API-Key'] = artopayConfig.apiKey;
    }
    if (artopayConfig.businessUnitCode) {
      headers['X-Business-Unit'] = artopayConfig.businessUnitCode;
    }

    const fetchClient = params.customFetch || fetch;

    let response: any = null;
    try {
      response = await fetchClient(`${artopayConfig.baseUrl}/v1.1/payment-intents`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
    } catch (err: any) {
      throw new Error(`Gagal menghubungi server gateway ArtoPay (${artopayConfig.baseUrl}): ${err?.message || 'Koneksi jaringan gagal'}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let resJson: any = null;
    let rawText = '';

    try {
      rawText = await response.text();
      resJson = JSON.parse(rawText);
    } catch {
      console.error('[ArtoPay Error] Respons dari gateway bukan format JSON yang valid:', {
        httpStatus: response.status,
        contentType,
        rawSnippet: rawText.substring(0, 300)
      });
      throw new Error(
        `Gateway ArtoPay mengembalikan respons non-JSON (HTTP ${response.status}, Content-Type: ${contentType}). ` +
        `Isi respons: "${rawText.substring(0, 150)}..."`
      );
    }

    if (!response.ok) {
      const status = response.status;
      const errDetail = resJson?.message || resJson?.responseMessage || resJson?.error || JSON.stringify(resJson);
      console.warn('[ArtoPay Gateway Rejection]', {
        httpStatus: status,
        contentType,
        environment: artopayConfig.environment,
        baseUrl: artopayConfig.baseUrl,
        errorDetail: errDetail
      });
      throw new Error(`Gateway ArtoPay menolak pembuatan transaksi (HTTP ${status}): ${errDetail || 'Permintaan tidak dapat diproses'}`);
    }

    // Extract identifiers and URLs using multi-envelope parser
    const returnedId = extractArtoPayTransactionId(resJson);
    const returnedUrl = extractArtoPayCheckoutUrl(resJson);
    const clientSecret = extractArtoPayClientSecret(resJson);
    const customerToken = extractArtoPayCustomerToken(resJson);
    const returnedPublicKey = extractArtoPayPublicKey(resJson);

    // Safe Diagnostic Logging (Zero Sensitive Key/Token Leaks)
    const topKeys = typeof resJson === 'object' && resJson !== null ? Object.keys(resJson) : [];
    const nestedData = resJson.payload || resJson.data || resJson.responseData || null;
    const nestedKeys = nestedData && typeof nestedData === 'object' ? Object.keys(nestedData) : [];
    const txIdField = findArtoPayTransactionIdField(resJson);
    const checkoutUrlField = findArtoPayCheckoutUrlField(resJson);
    const isHttpSuccess = response.status >= 200 && response.status < 300;
    const gatewayBusinessStatus = resJson.status || nestedData?.status || resJson.responseMessage || undefined;
    const isBusinessSuccess = isHttpSuccess && (
      gatewayBusinessStatus === 'created' ||
      gatewayBusinessStatus === 'Success' ||
      gatewayBusinessStatus === 'SUCCESS' ||
      resJson.responseCode === '2000000' ||
      resJson.responseCode === '2002700'
    );
    const isHostedPaymentLinkReady = Boolean(returnedUrl);

    const diagnostic: ArtoPayDiagnosticInfo = {
      httpStatus: response.status,
      contentType,
      environment: artopayConfig.environment,
      baseUrl: artopayConfig.baseUrl,
      businessCodeProvided: Boolean(artopayConfig.businessUnitCode),
      topLevelKeys: topKeys,
      nestedDataKeys: nestedKeys,
      transactionIdField: txIdField,
      transactionIdExtracted: Boolean(returnedId),
      checkoutUrlField: checkoutUrlField || 'none',
      checkoutUrlFound: Boolean(returnedUrl),
      gatewayCode: resJson.code || resJson.responseCode || undefined,
      gatewayMessage: resJson.message || resJson.responseMessage || undefined,
      gatewayStatus: gatewayBusinessStatus,
      isHttpSuccess,
      isBusinessSuccess,
      isHostedPaymentLinkReady
    };

    console.log('[ArtoPay Gateway Diagnostic]', diagnostic);

    if (!returnedId) {
      throw new Error(
        `Gateway ArtoPay merespons berhasil (HTTP ${response.status}), namun tidak mengembalikan ID transaksi yang valid. ` +
        `Field respons: [${topKeys.join(', ')}]`
      );
    }

    // ArtoPay SDK contract: checkoutUrl is optional (gateway delivers customerToken, secret, and ID for modal SDK).
    // If a caller explicitly demands a hosted checkout URL and it is missing, reject.
    if (params.requireHostedCheckoutUrl && !returnedUrl) {
      throw new Error(
        `Gateway ArtoPay merespons berhasil (HTTP ${response.status}), namun payload respons tidak memuat URL checkout resmi (checkoutUrl) untuk mengalihkan pelanggan. ` +
        `ID Transaksi: ${returnedId}. Respons: ${JSON.stringify(resJson).substring(0, 160)}`
      );
    }

    // If neither a valid checkout URL nor SDK modal credentials (secret / token) were returned, reject.
    if (!returnedUrl && !clientSecret && !customerToken) {
      throw new Error(
        `Gateway ArtoPay merespons berhasil (HTTP ${response.status}), namun payload respons tidak memuat URL checkout resmi (checkoutUrl) maupun kredensial SDK modal (secret / customerToken). ` +
        `ID Transaksi: ${returnedId}. Respons: ${JSON.stringify(resJson).substring(0, 160)}`
      );
    }

    const finalCheckoutUrl = returnedUrl || '';

    return {
      success: true,
      id: returnedId,
      paymentIntentId: returnedId,
      orderId,
      serviceType,
      amount,
      currency: 'IDR',
      checkoutUrl: finalCheckoutUrl,
      qrString: resJson.qrString || nestedData?.qrString || resJson.qrCodeUrl || nestedData?.qrCodeUrl || undefined,
      clientSecret,
      customerToken,
      publicKey: cleanPublicKey(returnedPublicKey || artopayConfig.publicKey) || undefined,
      sandbox: artopayConfig.environment !== 'production',
      status: 'PENDING',
      expiresAt: resJson.expiresAt || nestedData?.expiresAt || expiresAt,
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

export interface ProcessArtoPayPaymentParams {
  orderId: string;
  serviceType: 'FOOD' | 'SHOP';
  customerPhone?: string;
  autoRedirect?: boolean;
  onSuccess?: (result: any) => void;
  onPending?: (result: any) => void;
  onError?: (err: any) => void;
  onClose?: () => void;
}

export interface ProcessArtoPayPaymentResult {
  success: boolean;
  orderId: string;
  paymentIntentId: string;
  checkoutUrl: string;
  clientSecret?: string;
  customerToken?: string;
  publicKey?: string;
  sandbox?: boolean;
  amount: number;
  currency: string;
  expiresAt: string;
  mode: 'hosted_url' | 'sdk_modal';
}

/**
 * Frontend client helper following Smart Journey reference pattern:
 * 1. Sends payment creation request to backend.
 * 2. Backend retrieves verified saved order, enforces nominal, and contacts ArtoPay gateway.
 * 3. If official hosted checkoutUrl is available, redirects customer to gateway checkout page.
 * 4. If gateway operates via modal SDK (standard ArtoPay contract), opens official ArtoPay modal SDK using clientSecret, token, paymentId, and orderId.
 */
export async function processArtoPayPayment(params: ProcessArtoPayPaymentParams): Promise<ProcessArtoPayPaymentResult> {
  const { orderId, serviceType, customerPhone, autoRedirect = true, onSuccess, onPending, onError, onClose } = params;
  const cleanOrderId = typeof orderId === 'string' ? orderId.trim() : '';
  if (!cleanOrderId) {
    throw new Error('ID pesanan tidak boleh kosong.');
  }

  const res = await fetch('/api/artopay/payment-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: cleanOrderId,
      serviceType,
      customerPhone: customerPhone ? customerPhone.trim() : undefined
    })
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Gagal membuat sesi transaksi ArtoPay melalui backend.');
  }

  const checkoutUrl = String(data.checkoutUrl || '').trim();
  const paymentIntentId = data.paymentIntentId || data.id;

  // Mode 1: Hosted Payment Link redirect if gateway provided a valid URL
  if (checkoutUrl && checkoutUrl.startsWith('http')) {
    if (autoRedirect && typeof window !== 'undefined') {
      window.location.href = checkoutUrl;
    }
    return {
      success: true,
      orderId: data.orderId || cleanOrderId,
      paymentIntentId,
      checkoutUrl,
      clientSecret: data.clientSecret,
      customerToken: data.customerToken,
      publicKey: data.publicKey,
      sandbox: data.sandbox,
      amount: Number(data.amount),
      currency: data.currency || 'IDR',
      expiresAt: data.expiresAt,
      mode: 'hosted_url'
    };
  }

  // Mode 2: Official ArtoPay SDK Modal mechanism
  if (typeof window !== 'undefined') {
    try {
      const safePubKey = cleanPublicKey(data.publicKey);
      // Safe diagnostic logging (No full tokens/secrets leaked)
      console.log('[ArtoPay Modal Diagnostics - Client]', {
        environment: data.sandbox ? 'sandbox' : 'production',
        orderId: data.orderId || cleanOrderId,
        paymentIntentId,
        httpStatus: res.status,
        hasClientSecret: Boolean(data.clientSecret),
        clientSecretPrefix: data.clientSecret ? `${data.clientSecret.substring(0, 7)}...` : 'missing',
        hasCustomerToken: Boolean(data.customerToken),
        customerTokenPrefix: data.customerToken ? `${data.customerToken.substring(0, 7)}...` : 'missing',
        hasPublicKey: Boolean(safePubKey),
        publicKeyPrefix: safePubKey ? `${safePubKey.substring(0, 6)}...` : 'missing',
        sdkParameters: ['clientSecret', 'secret', 'paymentId', 'orderId', 'token', 'customerToken', 'publicKey', 'sandbox']
      });

      const sdk = await import('@arto-pay/js-sdk');
      const openModal = sdk.openPayment || (sdk.default && sdk.default.openPayment);
      if (typeof openModal === 'function') {
        openModal({
          clientSecret: data.clientSecret,
          secret: data.clientSecret,
          paymentId: paymentIntentId,
          orderId: data.orderId || cleanOrderId,
          token: data.customerToken,
          customerToken: data.customerToken,
          sandbox: data.sandbox !== undefined ? data.sandbox : true,
          publicKey: safePubKey,
          onSuccess,
          onPending,
          onError,
          onClose
        } as any);
      }
    } catch (sdkErr: any) {
      console.warn('[processArtoPayPayment SDK open warning]', sdkErr);
    }
  }

  return {
    success: true,
    orderId: data.orderId || cleanOrderId,
    paymentIntentId,
    checkoutUrl: '',
    clientSecret: data.clientSecret,
    customerToken: data.customerToken,
    publicKey: data.publicKey,
    sandbox: data.sandbox,
    amount: Number(data.amount),
    currency: data.currency || 'IDR',
    expiresAt: data.expiresAt,
    mode: 'sdk_modal'
  };
}

