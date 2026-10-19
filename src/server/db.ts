/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Isolated Database Module
 * Manages persistent storage, data integrity, and Firestore synchronization.
 */

import fs from 'fs';
import path from 'path';
import {
  Merchant, Category, MenuItem, Order, Driver, Settlement, AuditLog, SystemConfig,
  OrderStatus, SettlementStatus, AssignmentMode, PartnerRegistration
} from '../types';
import { foodConfig } from './config';
import { hashPassword, verifyPassword } from './auth';
import { OrderService } from './services/orderService';
import {
  getAdminDb,
  safeAdminSetDoc,
  safeAdminDeleteDoc,
  safeAdminGetDoc,
  safeAdminGetDocs,
  runAdminTransaction,
  removeUndefinedFields,
  isFirestoreAdminConfigured,
  isUsingServiceAccount,
  testFirestoreConnection,
  getFirestoreDiagnosticStatus
} from './firebaseAdmin';

const FOOD_DB_FILE = foodConfig.localDbFile;
const LEGACY_DB_FILE = foodConfig.legacyDbFile;

// Administrative Firestore set helper alias
const safeFirestoreSetDoc = safeAdminSetDoc;

interface DatabaseSchema {
  merchants: Merchant[];
  categories: Category[];
  menuItems: MenuItem[];
  orders: Order[];
  drivers: Driver[];
  settlements: Settlement[];
  auditLogs: AuditLog[];
  systemConfig: SystemConfig;
  partnerRegistrations: PartnerRegistration[];
}

const initialConfig: SystemConfig = {
  serviceFee: 2000,
  deliveryFeePerKm: 1500,
  defaultDeliveryFee: 5000,
  commissionPercent: 10,
  assignmentMode: AssignmentMode.AUTOMATIC,
  qrisImage: 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
  systemOpen: true
};

export class FoodDatabase {
  private data: DatabaseSchema;
  private isInitialized = false;

  constructor() {
    this.data = {
      merchants: [],
      categories: [],
      menuItems: [],
      orders: [],
      drivers: [],
      settlements: [],
      auditLogs: [],
      systemConfig: initialConfig,
      partnerRegistrations: []
    };
    this.loadAndMigrate();
  }

