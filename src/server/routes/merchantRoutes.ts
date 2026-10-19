/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Merchant Routes
 * Manages merchant profiles, menu catalogs, orders, and license redemptions.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { foodDb } from '../db';
import { requireRole, requireMerchantOwner } from '../auth';

export const merchantRouter = Router();

// --- MERCHANT PROFILES ---
merchantRouter.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = foodDb.getMerchants();
    res.json(list);
  } catch (err) {
    next(err);
  }
});

merchantRouter.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const m = foodDb.getMerchantById(req.params.id);
    if (!m) return res.status(404).json({ error: 'Merchant not found' });
    res.json(m);
  } catch (err) {
    next(err);
  }
});

merchantRouter.post('/', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const merchantData = req.body;
  try {
    const actorId = req.user?.userId || 'admin';
    const created = await foodDb.createMerchant(actorId, merchantData);
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

merchantRouter.put('/:id', requireMerchantOwner('id'), async (req: Request, res: Response) => {
  const updates = { ...req.body };
  // Do not allow changing store ID
  delete updates.id;
  try {
    const actorId = req.user?.userId || req.user?.entityId || req.params.id;
    const actorRole = (req.user?.role === 'ADMIN' ? 'ADMIN' : 'MERCHANT') as 'ADMIN' | 'MERCHANT';
    const updated = await foodDb.updateMerchant(actorId, req.params.id, updates, actorRole);
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

merchantRouter.delete('/:id', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const actorId = req.user?.userId || 'admin';
  try {
    const success = await foodDb.deleteMerchant(actorId, req.params.id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: 'Merchant not found' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// --- MENU CATEGORIES ---
merchantRouter.get('/:id/categories', (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(foodDb.getCategories(req.params.id));
  } catch (err) {
    next(err);
  }
});

merchantRouter.post('/:id/categories', requireMerchantOwner('id'), async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nama kategori wajib diisi.' });
  }
  try {
    const created = await foodDb.createCategory(req.params.id, name.trim());
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

merchantRouter.put('/:merchantId/categories/:id', requireMerchantOwner('merchantId'), async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nama kategori wajib diisi.' });
  }
  try {
    const updated = await foodDb.updateCategory(req.params.merchantId, req.params.id, name.trim());
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

merchantRouter.delete('/:merchantId/categories/:id', requireMerchantOwner('merchantId'), async (req: Request, res: Response) => {
  try {
    const success = await foodDb.deleteCategory(req.params.merchantId, req.params.id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: 'Category not found' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// --- MENU ITEMS ---
merchantRouter.get('/:id/menu', (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(foodDb.getMenuItemsByMerchant(req.params.id));
  } catch (err) {
    next(err);
  }
});

merchantRouter.post('/:id/menu', requireMerchantOwner('id'), async (req: Request, res: Response) => {
  try {
    const created = await foodDb.createMenuItem(req.params.id, req.body);
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

merchantRouter.put('/:merchantId/menu/:id', requireMerchantOwner('merchantId'), async (req: Request, res: Response) => {
  try {
    const updated = await foodDb.updateMenuItem(req.params.merchantId, req.params.id, req.body);
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

merchantRouter.delete('/:merchantId/menu/:id', requireMerchantOwner('merchantId'), async (req: Request, res: Response) => {
  try {
    const success = await foodDb.deleteMenuItem(req.params.merchantId, req.params.id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: 'Menu item not found' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// --- ORDERS & SETTLEMENTS ---
merchantRouter.get('/:merchantId/orders', requireMerchantOwner('merchantId'), (req: Request, res: Response) => {
  res.json(foodDb.getOrdersByMerchant(req.params.merchantId));
});

merchantRouter.get('/:merchantId/settlements', requireMerchantOwner('merchantId'), (req: Request, res: Response) => {
  res.json(foodDb.getSettlementsByMerchant(req.params.merchantId));
});

