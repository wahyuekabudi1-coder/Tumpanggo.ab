/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop Dedicated API Router
 * Handles catalog browsing, order placement, and strictly isolated Shop Admin operations.
 */

import { Router, Request, Response } from 'express';
import { shopDb } from '../shopDb';
import { shopConfig } from '../config';
import { createShopAuthToken, requireShopAdmin } from '../auth';
import { ShopOrderStatus, ShopShipmentStatus } from '../../types/shop';

export const shopRouter = Router();

// ==========================================
// 1. SHOP AUTHENTICATION (ISOLATED ADMIN)
// ==========================================

/**
 * POST /api/shop/auth/login
 * Authenticates Shop Administrator using dedicated credentials.
 * Does not accept Food Admin credentials.
 */
shopRouter.post('/auth/login', (req: Request, res: Response) => {
  const { username, email, password } = req.body;
  const targetUser = (username || email || '').trim().toLowerCase();
  const targetPass = (password || '').trim();

  if (!targetUser || !targetPass) {
    return res.status(400).json({ error: 'Email dan kata sandi wajib diisi.' });
  }

  if (shopConfig.isProduction && targetPass === 'TumpangShopAdmin#2026') {
    return res.status(401).json({ 
      error: 'Kata sandi default ditolak pada lingkungan produksi demi keamanan. Atur SHOP_ADMIN_PASSWORD di environment variable.' 
    });
  }

  const isMatchingEmail = targetUser === shopConfig.adminEmail || targetUser === 'shopadmin';
  const isMatchingPassword = shopConfig.adminPassword && targetPass === shopConfig.adminPassword;

  if (!isMatchingEmail || !isMatchingPassword) {
    return res.status(401).json({ 
      error: 'Kredensial Administrator Tumpang Shop salah. Pastikan menggunakan akun khusus Tumpang Shop.' 
    });
  }

  const token = createShopAuthToken({
    userId: 'shop_admin_master',
    role: 'SHOP_ADMIN',
    email: targetUser,
    scope: 'shop'
  });

  shopDb.logAudit('SHOP_ADMIN_LOGIN', `Admin ${targetUser} berhasil login ke portal Shop`, 'shop_admin_master');

  return res.json({
    token,
    role: 'SHOP_ADMIN',
    user: {
      id: 'shop_admin_master',
      name: 'Administrator Tumpang Shop',
      email: shopConfig.adminEmail
    }
  });
});

/**
 * GET /api/shop/auth/me
 * Checks token validity for Shop Admin
 */
shopRouter.get('/auth/me', requireShopAdmin, (req: Request, res: Response) => {
  return res.json({
    user: req.user,
    store: shopDb.getConfig().storeName
  });
});

// ==========================================
// 2. PUBLIC / CUSTOMER BROWSING & CONFIG
// ==========================================

/**
 * GET /api/shop/config
 * Retrieves store settings, operational hours, fees, and QRIS
 */