  public createBackup(): boolean {
    try {
      const backupPath = FOOD_DB_FILE + '.backup.json';
      fs.writeFileSync(backupPath, JSON.stringify(this.data, null, 2), 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Loads from food database file or migrates safely from backup / legacy file.
   */
  private loadAndMigrate() {
    const backupPath = FOOD_DB_FILE + '.backup.json';
    try {
      if (fs.existsSync(FOOD_DB_FILE)) {
        const content = fs.readFileSync(FOOD_DB_FILE, 'utf-8');
        if (content && content.trim().length > 10) {
          this.data = JSON.parse(content);
          this.ensureStructure();
          this.migratePasswords();
          this.createBackup();
          console.log('[TumpangFood DB] Loaded primary operational state from tumpang_food_db.json');
          return;
        }
      }

      // Serverless cold-start bootstrap: copy/load bundled seed file to /tmp
      const bundledSeedFile = path.join(process.cwd(), 'tumpang_food_db.json');
      if (FOOD_DB_FILE !== bundledSeedFile && fs.existsSync(bundledSeedFile)) {
        try {
          const seedContent = fs.readFileSync(bundledSeedFile, 'utf-8');
          if (seedContent && seedContent.trim().length > 10) {
            this.data = JSON.parse(seedContent);
            this.ensureStructure();
            this.migratePasswords();
            this.save();
            this.createBackup();
            console.log('[TumpangFood DB] Successfully bootstrapped serverless database from bundled tumpang_food_db.json');
            return;
          }
        } catch (e: any) {
          console.warn('[TumpangFood DB] Failed reading bundled seed database:', e.message);
        }
      }

      // Fallback 1: Try backup snapshot
      if (fs.existsSync(backupPath)) {
        console.warn('[TumpangFood DB] Primary database corrupted or empty. Recovering from backup snapshot...');
        const backupContent = fs.readFileSync(backupPath, 'utf-8');
        this.data = JSON.parse(backupContent);
        this.ensureStructure();
        this.save();
        console.log('[TumpangFood DB] Recovery from backup successful.');
        return;
      }

      // Fallback 2: Safe initial migration from legacy database file
      if (fs.existsSync(LEGACY_DB_FILE)) {
        console.log('[TumpangFood DB] Migrating data from legacy tumpang_db.json...');
        const legacyContent = fs.readFileSync(LEGACY_DB_FILE, 'utf-8');
        this.data = JSON.parse(legacyContent);
        this.ensureStructure();
        this.migratePasswords();
        this.save();
        this.createBackup();
        console.log('[TumpangFood DB] Migration complete! Saved to tumpang_food_db.json.');
      } else {
        // Fresh initial seed
        this.seedInitial();
        this.save();
        this.createBackup();
      }
    } catch (err) {
      console.error('[TumpangFood DB] Error during load/migrate, attempting emergency recovery:', err);
      if (fs.existsSync(backupPath)) {
        try {
          this.data = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
          this.ensureStructure();
          this.save();
          return;
        } catch {
          // ignore
        }
      }
      this.seedInitial();
      this.save();
    }
  }

  private migratePasswords() {
    let changed = false;
    for (const m of this.data.merchants) {
      if (!m.password) {
        m.password = hashPassword(m.id + '123');
        changed = true;
      } else if (!m.password.startsWith('pbkdf2$')) {
        m.password = hashPassword(m.password);
        changed = true;
      }
    }
    for (const d of this.data.drivers) {
      if (!(d as any).password) {
        (d as any).password = hashPassword(d.id + '123');
        changed = true;
      } else if (!(d as any).password.startsWith('pbkdf2$')) {
        (d as any).password = hashPassword((d as any).password);
        changed = true;
      }
    }
    if (changed) this.save();
  }

  private ensureStructure() {
    if (!this.data.merchants) this.data.merchants = [];
    if (!this.data.categories) this.data.categories = [];
    if (!this.data.menuItems) this.data.menuItems = [];
    if (!this.data.orders) this.data.orders = [];
    if (!this.data.drivers) this.data.drivers = [];
    if (!this.data.settlements) this.data.settlements = [];
    if (!this.data.auditLogs) this.data.auditLogs = [];
    if (!this.data.systemConfig) this.data.systemConfig = initialConfig;
    if (!this.data.partnerRegistrations) this.data.partnerRegistrations = [];

    if (this.data.merchants.length === 0) {
      this.seedInitial();
    }
  }

  private seedInitial() {
    this.data.systemConfig = initialConfig;
    const now = new Date().toISOString();

    this.data.merchants = [
      {
        id: 'm1',
        name: 'Warung Bakso & Mie Ayam Barokah',
        ownerName: 'Pak Slamet',
        phone: '081234567891',
        address: 'Jl. Raya Tumpang No. 45, Kec. Tumpang, Malang',
        latitude: -7.9984,
        longitude: 112.7663,
        openTime: '09:00',
        closeTime: '21:00',
        bankName: 'BRI',
        bankAccount: '1234567890',
        bankHolder: 'Pak Slamet',
        active: true,
        rating: 4.8,
        cookTimeEstimate: '15-25 min',
        image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=500&auto=format&fit=crop&q=60',
        description: 'Bakso urat sapi asli, mie ayam ceker spesial khas Tumpang.',
        category: 'Makanan Berat',
        email: 'm1@tumpanggo.com',
        createdAt: now,
        updatedAt: now,
        isActivated: true,
        password: hashPassword('m1123')
      },
      {
        id: 'm2',
        name: 'Ayam Geprek Sambal Korek Tumpang',
        ownerName: 'Bu Siti Aminah',
        phone: '081234567892',
        address: 'Jl. Pahlawan No. 12, Kec. Tumpang, Malang',
        latitude: -8.0012,
        longitude: 112.7681,
        openTime: '10:00',
        closeTime: '22:00',
        bankName: 'BCA',
        bankAccount: '0987654321',
        bankHolder: 'Bu Siti Aminah',
        active: true,
        rating: 4.7,
        cookTimeEstimate: '15-20 min',
        image: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=500&auto=format&fit=crop&q=60',
        description: 'Ayam goreng renyah krispi dengan kepedasan sambal korek khas Tumpang.',
        category: 'Aneka Ayam',
        email: 'm2@tumpanggo.com',
        createdAt: now,
        updatedAt: now,
        isActivated: true,
        password: hashPassword('m2123')
      }
    ];

    this.data.categories = [
      { id: 'cat_m1_1', merchantId: 'm1', name: 'Menu Utama', orderIndex: 1 },
      { id: 'cat_m1_2', merchantId: 'm1', name: 'Minuman Segar', orderIndex: 2 },
      { id: 'cat_m2_1', merchantId: 'm2', name: 'Paket Geprek', orderIndex: 1 }
    ];

    this.data.menuItems = [
      {
        id: 'menu_1',
        merchantId: 'm1',
        categoryId: 'cat_m1_1',
        name: 'Bakso Spesial Tumpang',
        description: 'Bakso daging sapi asli dengan kuah kaldu gurih khas Tumpang',
        price: 15000,
        available: true,
        image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&auto=format&fit=crop&q=60',
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'menu_2',
        merchantId: 'm1',
        categoryId: 'cat_m1_1',
        name: 'Mie Ayam Ceker Bakso',
        description: 'Mie kenyal dengan potongan ayam berbumbu manis gurih dan ceker empuk',
        price: 13000,
        available: true,
        image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=400&auto=format&fit=crop&q=60',
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'menu_3',
        merchantId: 'm1',
        categoryId: 'cat_m1_2',
        name: 'Es Jeruk Manis Segar',
        description: 'Perasan jeruk peras asli dingin menyegarkan',
        price: 5000,
        available: true,
        image: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=400&auto=format&fit=crop&q=60',
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'menu_4',
        merchantId: 'm2',
        categoryId: 'cat_m2_1',
        name: 'Paket Ayam Geprek Sambal Bawang + Nasi',
        description: 'Ayam geprek pedas gurih lengkap dengan nasi hangat dan lalapan',
        price: 18000,
        available: true,
        image: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=400&auto=format&fit=crop&q=60',
        createdAt: now,
        updatedAt: now
      }
    ];

    this.data.drivers = [
      {
        id: 'd1',
        name: 'Budi Santoso',
        phone: '081234567893',
        email: 'driver1@tumpanggo.com',
        active: true,
        online: true,
        latitude: -7.982,
        longitude: 112.631,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'd2',
        name: 'Agus Pratama',
        phone: '081234567894',
        email: 'driver2@tumpanggo.com',
        active: true,
        online: true,
        latitude: -7.985,
        longitude: 112.635,
        createdAt: now,
        updatedAt: now
      }
    ];

    for (const d of this.data.drivers) {
      (d as any).password = hashPassword(d.id + '123');
    }
  }

  public save() {
    try {
      const dir = path.dirname(FOOD_DB_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(FOOD_DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e: any) {
      if (e.code === 'EROFS') {
        console.warn('[TumpangFood DB] Read-only filesystem detected. Disk write skipped; persisting in-memory and Firestore.');
      } else {
        console.error('[TumpangFood DB] Failed to save database file:', e);
      }
    }
  }

  private initPromise: Promise<void> | null = null;
  private lastSyncTimestamp = 0;
  private readonly CACHE_TTL_MS = 15000;

  public async ensureInitialized(forceRefresh = false): Promise<void> {
    if (this.isInitialized && !forceRefresh && (Date.now() - this.lastSyncTimestamp < this.CACHE_TTL_MS)) {
      return;
    }
    if (!this.initPromise || forceRefresh) {
      this.initPromise = this.init();
    }
    try {
      await this.initPromise;
      this.lastSyncTimestamp = Date.now();
    } catch (err) {
      this.initPromise = null;
      this.isInitialized = false;
      throw err;
    }
  }

  /**
   * Diagnostic assessment of runtime storage status: Cloud Firestore vs Local Resilient Snapshot.
   */
  public async getStorageStatus(): Promise<{
    storageMode: 'cloud_firestore_active' | 'local_resilient_snapshot';
    databaseId: string;
    projectId: string;
    isProduction: boolean;
    firestoreConfigured: boolean;
    usingServiceAccount: boolean;
    authIdentity: string;
    liveCloudConnected: boolean;
    canRead: boolean;
    canWrite: boolean;
    diagnosticReason: string;
    diagnosticDetail: string;
    remediationStep?: string;
    cloudError?: string;
  }> {
    const firestoreCheck = await testFirestoreConnection();
    return {
      storageMode: firestoreCheck.connected ? 'cloud_firestore_active' : 'local_resilient_snapshot',
      databaseId: firestoreCheck.databaseId,
      projectId: firestoreCheck.projectId,
      isProduction: foodConfig.isProduction,
      firestoreConfigured: isFirestoreAdminConfigured(),
      usingServiceAccount: firestoreCheck.usingServiceAccount,
      authIdentity: firestoreCheck.authIdentity,
      liveCloudConnected: firestoreCheck.connected,
      canRead: firestoreCheck.canRead,
      canWrite: firestoreCheck.canWrite,
      diagnosticReason: firestoreCheck.diagnosticReason,
      diagnosticDetail: firestoreCheck.diagnosticDetail,
      remediationStep: firestoreCheck.remediationStep,
      cloudError: firestoreCheck.error
    };
  }

  /**
   * Synchronize state with Firebase Firestore as Primary Storage.
   */
  public async init() {
    // 1. Check if Firebase Admin SDK has valid explicit credentials
    if (!isUsingServiceAccount() || !getAdminDb()) {
      const diag = getFirestoreDiagnosticStatus();
      console.warn(`[TumpangFood DB] Firestore Admin SDK tidak terkonfigurasi (${diag.reason}), beroperasi dengan penyimpanan lokal.`);
      this.isInitialized = true;
      return;
    }

    // 2. Perform live connection probe to verify actual Firestore Cloud accessibility
    const probe = await testFirestoreConnection();
    if (!probe.connected) {
      console.warn(`[TumpangFood DB] Firestore Cloud belum terhubung (${probe.diagnosticReason}: ${probe.error || probe.diagnosticDetail}). Beroperasi dengan penyimpanan lokal.`);
      this.isInitialized = true;
      return;
    }

    this.isInitialized = true;

    try {
      console.log('[TumpangFood DB] Syncing with Firestore database via Admin SDK:', foodConfig.databaseId);

      // System Config
      try {
        const remoteConfig = await safeAdminGetDoc('systemConfig', 'config_1');
        if (remoteConfig) {
          this.data.systemConfig = { ...initialConfig, ...remoteConfig } as SystemConfig;
        } else {
          await safeAdminSetDoc('systemConfig', 'config_1', this.data.systemConfig);
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync systemConfig with Firestore:', e.message);
      }

      // Merchants (Firestore as Primary Store)
      try {
        const remoteMerchants = await safeAdminGetDocs('merchants');
        if (remoteMerchants.length > 0) {
          this.data.merchants = remoteMerchants as Merchant[];
        } else if (this.data.merchants.length > 0) {
          for (const m of this.data.merchants) {
            await safeAdminSetDoc('merchants', m.id, m);
          }
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync merchants with Firestore:', e.message);
      }

      // Categories
      try {
        const remoteCats = await safeAdminGetDocs('categories');
        if (remoteCats.length > 0) {
          this.data.categories = remoteCats as Category[];
        } else if (this.data.categories.length > 0) {
          for (const c of this.data.categories) {
            await safeAdminSetDoc('categories', c.id, c);
          }
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync categories with Firestore:', e.message);
      }

      // Menu Items
      try {
        const remoteItems = await safeAdminGetDocs('menuItems');
        if (remoteItems.length > 0) {
          this.data.menuItems = remoteItems as MenuItem[];
        } else if (this.data.menuItems.length > 0) {
          for (const i of this.data.menuItems) {
            await safeAdminSetDoc('menuItems', i.id, i);
          }
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync menuItems with Firestore:', e.message);
      }

      // Drivers
      try {
        const remoteDrivers = await safeAdminGetDocs('drivers');
        if (remoteDrivers.length > 0) {
          this.data.drivers = remoteDrivers as Driver[];
        } else if (this.data.drivers.length > 0) {
          for (const d of this.data.drivers) {
            await safeAdminSetDoc('drivers', d.id, d);
          }
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync drivers with Firestore:', e.message);
      }

      // Orders
      try {
        const remoteOrders = await safeAdminGetDocs('orders');
        if (remoteOrders.length > 0) {
          this.data.orders = (remoteOrders as Order[]).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        } else if (this.data.orders.length > 0) {
          for (const o of this.data.orders) {
            await safeAdminSetDoc('orders', o.id, o);
          }
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync orders with Firestore:', e.message);
      }

      // Settlements
      try {
        const remoteSets = await safeAdminGetDocs('settlements');
        if (remoteSets.length > 0) {
          this.data.settlements = remoteSets as Settlement[];
        } else if (this.data.settlements.length > 0) {
          for (const s of this.data.settlements) {
            await safeAdminSetDoc('settlements', s.id, s);
          }
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync settlements with Firestore:', e.message);
      }

      // Partner Registrations
      try {
        const remoteRegs = await safeAdminGetDocs('partnerRegistrations');
        if (remoteRegs.length > 0) {
          this.data.partnerRegistrations = remoteRegs as PartnerRegistration[];
        } else if (this.data.partnerRegistrations.length > 0) {
          for (const r of this.data.partnerRegistrations) {
            await safeAdminSetDoc('partnerRegistrations', r.id, r);
          }
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync partnerRegistrations with Firestore:', e.message);
      }


      // Audit Logs
      try {
        const remoteLogs = await safeAdminGetDocs('auditLogs');
        if (remoteLogs.length > 0) {
          this.data.auditLogs = (remoteLogs as AuditLog[])
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 500);
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync auditLogs with Firestore:', e.message);
      }

      this.save();
      this.createBackup();
      console.log('[TumpangFood DB] Firestore Admin synchronization successful (Primary Store Active).');
    } catch (err: any) {
      if (foodConfig.isProduction) {
        this.isInitialized = false;
        throw new Error(`[Produksi] Sinkronisasi data dengan Firestore Cloud gagal: ${err.message}. Operasi database ditolak demi integritas data.`);
      }
      console.error('[TumpangFood DB] Firestore sync failed, continuing locally:', err.message);
    }
  }

  // --- LOGGING ---
  public log(userId: string, details: string, role: 'ADMIN' | 'MERCHANT' | 'DRIVER' | 'SYSTEM' | 'CUSTOMER' | 'SHOP_ADMIN' = 'SYSTEM'): AuditLog {
    const logItem: AuditLog = {
      id: 'log_' + Math.random().toString(36).substring(2, 9),
      action: details.split(' ')[0] || 'ACTION',
      userId,
      role,
      details,
      createdAt: new Date().toISOString()
    };
    this.data.auditLogs.unshift(logItem);
    if (this.data.auditLogs.length > 250) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 250);
    }
    this.save();

    safeFirestoreSetDoc('auditLogs', logItem.id, logItem);
    return logItem;
  }

  public addAuditLog(entry: { action?: string; orderId?: string; details: string; performedBy?: string; userId?: string; role?: 'ADMIN' | 'MERCHANT' | 'DRIVER' | 'SYSTEM' | 'CUSTOMER' | 'SHOP_ADMIN' }): AuditLog {
    const userId = entry.performedBy || entry.userId || 'SYSTEM';
    const details = entry.details || (entry.action ? `${entry.action}: ${entry.orderId || ''}` : 'Audit log');
    const role = entry.role || 'SYSTEM';
    return this.log(userId, details, role);
  }

  public getLogs(): AuditLog[] {
    return this.data.auditLogs;
  }

  // --- CONFIG ---
  public getConfig(): SystemConfig {
    return this.data.systemConfig;
  }

  public async updateConfig(userId: string, updates: Partial<SystemConfig>): Promise<SystemConfig> {
    const prevConfig = { ...this.data.systemConfig };
    this.data.systemConfig = { ...this.data.systemConfig, ...updates };
    this.save();
    this.log(userId, `Updated system configuration`, 'ADMIN');

    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc('systemConfig', 'config_1', this.data.systemConfig);
      if (!persisted) {
        this.data.systemConfig = prevConfig;
        this.save();
        throw new Error('[Produksi] Gagal menyimpan konfigurasi sistem ke cloud Firestore. Perubahan dibatalkan demi integritas data.');
      }
    } else {
      safeFirestoreSetDoc('systemConfig', 'config_1', this.data.systemConfig);
    }
    return this.data.systemConfig;
  }

  // --- MERCHANTS ---
  public getMerchants(): Merchant[] {
    if (!this.data || !Array.isArray(this.data.merchants)) {
      return [];
    }
    return this.data.merchants
      .filter((m): m is Merchant => Boolean(m && typeof m === 'object'))
      .map(m => {
        const { password, ...safe } = m;
        return {
          ...safe,
          id: safe.id || 'm_unknown'
        } as Merchant;
      });
  }

  public getMerchantById(id: string): Merchant | undefined {
    if (!this.data || !Array.isArray(this.data.merchants) || !id) return undefined;
    const m = this.data.merchants.find(m => m && m.id === id);
    if (!m) return undefined;
    const { password, ...safe } = m;
    return safe as Merchant;
  }

  public getMerchantByEmailOrPhone(identifier: string): Merchant | undefined {
    const clean = identifier.trim().toLowerCase();
    const cleanNumbers = identifier.replace(/[^0-9]/g, '');
    return this.data.merchants.find(m => {
      const matchId = m.id.toLowerCase() === clean;
      const matchEmail = m.email && m.email.trim().toLowerCase() === clean;
      const matchPhone = m.phone === identifier;
      const matchCleanPhone = cleanNumbers.length >= 8 && m.phone.replace(/[^0-9]/g, '') === cleanNumbers;
      return matchId || matchEmail || matchPhone || matchCleanPhone;
    });
  }

  public async createMerchant(userId: string, merchantData: Omit<Merchant, 'id' | 'createdAt' | 'updatedAt' | 'rating'>): Promise<Merchant> {
    const newMerchant: Merchant = {
      ...merchantData,
      id: 'm_' + Math.random().toString(36).substring(2, 9),
      rating: 5.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (newMerchant.password && !newMerchant.password.startsWith('pbkdf2$')) {
      newMerchant.password = hashPassword(newMerchant.password);
    }

    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc('merchants', newMerchant.id, newMerchant);
      if (!persisted) {
        throw new Error('[Produksi] Gagal menyimpan merchant ke cloud Firestore. Transaksi dibatalkan demi menjaga integritas data.');
      }
    } else {
      safeFirestoreSetDoc('merchants', newMerchant.id, newMerchant);
    }

    this.data.merchants.push(newMerchant);
    this.save();
    this.log(userId, `Created merchant ${newMerchant.name}`, 'ADMIN');
    return newMerchant;
  }

  public async updateMerchant(userId: string, id: string, updates: Partial<Merchant>, role: 'ADMIN' | 'MERCHANT' = 'MERCHANT'): Promise<Merchant> {
    const index = this.data.merchants.findIndex(m => m.id === id);
    if (index === -1) throw new Error('Merchant not found');

    const prevMerchant = { ...this.data.merchants[index] };
    const updatedData = { ...updates };
    if (updatedData.password && !updatedData.password.startsWith('pbkdf2$')) {
      updatedData.password = hashPassword(updatedData.password);
    }

    const nextMerchant = {
      ...this.data.merchants[index],
      ...updatedData,
      updatedAt: new Date().toISOString()
    };

    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc('merchants', id, nextMerchant);
      if (!persisted) {
        throw new Error('[Produksi] Gagal memperbarui merchant pada cloud Firestore. Perubahan dibatalkan demi integritas data.');
      }
    } else {
      safeFirestoreSetDoc('merchants', id, nextMerchant);
    }

    this.data.merchants[index] = nextMerchant;
    this.save();
    this.log(userId, `Updated merchant ${this.data.merchants[index].name}`, role);
    return this.data.merchants[index];
  }

  public async deleteMerchant(userId: string, id: string): Promise<boolean> {
    const index = this.data.merchants.findIndex(m => m.id === id);
    if (index === -1) return false;

    if (foodConfig.isProduction) {
      const deleted = await safeAdminDeleteDoc('merchants', id);
      if (!deleted) {
        throw new Error('[Produksi] Gagal menghapus merchant pada cloud Firestore. Operasi dibatalkan demi integritas data.');
      }
    } else {
      safeAdminDeleteDoc('merchants', id);
    }

    const name = this.data.merchants[index].name;
    this.data.merchants.splice(index, 1);
    this.data.categories = this.data.categories.filter(c => c.merchantId !== id);
    this.data.menuItems = this.data.menuItems.filter(i => i.merchantId !== id);

    this.save();
    this.log(userId, `Deleted merchant ${name}`, 'ADMIN');
    return true;
  }

  public async activateMerchant(email: string, passwordPlain: string): Promise<{ success: boolean; merchant?: Merchant; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const merchant = this.data.merchants.find(m => m.email?.trim().toLowerCase() === cleanEmail);
    if (!merchant) {
      return { success: false, error: 'Merchant dengan email tersebut tidak ditemukan.' };
    }

    const prevMerchant = { ...merchant };
    merchant.active = true;
    merchant.isActivated = true;
    merchant.password = hashPassword(passwordPlain);
    merchant.updatedAt = new Date().toISOString();

    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc('merchants', merchant.id, merchant);
      if (!persisted) {
        Object.assign(merchant, prevMerchant);
        throw new Error('[Produksi] Gagal mengaktifkan merchant pada cloud Firestore. Operasi dibatalkan.');
      }
    } else {
      safeFirestoreSetDoc('merchants', merchant.id, merchant);
    }

    if (this.data.partnerRegistrations) {
      const reg = this.data.partnerRegistrations.find(r => r.email?.trim().toLowerCase() === cleanEmail && r.type === 'MERCHANT');
      if (reg) {
        reg.status = 'ACTIVATED';
        safeFirestoreSetDoc('partnerRegistrations', reg.id, reg);
      }
    }

    this.save();
    this.log(merchant.id, `Activated merchant store ${merchant.name}`, 'MERCHANT');
    return { success: true, merchant };
  }

  // --- CATEGORIES ---
  public getCategories(merchantId: string): Category[] {
    return this.data.categories
      .filter(c => c.merchantId === merchantId)
      .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  }

  public async createCategory(merchantId: string, name: string): Promise<Category> {
    const existing = this.getCategories(merchantId);
    const orderIndex = existing.length > 0 ? Math.max(...existing.map(e => e.orderIndex)) + 1 : 1;
    const newCat: Category = {
      id: 'cat_' + Math.random().toString(36).substring(2, 9),
      merchantId,
      name: name.trim(),
      orderIndex
    };

    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc('categories', newCat.id, newCat);
      if (!persisted) {
        throw new Error('[Produksi] Gagal menyimpan kategori menu ke cloud Firestore. Operasi dibatalkan.');
      }
    } else {
      safeFirestoreSetDoc('categories', newCat.id, newCat);
    }

    this.data.categories.push(newCat);
    this.save();
    this.log(merchantId, `Created category ${name}`, 'MERCHANT');
    return newCat;
  }

  public async updateCategory(merchantId: string, id: string, name: string): Promise<Category> {
    const cat = this.data.categories.find(c => c.id === id && c.merchantId === merchantId);
    if (!cat) throw new Error('Category not found');
    const prevName = cat.name;
    cat.name = name.trim();

    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc('categories', id, cat);
      if (!persisted) {
        cat.name = prevName;
        throw new Error('[Produksi] Gagal memperbarui kategori menu di cloud Firestore. Operasi dibatalkan.');
      }
    } else {
      safeFirestoreSetDoc('categories', id, cat);
    }

    this.save();
    return cat;
  }

  public async deleteCategory(merchantId: string, id: string): Promise<boolean> {
    const index = this.data.categories.findIndex(c => c.id === id && c.merchantId === merchantId);
    if (index === -1) return false;

    if (foodConfig.isProduction) {
      const deleted = await safeAdminDeleteDoc('categories', id);
      if (!deleted) {
        throw new Error('[Produksi] Gagal menghapus kategori menu pada cloud Firestore. Operasi dibatalkan.');
      }
    } else {
      safeAdminDeleteDoc('categories', id);
    }

    this.data.categories.splice(index, 1);
    this.data.menuItems = this.data.menuItems.filter(i => i.categoryId !== id);
    this.save();
    return true;
  }

  // --- MENU ITEMS ---
  public getMenuItemsByMerchant(merchantId: string): MenuItem[] {
    return this.data.menuItems.filter(i => i.merchantId === merchantId);
  }

  public getMenuItemById(id: string): MenuItem | undefined {
    return this.data.menuItems.find(i => i.id === id);
  }

  public async createMenuItem(merchantId: string, itemData: Omit<MenuItem, 'id' | 'merchantId' | 'createdAt' | 'updatedAt'>): Promise<MenuItem> {
    const newItem: MenuItem = {
      ...itemData,
      id: 'item_' + Math.random().toString(36).substring(2, 9),
      merchantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc('menuItems', newItem.id, newItem);
      if (!persisted) {
        throw new Error('[Produksi] Gagal menyimpan item menu ke cloud Firestore. Operasi dibatalkan.');
      }
    } else {
      safeFirestoreSetDoc('menuItems', newItem.id, newItem);
    }

    this.data.menuItems.push(newItem);
    this.save();
    this.log(merchantId, `Created menu item ${newItem.name}`, 'MERCHANT');
    return newItem;
  }

  public async updateMenuItem(merchantId: string, id: string, updates: Partial<MenuItem>): Promise<MenuItem> {
    const index = this.data.menuItems.findIndex(i => i.id === id && i.merchantId === merchantId);
    if (index === -1) throw new Error('Menu item not found');

    const prevItem = { ...this.data.menuItems[index] };
    const nextItem = {
      ...this.data.menuItems[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc('menuItems', id, nextItem);
      if (!persisted) {
        throw new Error('[Produksi] Gagal memperbarui item menu pada cloud Firestore. Operasi dibatalkan.');
      }
    } else {
      safeFirestoreSetDoc('menuItems', id, nextItem);
    }

    this.data.menuItems[index] = nextItem;
    this.save();
    this.log(merchantId, `Updated menu item ${this.data.menuItems[index].name}`, 'MERCHANT');
    return this.data.menuItems[index];
  }

  public async deleteMenuItem(merchantId: string, id: string): Promise<boolean> {
    const index = this.data.menuItems.findIndex(i => i.id === id && i.merchantId === merchantId);
    if (index === -1) return false;

    if (foodConfig.isProduction) {
      const deleted = await safeAdminDeleteDoc('menuItems', id);
      if (!deleted) {
        throw new Error('[Produksi] Gagal menghapus item menu pada cloud Firestore. Operasi dibatalkan.');
      }
    } else {
      safeAdminDeleteDoc('menuItems', id);
    }

    const name = this.data.menuItems[index].name;
    this.data.menuItems.splice(index, 1);
    this.save();
    this.log(merchantId, `Deleted menu item ${name}`, 'MERCHANT');
    return true;
  }

  // --- DRIVERS ---
  public getDrivers(): Driver[] {
    return this.data.drivers.map(d => {
      const { password, ...safe } = d as any;
      return safe as Driver;
    });
  }

  public getDriverById(id: string): Driver | undefined {
    const d = this.data.drivers.find(d => d.id === id);
    if (!d) return undefined;
    const { password, ...safe } = d as any;
    return safe as Driver;
  }

  public getDriverByEmailOrPhone(identifier: string): Driver | undefined {
    const clean = identifier.trim().toLowerCase();
    const cleanPhone = identifier.replace(/[^0-9]/g, '');
    return this.data.drivers.find(d => {
      const matchId = d.id.toLowerCase() === clean;
      const matchEmail = d.email && d.email.trim().toLowerCase() === clean;
      const matchPhone = d.phone === identifier;
      const matchCleanPhone = cleanPhone.length >= 8 && d.phone.replace(/[^0-9]/g, '') === cleanPhone;
      return matchId || matchEmail || matchPhone || matchCleanPhone;
    });
  }

  public async createDriver(userId: string, driverData: Omit<Driver, 'id' | 'createdAt' | 'updatedAt'>): Promise<Driver> {
    const newDriver: Driver = {
      ...driverData,
      id: 'd_' + Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc('drivers', newDriver.id, newDriver);
      if (!persisted) {
        throw new Error('[Produksi] Gagal menyimpan driver ke cloud Firestore. Transaksi dibatalkan.');
      }
    } else {
      safeFirestoreSetDoc('drivers', newDriver.id, newDriver);
    }

    this.data.drivers.push(newDriver);
    this.save();
    this.log(userId, `Created driver ${newDriver.name}`, 'ADMIN');
    return newDriver;
  }

  public async updateDriver(userId: string, id: string, updates: Partial<Driver>, role: 'ADMIN' | 'DRIVER' = 'DRIVER'): Promise<Driver> {
    const index = this.data.drivers.findIndex(d => d.id === id);
    if (index === -1) throw new Error('Driver not found');

    const prevDriver = { ...this.data.drivers[index] };
    const nextDriver = {
      ...this.data.drivers[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc('drivers', id, nextDriver);
      if (!persisted) {
        throw new Error('[Produksi] Gagal memperbarui driver pada cloud Firestore. Perubahan dibatalkan.');
      }
    } else {
      safeFirestoreSetDoc('drivers', id, nextDriver);
    }

    this.data.drivers[index] = nextDriver;
    this.save();
    this.log(userId, `Updated driver ${this.data.drivers[index].name}`, role);
    return this.data.drivers[index];
  }

  public async deleteDriver(userId: string, id: string): Promise<boolean> {
    const index = this.data.drivers.findIndex(d => d.id === id);
    if (index === -1) return false;

    if (foodConfig.isProduction) {
      const deleted = await safeAdminDeleteDoc('drivers', id);
      if (!deleted) {
        throw new Error('[Produksi] Gagal menghapus driver pada cloud Firestore. Operasi dibatalkan.');
      }
    } else {
      safeAdminDeleteDoc('drivers', id);
    }

    const name = this.data.drivers[index].name;
    this.data.drivers.splice(index, 1);
    this.save();
    this.log(userId, `Deleted driver ${name}`, 'ADMIN');
    return true;
  }

  // --- ORDERS ---
  public getOrders(): Order[] {
    return this.data.orders;
  }

  public getOrderById(id: string): Order | undefined {
    return this.data.orders.find(o => o.id === id);
  }

  public getOrdersByMerchant(merchantId: string): Order[] {
    return this.data.orders.filter(o => o.merchantId === merchantId);
  }

  public getOrdersByDriver(driverId: string): Order[] {
    return this.data.orders.filter(o => o.driverId === driverId);
  }

  public getOrdersByCustomerPhone(phone: string): Order[] {
    return this.data.orders.filter(o => o.customerPhone === phone);
  }

  public async findOrder(id: string): Promise<Order | undefined> {
    if (!id) return undefined;
    const cleanId = id.trim();
    let order = this.data.orders.find(o => o.id === cleanId);
    if (!order && isFirestoreAdminConfigured()) {
      try {
        const remote = await safeAdminGetDoc('orders', cleanId);
        if (remote) {
          order = remote as Order;
          const idx = this.data.orders.findIndex(o => o.id === cleanId);
          if (idx >= 0) this.data.orders[idx] = order;
          else this.data.orders.unshift(order);
        }
      } catch (e: any) {
        console.warn(`[TumpangFood DB] Query remote order ${cleanId} failed:`, e.message);
      }
    }
    return order;
  }

  public async createOrder(rawInput: any): Promise<Order> {
    const merchant = this.getMerchantById(rawInput.merchantId);
    if (!merchant) throw new Error('Toko / Merchant tidak ditemukan.');

    // 1. Idempotency Check (clientRequestId)
    if (rawInput.clientRequestId && String(rawInput.clientRequestId).trim().length > 0) {
      const cleanReqId = String(rawInput.clientRequestId).trim();
      const existingReq = this.data.orders.find(o => (o as any).clientRequestId === cleanReqId);
      if (existingReq) {
        return existingReq;
      }
    }

    // 2. Prevent duplicate orders submitted within 10 seconds with identical details
    const recentDuplicate = this.data.orders.find(o => 
      o.merchantId === rawInput.merchantId &&
      o.customerPhone === rawInput.customerPhone &&
      Date.now() - new Date(o.createdAt).getTime() < 10000 &&
      o.status === OrderStatus.WAITING_PAYMENT
    );
    if (recentDuplicate) {
      return recentDuplicate;
    }

    const activeUniqueCodes = this.data.orders
      .filter(o => o.status === OrderStatus.WAITING_PAYMENT || o.status === OrderStatus.WAITING_PAYMENT_VERIFICATION)
      .map(o => o.uniqueCode);

    const validatedOrderData = OrderService.validateAndBuildOrder(
      rawInput,
      merchant,
      this.data.menuItems,
      this.data.systemConfig,
      activeUniqueCodes
    );

    const newOrder: Order = {
      ...validatedOrderData,
      id: 'ord_' + Math.random().toString(36).substring(2, 9),
      clientRequestId: rawInput.clientRequestId ? String(rawInput.clientRequestId).trim() : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.data.orders.unshift(newOrder);
    this.save();
    this.log('CUSTOMER', `Created order ${newOrder.id} Total: Rp ${newOrder.total.toLocaleString()} (UniqueCode: ${newOrder.uniqueCode})`, 'CUSTOMER');

    const probe = await testFirestoreConnection();
    if (foodConfig.isProduction || probe.connected) {
      const persisted = await safeFirestoreSetDoc('orders', newOrder.id, newOrder);
      if (!persisted) {
        this.data.orders.shift();
        this.save();
        throw new Error('Gagal menyimpan pesanan ke cloud Firestore. Transaksi dibatalkan secara aman demi mencegah kehilangan data atau transaksi ganda.');
      }
    } else {
      safeFirestoreSetDoc('orders', newOrder.id, newOrder);
    }
    return newOrder;
  }

  public async updateOrder(
    userId: string,
    id: string,
    updates: Partial<Order>,
    role: 'ADMIN' | 'MERCHANT' | 'DRIVER' | 'SYSTEM' | 'CUSTOMER' | 'SHOP_ADMIN'
  ): Promise<Order> {
    const index = this.data.orders.findIndex(o => o.id === id);
    if (index === -1) throw new Error('Order not found');

    const currentOrder = this.data.orders[index];
    const prevStatus = currentOrder.status;

    // Validate state transition if status is being updated
    if (updates.status && updates.status !== prevStatus) {
      const check = OrderService.isValidStatusTransition(prevStatus, updates.status, role);
      if (!check.allowed) {
        throw new Error(check.reason || 'Perubahan status pesanan tidak diizinkan.');
      }
    }

    // Customer or merchant cannot alter financials or item prices
    if (role !== 'ADMIN' && role !== 'SYSTEM') {
      delete (updates as any).subtotal;
      delete (updates as any).deliveryFee;
      delete (updates as any).serviceFee;
      delete (updates as any).total;
      delete (updates as any).uniqueCode;
    }

    this.data.orders[index] = {
      ...currentOrder,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save();

    if (updates.status && updates.status !== prevStatus) {
      this.log(userId, `Updated order ${id} status from ${prevStatus} to ${updates.status}`, role);

      // Auto-assign driver when payment is verified if configured
      if (
        updates.status === OrderStatus.PAYMENT_VERIFIED &&
        this.data.systemConfig.assignmentMode === AssignmentMode.AUTOMATIC
      ) {
        await this.autoAssignDriver(id);
      }
    } else {
      this.log(userId, `Updated order ${id} details`, role);
    }

    const probe = await testFirestoreConnection();
    if (foodConfig.isProduction || probe.connected) {
      const persisted = await safeFirestoreSetDoc('orders', id, this.data.orders[index]);
      if (!persisted) {
        this.data.orders[index] = currentOrder;
        this.save();
        throw new Error('Gagal memperbarui status pesanan pada cloud Firestore. Perubahan status dibatalkan demi integritas data.');
      }
    } else {
      safeFirestoreSetDoc('orders', id, this.data.orders[index]);
    }
    return this.data.orders[index];
  }

  public async autoAssignDriver(orderId: string): Promise<void> {
    const order = this.getOrderById(orderId);
    if (!order) return;

    const availableDrivers = this.data.drivers.filter(d => d.online && d.active);
    if (availableDrivers.length === 0) {
      this.log('SYSTEM', `No active drivers available for auto-assignment of order ${orderId}`, 'SYSTEM');
      return;
    }

    // Assign to driver with least active tasks
    const driverTaskCounts = availableDrivers.map(d => {
      const activeTasks = this.data.orders.filter(o =>
        o.driverId === d.id &&
        [OrderStatus.PAYMENT_VERIFIED, OrderStatus.COOKING, OrderStatus.READY_FOR_PICKUP, OrderStatus.ORDER_PICKED_UP].includes(o.status)
      ).length;
      return { driver: d, count: activeTasks };
    });

    driverTaskCounts.sort((a, b) => a.count - b.count);
    const selectedDriver = driverTaskCounts[0].driver;

    await this.updateOrder('SYSTEM', orderId, {
      driverId: selectedDriver.id,
      driverName: selectedDriver.name
    }, 'SYSTEM');
  }

  public async manualAssignDriver(userId: string, orderId: string, driverId: string): Promise<Order> {
    const driver = this.getDriverById(driverId);
    if (!driver) throw new Error('Driver not found');

    const updated = await this.updateOrder(userId, orderId, {
      driverId: driver.id,
      driverName: driver.name
    }, 'ADMIN');

    this.log(userId, `Assigned driver ${driver.name} to order ${orderId}`, 'ADMIN');
    return updated;
  }

  // --- SETTLEMENTS ---
  public getSettlements(): Settlement[] {
    return this.data.settlements;
  }

  public getSettlementsByMerchant(merchantId: string): Settlement[] {
    return this.data.settlements.filter(s => s.merchantId === merchantId);
  }

  private settlementMutex: Promise<any> = Promise.resolve();

  /**
   * Serializes settlement operations across the process and host instances to prevent concurrent double-settlements
   */
  public async runWithSettlementLock<T>(fn: () => Promise<T> | T): Promise<T> {
    let release: () => void;
    const waitPromise = new Promise<void>(resolve => {
      release = resolve;
    });
    const currentMutex = this.settlementMutex;
    this.settlementMutex = currentMutex.then(() => waitPromise).catch(() => waitPromise);
    await currentMutex;

    // Cross-process filesystem atomic lock (guards separate Node processes)
    const lockPath = path.join(path.dirname(FOOD_DB_FILE), 'settlement_operation.lock');
    let fileLockAcquired = false;
    for (let attempts = 0; attempts < 30; attempts++) {
      try {
        const fd = fs.openSync(lockPath, 'wx');
        fs.writeSync(fd, `${process.pid}:${Date.now()}`);
        fs.closeSync(fd);
        fileLockAcquired = true;
        break;
      } catch (err: any) {
        if (err.code === 'EEXIST') {
          try {
            const stats = fs.statSync(lockPath);
            if (Date.now() - stats.mtimeMs > 15000) {
              fs.unlinkSync(lockPath);
              continue;
            }
          } catch {
            // lock file was freed concurrently
          }
          await new Promise(r => setTimeout(r, 100));
        } else {
          break;
        }
      }
    }

    try {
      return await fn();
    } finally {
      if (fileLockAcquired) {
        try {
          fs.unlinkSync(lockPath);
        } catch {}
      }
      release!();
    }
  }

  public async createSettlement(
    userId: string,
    settlementData: { merchantId: string; orderIds?: string[] } & Partial<Settlement>
  ): Promise<Settlement> {
    return this.runWithSettlementLock(async () => {
      const targetOrderIds = settlementData.orderIds || [];
      if (!Array.isArray(targetOrderIds) || targetOrderIds.length === 0) {
        throw new Error('Settlement wajib menyertakan setidaknya satu ID pesanan yang memenuhi syarat.');
      }

      // Check merchant existence
      const merchant = this.data.merchants.find(m => m.id === settlementData.merchantId);
      if (!merchant) {
        throw new Error(`Merchant dengan ID "${settlementData.merchantId}" tidak ditemukan.`);
      }

      // 1. ATOMIC VALIDATION: Local state check
      const verifiedOrders: Order[] = [];
      for (const ordId of targetOrderIds) {
        const ord = this.data.orders.find(o => o.id === ordId);
        if (!ord) {
          throw new Error(`Pesanan "${ordId}" tidak ditemukan dalam database.`);
        }
        if (ord.merchantId !== settlementData.merchantId) {
          throw new Error(`Pesanan "${ordId}" bukan milik merchant ${settlementData.merchantId}.`);
        }
        if (ord.status !== OrderStatus.COMPLETED) {
          throw new Error(`Pesanan "${ordId}" belum selesai (status: ${ord.status}). Hanya pesanan COMPLETED yang dapat dicairkan.`);
        }
        if ((ord as any).isSettled === true || (ord as any).settlementId) {
          throw new Error(`Pesanan "${ordId}" sudah pernah dicairkan dalam settlement sebelumnya. Pencairan ganda dicegah secara atomik.`);
        }
        verifiedOrders.push(ord);
      }

      // 2. AUTHORITATIVE SERVER-SIDE RECALCULATION
      const orderCount = verifiedOrders.length;
      const totalSales = verifiedOrders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
      const commissionPercent = this.data.systemConfig.commissionPercent || 10;
      const totalCommission = Math.round((totalSales * commissionPercent) / 100);
      const amountToPay = Math.max(0, totalSales - totalCommission);

      const settlementId = 'set_' + Math.random().toString(36).substring(2, 9);
      const nowIso = new Date().toISOString();

      const newSettlement: Settlement = {
        id: settlementId,
        merchantId: merchant.id,
        merchantName: merchant.name,
        orderCount,
        totalSales,
        totalCommission,
        amountToPay,
        status: settlementData.status || SettlementStatus.WAITING_CONFIRMATION,
        bankName: settlementData.bankName || merchant.bankName || 'Bank Mandiri',
        bankAccount: settlementData.bankAccount || merchant.bankAccount || '-',
        bankHolder: settlementData.bankHolder || merchant.bankHolder || merchant.ownerName,
        createdAt: nowIso
      };

      // 3. DISTRIBUTED CLOUD TRANSACTION (Cross-instance & cross-container ACID isolation)
      const adminDb = getAdminDb();
      if (adminDb) {
        try {
          await runAdminTransaction(async (transaction) => {
            // Transactional Read: verify no order is settled in remote cloud Firestore
            for (const ordId of targetOrderIds) {
              const orderRef = adminDb.collection('orders').doc(ordId);
              const remoteSnap = await transaction.get(orderRef);
              if (remoteSnap.exists) {
                const remoteData = remoteSnap.data();
                if (remoteData?.isSettled === true || remoteData?.settlementId) {
                  throw new Error(`Pesanan "${ordId}" telah dicairkan oleh instance backend lain. Pencairan ganda lintas-instance dicegah secara atomik.`);
                }
              }
            }

            // Transactional Write: update orders
            for (const ord of verifiedOrders) {
              const orderRef = adminDb.collection('orders').doc(ord.id);
              transaction.set(orderRef, removeUndefinedFields({
                ...ord,
                isSettled: true,
                settlementId: settlementId,
                settledAt: nowIso,
                updatedAt: nowIso
              }), { merge: true });
            }

            // Transactional Write: create settlement document
            const settlementRef = adminDb.collection('settlements').doc(newSettlement.id);
            transaction.set(settlementRef, removeUndefinedFields(newSettlement));
          });
        } catch (txErr: any) {
          if (txErr.message && txErr.message.includes('telah dicairkan')) {
            throw txErr;
          }
          if (foodConfig.isProduction) {
            throw new Error(`[Produksi] Transaksi cloud Firestore gagal: ${txErr.message}. Pencairan dibatalkan demi menjaga integritas data keuangan.`);
          }
          console.warn('[TumpangFood DB] Distributed Firestore Admin transaction fallback in development mode:', txErr.message);
        }
      } else if (foodConfig.isProduction) {
        throw new Error('[Produksi] Firebase Admin Firestore wajib aktif dan terhubung untuk memproses pencairan dana (settlement).');
      }

      // 4. LOCAL COMMIT: Mark all orders as settled and attach settlementId
      for (const ord of verifiedOrders) {
        (ord as any).isSettled = true;
        (ord as any).settlementId = settlementId;
        (ord as any).settledAt = nowIso;
        (ord as any).updatedAt = nowIso;
        safeFirestoreSetDoc('orders', ord.id, ord);
      }

      this.data.settlements.unshift(newSettlement);
      this.save();
      this.createBackup();

      this.log(
        userId,
        `Created settlement ${settlementId} of Rp ${amountToPay.toLocaleString()} for ${merchant.name} (${orderCount} pesanan)`,
        'ADMIN'
      );

      safeFirestoreSetDoc('settlements', newSettlement.id, newSettlement);
      return newSettlement;
    });
  }

  public async updateSettlement(userId: string, id: string, updates: Partial<Settlement>): Promise<Settlement> {
    const index = this.data.settlements.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Settlement not found');

    const nextSettlement = {
      ...this.data.settlements[index],
      ...updates,
      paidAt: updates.status === SettlementStatus.SETTLEMENT_COMPLETED ? new Date().toISOString() : this.data.settlements[index].paidAt
    };

    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc('settlements', id, nextSettlement);
      if (!persisted) {
        throw new Error('[Produksi] Gagal memperbarui settlement di cloud Firestore. Perubahan dibatalkan.');
      }
    } else {
      safeFirestoreSetDoc('settlements', id, nextSettlement);
    }

    this.data.settlements[index] = nextSettlement;
    this.save();
    this.createBackup();
    this.log(userId, `Updated settlement ${id} to status ${this.data.settlements[index].status}`, 'ADMIN');
    return this.data.settlements[index];
  }

  public async confirmSettlement(userId: string, id: string): Promise<Settlement> {
    return this.updateSettlement(userId, id, { status: SettlementStatus.SETTLEMENT_COMPLETED });
  }

  public async generateHPlusOneSettlements(userId: string): Promise<Settlement[]> {
    return this.runWithSettlementLock(async () => {
      // Filter orders strictly completed and not yet settled
      const targetOrders = this.data.orders.filter(
        o => o.status === OrderStatus.COMPLETED && !(o as any).isSettled && !(o as any).settlementId
      );
      if (targetOrders.length === 0) return [];

      const grouped = new Map<string, Order[]>();
      for (const o of targetOrders) {
        const list = grouped.get(o.merchantId) || [];
        list.push(o);
        grouped.set(o.merchantId, list);
      }

      const createdSettlements: Settlement[] = [];
      const commissionPercent = this.data.systemConfig.commissionPercent || 10;
      const nowIso = new Date().toISOString();

      for (const [merchantId, orders] of grouped.entries()) {
        const merchant = this.data.merchants.find(m => m.id === merchantId);
        if (!merchant) continue;

        const orderCount = orders.length;
        const totalSales = orders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
        const totalCommission = Math.round((totalSales * commissionPercent) / 100);
        const amountToPay = Math.max(0, totalSales - totalCommission);

        const settlementId = 'set_' + Math.random().toString(36).substring(2, 9);
        const newSettlement: Settlement = {
          id: settlementId,
          merchantId,
          merchantName: merchant.name,
          orderCount,
          totalSales,
          totalCommission,
          amountToPay,
          status: SettlementStatus.WAITING_CONFIRMATION,
          bankName: merchant.bankName || 'Bank Mandiri',
          bankAccount: merchant.bankAccount || '-',
          bankHolder: merchant.bankHolder || merchant.ownerName,
          createdAt: nowIso
        };

        const adminDb = getAdminDb();
        if (adminDb) {
          try {
            await runAdminTransaction(async (transaction) => {
              for (const o of orders) {
                const orderRef = adminDb.collection('orders').doc(o.id);
                const snap = await transaction.get(orderRef);
                if (snap.exists) {
                  const data = snap.data();
                  if (data?.isSettled === true || data?.settlementId) {
                    throw new Error(`Order ${o.id} already settled.`);
                  }
                }
              }
              for (const o of orders) {
                const orderRef = adminDb.collection('orders').doc(o.id);
                transaction.set(orderRef, removeUndefinedFields({
                  ...o,
                  isSettled: true,
                  settlementId,
                  settledAt: nowIso,
                  updatedAt: nowIso
                }), { merge: true });
              }
              const settlementRef = adminDb.collection('settlements').doc(newSettlement.id);
              transaction.set(settlementRef, removeUndefinedFields(newSettlement));
            });
          } catch (txErr: any) {
            if (foodConfig.isProduction) {
              throw new Error(`[Produksi] Transaksi cloud Firestore gagal untuk merchant ${merchantId}: ${txErr.message}`);
            }
            console.warn(`[TumpangFood DB] H+1 atomic transaction fallback for ${merchantId}:`, txErr.message);
          }
        } else if (foodConfig.isProduction) {
          throw new Error('[Produksi] Firebase Admin Firestore wajib aktif untuk membuat H+1 settlements.');
        }

        for (const o of orders) {
          (o as any).isSettled = true;
          (o as any).settlementId = settlementId;
          (o as any).settledAt = nowIso;
          (o as any).updatedAt = nowIso;
          safeFirestoreSetDoc('orders', o.id, o);
        }

        this.data.settlements.unshift(newSettlement);
        safeFirestoreSetDoc('settlements', newSettlement.id, newSettlement);
        createdSettlements.push(newSettlement);
      }

      this.save();
      this.createBackup();
      this.log(userId, `Generated H+1 settlements for ${createdSettlements.length} merchants`, 'ADMIN');
      return createdSettlements;
    });
  }

  // --- PARTNER REGISTRATIONS ---
  public getPartnerRegistrations(): PartnerRegistration[] {
    return this.data.partnerRegistrations;
  }

  public async createPartnerRegistration(regData: Omit<PartnerRegistration, 'id' | 'status' | 'createdAt'>): Promise<PartnerRegistration> {
    const newReg: PartnerRegistration = {
      ...regData,
      id: 'reg_' + Math.random().toString(36).substring(2, 9),
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };

    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc('partnerRegistrations', newReg.id, newReg);
      if (!persisted) {
        throw new Error('[Produksi] Gagal menyimpan pendaftaran mitra ke cloud Firestore. Transaksi dibatalkan.');
      }
    } else {
      safeFirestoreSetDoc('partnerRegistrations', newReg.id, newReg);
    }

    this.data.partnerRegistrations.push(newReg);
    this.save();
    this.log('CUSTOMER', `Submitted partner registration for ${newReg.name} (${newReg.type})`, 'CUSTOMER');
    return newReg;
  }

  public async approvePartnerRegistration(userId: string, id: string): Promise<{ success: boolean; error?: string; registration?: PartnerRegistration }> {
    const reg = this.data.partnerRegistrations.find(r => r.id === id);
    if (!reg) return { success: false, error: 'Registration not found' };
    if (reg.status !== 'PENDING') return { success: false, error: 'Registration already processed' };

    const prevStatus = reg.status;
    reg.status = 'APPROVED';

    if (reg.type === 'MERCHANT') {
      const generatedPassword = 'TF-' + Math.floor(1000 + Math.random() * 9000);
      reg.password = generatedPassword;

      const newMerchant = await this.createMerchant(userId, {
        name: reg.storeName || (reg.name + ' Store'),
        ownerName: reg.name,
        phone: reg.phone,
        address: reg.storeAddress || 'Alamat Toko',
        latitude: reg.latitude || -7.9482,
        longitude: reg.longitude || 112.7612,
        openTime: '08:00',
        closeTime: '21:00',
        bankName: 'Bank BRI',
        bankAccount: '1234567890',
        bankHolder: reg.name,
        active: true,
        cookTimeEstimate: '15-30 min',
        image: reg.businessPhoto || 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
        description: 'Toko baru bergabung di Tumpang Food!',
        category: reg.category || 'Nasi & Lauk',
        email: reg.email,
        isActivated: true,
        password: hashPassword(generatedPassword),
        businessPhoto: reg.businessPhoto,
        idPhoto: reg.idPhoto,
        contractPhoto: reg.contractPhoto
      });

      reg.storeId = newMerchant.id;

      // Add default category and item
      const defaultCategory = await this.createCategory(newMerchant.id, 'Menu Utama');
      await this.createMenuItem(newMerchant.id, {
        categoryId: defaultCategory.id,
        name: 'Nasi Goreng Spesial (Contoh)',
        description: 'Nasi goreng lezat dengan bumbu khas, telur, dan kerupuk.',
        price: 15000,
        available: true,
        image: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3'
      });
    } else if (reg.type === 'DRIVER') {
      await this.createDriver(userId, {
        name: reg.name,
        phone: reg.phone,
        email: reg.email,
        active: true,
        online: false,
        latitude: -7.9482,
        longitude: 112.7612
      });
    }

    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc('partnerRegistrations', reg.id, reg);
      if (!persisted) {
        reg.status = prevStatus;
        throw new Error('[Produksi] Gagal memperbarui status registrasi mitra ke cloud Firestore.');
      }
    } else {
      safeFirestoreSetDoc('partnerRegistrations', reg.id, reg);
    }

    this.save();
    this.log(userId, `Approved partner registration ${reg.id} (${reg.name})`, 'ADMIN');
    return { success: true, registration: reg };
  }

  public async rejectPartnerRegistration(userId: string, id: string): Promise<boolean> {
    const reg = this.data.partnerRegistrations.find(r => r.id === id);
    if (!reg) return false;
    const prevStatus = reg.status;
    reg.status = 'REJECTED';

    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc('partnerRegistrations', reg.id, reg);
      if (!persisted) {
        reg.status = prevStatus;
        throw new Error('[Produksi] Gagal menolak pendaftaran mitra pada cloud Firestore.');
      }
    } else {
      safeFirestoreSetDoc('partnerRegistrations', reg.id, reg);
    }

    this.save();
    this.log(userId, `Rejected partner registration ${reg.id} (${reg.name})`, 'ADMIN');
    return true;
  }
}

export const foodDb = new FoodDatabase();