shopRouter.get('/config', (req: Request, res: Response) => {
  try {
    res.json(shopDb.getConfig());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/shop/config & PUT /api/shop/admin/config
 * Updates store settings, operational hours, fees, and QRIS (Admin only)
 */
const handleUpdateConfig = async (req: Request, res: Response) => {
  try {
    const actor = req.user?.userId || 'shop_admin';
    const updated = await shopDb.updateConfig(actor, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

shopRouter.put('/config', requireShopAdmin, handleUpdateConfig);
shopRouter.put('/admin/config', requireShopAdmin, handleUpdateConfig);

/**
 * GET /api/shop/categories
 * Retrieves active category list
 */
shopRouter.get('/categories', (req: Request, res: Response) => {
  try {
    const categories = shopDb.getCategories().filter(c => c.isActive);
    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/shop/products
 * Retrieves products with optional filters: ?category=slug_or_id & ?search=query
 */
shopRouter.get('/products', (req: Request, res: Response) => {
  try {
    const categoryParam = req.query.category as string | undefined;
    const searchParam = req.query.search as string | undefined;

    let categoryId = categoryParam;
    if (categoryParam && categoryParam !== 'all') {
      const matchSlug = shopDb.getCategories().find(c => c.slug === categoryParam || c.id === categoryParam);
      if (matchSlug) {
        categoryId = matchSlug.id;
      }
    }

    const products = shopDb.getProducts({
      categoryId,
      activeOnly: true,
      search: searchParam
    });

    res.json(products);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/shop/products/:id
 * Retrieves product details
 */
shopRouter.get('/products/:id', (req: Request, res: Response) => {
  try {
    const product = shopDb.getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Produk tidak ditemukan.' });
    }
    res.json(product);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. CUSTOMER ORDERS & TRACKING
// ==========================================

/**
 * POST /api/shop/orders
 * Places a customer shop order with server-side price and stock validation
 */
shopRouter.post('/orders', async (req: Request, res: Response) => {
  try {
    const newOrder = await shopDb.createOrder(req.body);
    res.status(201).json(newOrder);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Gagal membuat pesanan belanja.' });
  }
});

/**
 * GET /api/shop/orders/track/:id
 * Tracks an order status and payment verification.
 * PRIVACY GUARD: Requires phone query parameter (?phone=...) matching the order to prevent data leak.
 */
shopRouter.get('/orders/track/:id', async (req: Request, res: Response) => {
  try {
    const phone = req.query.phone as string | undefined;
    if (!phone || phone.trim().length === 0) {
      return res.status(403).json({ 
        error: 'Untuk perlindungan privasi data pelanggan, nomor WhatsApp penerima wajib disertakan (?phone=...).' 
      });
    }

    const order = await shopDb.findOrderByNumberAndPhone(req.params.id, phone.trim());
    if (!order) {
      return res.status(404).json({ 
        error: 'Pesanan tidak ditemukan atau nomor WhatsApp tidak sesuai dengan data pemesan.' 
      });
    }

    res.json(order);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shop/orders/lookup
 * Form-friendly lookup endpoint using both orderNumber and customerPhone.
 */
shopRouter.post('/orders/lookup', async (req: Request, res: Response) => {
  try {
    const { orderNumber, customerPhone } = req.body;
    if (!orderNumber || !customerPhone) {
      return res.status(400).json({ 
        error: 'Nomor pesanan dan nomor WhatsApp wajib diisi.' 
      });
    }

    const order = await shopDb.findOrderByNumberAndPhone(String(orderNumber).trim(), String(customerPhone).trim());
    if (!order) {
      return res.status(404).json({ 
        error: 'Pesanan tidak ditemukan atau nomor WhatsApp tidak cocok dengan nomor pesanan.' 
      });
    }

    res.json(order);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/shop/orders/customer/:phone
 * Retrieves past orders for customer by phone number
 */
shopRouter.get('/orders/customer/:phone', (req: Request, res: Response) => {
  try {
    const phone = req.params.phone;
    if (!phone || phone.trim().length < 8) {
      return res.status(400).json({ error: 'Nomor telepon tidak valid.' });
    }
    const orders = shopDb.getOrdersByCustomerPhone(phone.trim());
    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shop/orders/:id/payment-proof
 * Submits payment proof for verification
 */
shopRouter.post('/orders/:id/payment-proof', async (req: Request, res: Response) => {
  const { paymentProof, customerPhone } = req.body;
  if (!paymentProof || typeof paymentProof !== 'string' || paymentProof.trim().length === 0) {
    return res.status(400).json({ error: 'Bukti transfer pembayaran wajib dilampirkan.' });
  }

  try {
    // If customerPhone is supplied, verify ownership
    if (customerPhone) {
      const existing = await shopDb.findOrderByNumberAndPhone(req.params.id, customerPhone);
      if (!existing) {
        return res.status(403).json({ error: 'Verifikasi nomor WhatsApp gagal untuk pesanan ini.' });
      }
    }

    const updated = await shopDb.uploadPaymentProof(req.params.id, paymentProof.trim());
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Gagal mengunggah bukti pembayaran.' });
  }
});

// ==========================================
// 4. PROTECTED SHOP ADMIN MANAGEMENT (requireShopAdmin)
// ==========================================

/**
 * PUT /api/shop/config
 * Updates store configuration
 */
shopRouter.put('/config', requireShopAdmin, async (req: Request, res: Response) => {
  try {
    const actor = req.user?.userId || 'shop_admin';
    const updated = await shopDb.updateConfig(actor, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/shop/admin/categories
 * Retrieves all categories including inactive ones
 */
shopRouter.get('/admin/categories', requireShopAdmin, (req: Request, res: Response) => {
  try {
    res.json(shopDb.getCategories());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shop/categories & /api/shop/admin/categories
 * Creates new category
 */
const handleCreateCategory = async (req: Request, res: Response) => {
  try {
    const actor = req.user?.userId || 'shop_admin';
    const created = await shopDb.createCategory(actor, req.body);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};
shopRouter.post('/categories', requireShopAdmin, handleCreateCategory);
shopRouter.post('/admin/categories', requireShopAdmin, handleCreateCategory);

/**
 * PUT /api/shop/categories/:id & /api/shop/admin/categories/:id
 * Updates existing category
 */
const handleUpdateCategory = async (req: Request, res: Response) => {
  try {
    const actor = req.user?.userId || 'shop_admin';
    const updated = await shopDb.updateCategory(actor, req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};
shopRouter.put('/categories/:id', requireShopAdmin, handleUpdateCategory);
shopRouter.put('/admin/categories/:id', requireShopAdmin, handleUpdateCategory);

/**
 * DELETE /api/shop/categories/:id & /api/shop/admin/categories/:id
 * Deletes category
 */
const handleDeleteCategory = async (req: Request, res: Response) => {
  try {
    const actor = req.user?.userId || 'shop_admin';
    const success = await shopDb.deleteCategory(actor, req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Kategori tidak ditemukan.' });
    }
    res.json({ success: true, message: 'Kategori berhasil dihapus.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};
shopRouter.delete('/categories/:id', requireShopAdmin, handleDeleteCategory);
shopRouter.delete('/admin/categories/:id', requireShopAdmin, handleDeleteCategory);

/**
 * GET /api/shop/admin/products
 * Retrieves all products for admin view
 */
shopRouter.get('/admin/products', requireShopAdmin, (req: Request, res: Response) => {
  try {
    const categoryParam = req.query.category as string | undefined;
    const searchParam = req.query.search as string | undefined;
    const products = shopDb.getProducts({
      categoryId: categoryParam,
      activeOnly: false,
      search: searchParam
    });
    res.json(products);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shop/products & /api/shop/admin/products
 * Creates new product
 */
const handleCreateProduct = async (req: Request, res: Response) => {
  try {
    const actor = req.user?.userId || 'shop_admin';
    const created = await shopDb.createProduct(actor, req.body);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};
shopRouter.post('/products', requireShopAdmin, handleCreateProduct);
shopRouter.post('/admin/products', requireShopAdmin, handleCreateProduct);

/**
 * PUT /api/shop/products/:id & /api/shop/admin/products/:id
 * Updates product
 */
const handleUpdateProduct = async (req: Request, res: Response) => {
  try {
    const actor = req.user?.userId || 'shop_admin';
    const updated = await shopDb.updateProduct(actor, req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};
shopRouter.put('/products/:id', requireShopAdmin, handleUpdateProduct);
shopRouter.put('/admin/products/:id', requireShopAdmin, handleUpdateProduct);

/**
 * DELETE /api/shop/products/:id & /api/shop/admin/products/:id
 * Deletes product
 */
const handleDeleteProduct = async (req: Request, res: Response) => {
  try {
    const actor = req.user?.userId || 'shop_admin';
    const success = await shopDb.deleteProduct(actor, req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Produk tidak ditemukan.' });
    }
    res.json({ success: true, message: 'Produk berhasil dihapus.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};
shopRouter.delete('/products/:id', requireShopAdmin, handleDeleteProduct);
shopRouter.delete('/admin/products/:id', requireShopAdmin, handleDeleteProduct);

/**
 * GET /api/shop/orders
 * Lists all orders for shop admin
 */
shopRouter.get('/orders', requireShopAdmin, (req: Request, res: Response) => {
  try {
    const paymentStatus = req.query.paymentStatus as string | undefined;
    const orderStatus = req.query.orderStatus as string | undefined;
    const orders = shopDb.getOrders({ paymentStatus, orderStatus });
    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shop/orders/:id/verify-payment
 * Approves or rejects payment proof
 */
shopRouter.post('/orders/:id/verify-payment', requireShopAdmin, async (req: Request, res: Response) => {
  const { approved, reason } = req.body;
  if (typeof approved !== 'boolean') {
    return res.status(400).json({ error: 'Status persetujuan (approved: boolean) wajib disertakan.' });
  }

  try {
    const actor = req.user?.userId || 'shop_admin';
    const updated = await shopDb.verifyPayment(actor, req.params.id, approved, reason);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PATCH /api/shop/orders/:id/status
 * Updates order processing status (NEW, PROCESSING, PACKED, SHIPPED, COMPLETED, CANCELLED)
 */
shopRouter.patch('/orders/:id/status', requireShopAdmin, async (req: Request, res: Response) => {
  const { status, reason } = req.body;
  if (!status || !Object.values(ShopOrderStatus).includes(status)) {
    return res.status(400).json({ 
      error: `Status pesanan tidak valid. Pilihan: ${Object.values(ShopOrderStatus).join(', ')}` 
    });
  }

  try {
    const actor = req.user?.userId || 'shop_admin';
    const updated = await shopDb.updateOrderStatus(actor, req.params.id, status as ShopOrderStatus, reason);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/shop/reports/summary
 * Returns overall store and transaction metrics
 */
shopRouter.get('/reports/summary', requireShopAdmin, (req: Request, res: Response) => {
  try {
    res.json(shopDb.getSummaryMetrics());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/shop/reports/transactions
 * Returns filtered transaction report by date range
 */
shopRouter.get('/reports/transactions', requireShopAdmin, (req: Request, res: Response) => {
  try {
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const report = shopDb.getTransactionReport(startDate, endDate);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. SHIPMENT & TRACKING MODULE (PART 5)
// ==========================================

/**
 * GET /api/shop/shipping/options
 * Returns available local and international (China -> Indonesia) shipping services.
 */
shopRouter.get('/shipping/options', (req: Request, res: Response) => {
  try {
    const options = shopDb.getShippingOptions();
    res.json(options);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/shop/shipping/track/:trackingNumber
 * Customer & public tracking by tracking number.
 * PRIVACY GUARD: Requires phone query (?phone=...) unless authenticated as SHOP_ADMIN.
 */
shopRouter.get('/shipping/track/:trackingNumber', async (req: Request, res: Response) => {
  try {
    const trackingNumber = req.params.trackingNumber.trim();
    const shipment = shopDb.getShipmentByTrackingNumber(trackingNumber);
    if (!shipment) {
      return res.status(404).json({ error: 'Nomor resi pengiriman tidak ditemukan.' });
    }

    // Check if requester is shop admin
    const isShopAdmin = req.user?.role === 'SHOP_ADMIN' && req.user?.scope === 'shop';
    if (!isShopAdmin) {
      const phone = req.query.phone as string | undefined;
      if (!phone || phone.trim().length === 0) {
        return res.status(403).json({ 
          error: 'Untuk perlindungan privasi data pelanggan, nomor WhatsApp penerima wajib disertakan (?phone=...).' 
        });
      }

      // Verify phone against associated order
      const associatedOrder = await shopDb.findOrderById(shipment.orderId);
      if (!associatedOrder) {
        return res.status(404).json({ error: 'Pesanan terkait tidak ditemukan.' });
      }

      const cleanPhone = phone.replace(/[^0-9]/g, '');
      const normUserPhone = cleanPhone.startsWith('62') ? '0' + cleanPhone.slice(2) : cleanPhone;
      const orderClean = associatedOrder.customerPhone.replace(/[^0-9]/g, '');
      const normOrderPhone = orderClean.startsWith('62') ? '0' + orderClean.slice(2) : orderClean;

      const isMatch = normUserPhone === normOrderPhone || 
                      normUserPhone.endsWith(normOrderPhone.slice(-8)) || 
                      normOrderPhone.endsWith(normUserPhone.slice(-8));

      if (!isMatch) {
        return res.status(403).json({ 
          error: 'Nomor WhatsApp tidak cocok dengan data penerima paket ini.' 
        });
      }
    }

    res.json(shipment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/shop/admin/shipments
 * Lists all shipments for shop admin
 */
shopRouter.get('/admin/shipments', requireShopAdmin, (req: Request, res: Response) => {
  try {
    res.json(shopDb.getShipments());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/shop/admin/shipments/:id
 * Retrieves single shipment details
 */
shopRouter.get('/admin/shipments/:id', requireShopAdmin, (req: Request, res: Response) => {
  try {
    const shipment = shopDb.getShipmentById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ error: 'Data pengiriman tidak ditemukan.' });
    }
    res.json(shipment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/shop/admin/shipments/order/:orderId
 * Retrieves shipment by order ID
 */
shopRouter.get('/admin/shipments/order/:orderId', requireShopAdmin, (req: Request, res: Response) => {
  try {
    const shipment = shopDb.getShipmentByOrderId(req.params.orderId);
    if (!shipment) {
      return res.status(404).json({ error: 'Pengiriman untuk pesanan ini belum dibuat.' });
    }
    res.json(shipment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/shop/admin/shipments
 * Creates or updates shipment profile for an order
 */
shopRouter.post('/admin/shipments', requireShopAdmin, async (req: Request, res: Response) => {
  const { orderId } = req.body;
  if (!orderId) {
    return res.status(400).json({ error: 'orderId wajib diisi.' });
  }

  try {
    const actor = req.user?.userId || 'shop_admin';
    const created = await shopDb.createShipment(actor, req.body);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PATCH /api/shop/admin/shipments/:id/status
 * Updates shipment status and appends tracking event
 */
shopRouter.patch('/admin/shipments/:id/status', requireShopAdmin, async (req: Request, res: Response) => {
  const { status, location, description } = req.body;
  if (!status || !Object.values(ShopShipmentStatus).includes(status)) {
    return res.status(400).json({ 
      error: `Status pengiriman tidak valid. Pilihan status: ${Object.values(ShopShipmentStatus).join(', ')}` 
    });
  }

  try {
    const actor = req.user?.userId || 'shop_admin';
    const updated = await shopDb.updateShipmentStatus(actor, req.params.id, status as ShopShipmentStatus, {
      location,
      description
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

