/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop Modular Courier Adapter Architecture
 * Isolates local delivery and cross-border international shipping (China -> Indonesia).
 * Enforces zero-fabrication: explicitly flags unverified estimates and manual update state
 * when live courier APIs are not yet configured.
 */

import { ShopShipmentScope, ShopShipmentStatus, ShopShippingOption } from '../../types/shop';

export interface CourierServiceDefinition {
  code: string;
  name: string;
  scope: ShopShipmentScope;
  baseCost: number;
  estimatedDays: string;
  isEstimateVerified: boolean;
  description: string;
}

export interface CourierAdapter {
  code: string;
  name: string;
  scope: ShopShipmentScope;
  originCountry: string;
  originCity: string;
  destinationCountry: string;
  isConfigured(): boolean;
  supportsLiveTracking(): boolean;
  getAdapterNote(): string;
  getServices(): CourierServiceDefinition[];
  getRelevantStatuses(): { status: ShopShipmentStatus; label: string; description: string }[];
}

/**
 * 1. Adapter Pengiriman Lokal Tumpang (Kurir Toko)
 */
export class TumpangLocalCourierAdapter implements CourierAdapter {
  public code = 'TUMPANG_LOCAL';
  public name = 'Kurir Toko Tumpang Go';
  public scope: ShopShipmentScope = 'LOCAL';
  public originCountry = 'ID';
  public originCity = 'Kecamatan Tumpang, Malang';
  public destinationCountry = 'ID';

  public isConfigured(): boolean {
    return true; // Kurir toko internal selalu aktif
  }

  public supportsLiveTracking(): boolean {
    return false; // Dikelola manual oleh admin toko
  }

  public getAdapterNote(): string {
    return 'Layanan pengantaran langsung armada Toko Tumpang Shop untuk area Tumpang dan sekitarnya. Pembaruan status dikelola langsung oleh admin toko.';
  }

  public getServices(): CourierServiceDefinition[] {
    return [
      {
        code: 'INSTANT_SHOP',
        name: 'Kurir Instan Tumpang (Same-Day)',
        scope: 'LOCAL',
        baseCost: 4000,
        estimatedDays: '1-3 jam setelah dikemas',
        isEstimateVerified: true,
        description: 'Pengantaran cepat langsung ke rumah Anda di wilayah Tumpang dan sekitarnya.'
      },
      {
        code: 'REGULAR_SHOP',
        name: 'Kurir Reguler Toko (Next-Day)',
        scope: 'LOCAL',
        baseCost: 3000,
        estimatedDays: '1 hari (Kirim besok pagi)',
        isEstimateVerified: true,
        description: 'Jadwal pengiriman pagi hari berikutnya dengan biaya lebih hemat.'
      },
      {
        code: 'PICKUP_SHOP',
        name: 'Ambil Sendiri di Toko (Pickup)',
        scope: 'LOCAL',
        baseCost: 0,
        estimatedDays: 'Siap diambil saat toko buka',
        isEstimateVerified: true,
        description: 'Ambil belanjaan langsung ke gerai resmi Tumpang Shop tanpa ongkir.'
      }
    ];
  }

  public getRelevantStatuses() {
    return [
      { status: ShopShipmentStatus.WAITING_DISPATCH, label: 'Menunggu Pengiriman', description: 'Pesanan telah diverifikasi dan menunggu penugasan kurir toko.' },
      { status: ShopShipmentStatus.PROCESSING, label: 'Diproses di Gudang', description: 'Barang belanjaan sedang dipersiapkan dan dikemas aman.' },
      { status: ShopShipmentStatus.OUT_FOR_DELIVERY, label: 'Dalam Pengantaran', description: 'Kurir toko sedang menuju alamat pengantaran penerima.' },
      { status: ShopShipmentStatus.DELIVERED, label: 'Terkirim', description: 'Pesanan telah berhasil diserahkan kepada penerima di alamat tujuan.' },
      { status: ShopShipmentStatus.FAILED_DELIVERY, label: 'Gagal Dikirim', description: 'Kurir tidak dapat menemukan alamat atau penerima tidak berada di tempat.' }
    ];
  }
}

/**
 * 2. Adapter Ekspedisi Domestik Nasional (JNE / J&T / SiCepat Stub)
 */
export class DomesticExpeditionAdapter implements CourierAdapter {
  public code = 'DOMESTIC_EXPEDITION';
  public name = 'Ekspedisi Domestik Reguler (J&T / JNE)';
  public scope: ShopShipmentScope = 'LOCAL';
  public originCountry = 'ID';
  public originCity = 'Malang, Jawa Timur';
  public destinationCountry = 'ID';

  public isConfigured(): boolean {
    return false; // Belum ada API key pihak ketiga
  }

  public supportsLiveTracking(): boolean {
    return false;
  }

  public getAdapterNote(): string {
    return 'Adapter ekspedisi domestik telah siap. Kredensial API kurir pihak ketiga (J&T/JNE) belum disetel. Riwayat nomor resi dan tracking dicatat secara manual oleh Admin Tumpang Shop.';
  }

  public getServices(): CourierServiceDefinition[] {
    return [
      {
        code: 'EXPEDITION_REGULAR',
        name: 'Ekspedisi Domestik Standar (2-3 Hari)',
        scope: 'LOCAL',
        baseCost: 12000,
        estimatedDays: '2-3 hari kerja (Estimasi manual belum terverifikasi API)',
        isEstimateVerified: false,
        description: 'Pengiriman untuk area luar kecamatan Tumpang di Malang Raya dan Jawa Timur.'
      }
    ];
  }

  public getRelevantStatuses() {
    return [
      { status: ShopShipmentStatus.WAITING_DISPATCH, label: 'Menunggu Pengiriman', description: 'Paket siap diserahkan ke counter ekspedisi.' },
      { status: ShopShipmentStatus.DISPATCHED, label: 'Diserahkan ke Ekspedisi', description: 'Paket telah diterima di drop point counter ekspedisi.' },
      { status: ShopShipmentStatus.IN_TRANSIT, label: 'Dalam Perjalanan Antar Kota', description: 'Paket sedang dalam perjalanan transit hub logistik.' },
      { status: ShopShipmentStatus.OUT_FOR_DELIVERY, label: 'Dalam Pengantaran Kurir', description: 'Kurir ekspedisi membawa paket menuju alamat tujuan.' },
      { status: ShopShipmentStatus.DELIVERED, label: 'Terkirim', description: 'Paket berhasil diterima oleh penerima.' }
    ];
  }
}

/**
 * 3. Adapter Pengiriman Internasional Khusus (China -> Indonesia Cross-Border)
 */
export class ChinaIndonesiaCrossBorderAdapter implements CourierAdapter {
  public code = 'CHINA_ID_CROSSBORDER';
  public name = 'Layanan Impor Cross-Border (China 🇨🇳 → Indonesia 🇮🇩)';
  public scope: ShopShipmentScope = 'INTERNATIONAL';
  public originCountry = 'CN';
  public originCity = 'Gudang Konsolidasi Shenzhen / Guangzhou, China';
  public destinationCountry = 'ID';

  public isConfigured(): boolean {
    return false; // API Cainiao / YunExpress / China Post belum terhubung
  }

  public supportsLiveTracking(): boolean {
    return false;
  }

  public getAdapterNote(): string {
    return 'Modul pelacakan jalur internasional China → Indonesia aktif. API live kurir internasional belum dikonfigurasi, seluruh pembaruan tahapan (ekspor, kargo internasional, bea cukai, kurir lokal) diverifikasi dan dicatat manual oleh Admin Tumpang Shop.';
  }

  public getServices(): CourierServiceDefinition[] {
    return [
      {
        code: 'CHINA_AIR_EXPRESS',
        name: 'China Air Freight Express (7-12 Hari)',
        scope: 'INTERNATIONAL',
        baseCost: 35000,
        estimatedDays: '7-12 hari kerja (Estimasi unverified bergantung proses bea cukai)',
        isEstimateVerified: false,
        description: 'Jalur kargo udara prioritas dari Shenzhen/Guangzhou langsung menuju Bandara Soekarno-Hatta.'
      },
      {
        code: 'CHINA_SEA_STANDARD',
        name: 'China Sea Freight Ekonomis (20-30 Hari)',
        scope: 'INTERNATIONAL',
        baseCost: 20000,
        estimatedDays: '20-30 hari kalender (Estimasi unverified bergantung pelabuhan)',
        isEstimateVerified: false,
        description: 'Jalur kargo laut kontainer untuk paket berbobot besar dengan tarif ekonomis.'
      }
    ];
  }

  public getRelevantStatuses() {
    return [
      { status: ShopShipmentStatus.WAITING_DISPATCH, label: 'Menunggu Pengiriman', description: 'Pesanan diterima pabrik/supplier di China dan menunggu pengemasan ekspor.' },
      { status: ShopShipmentStatus.PROCESSING, label: 'Diproses di Gudang Asal (China)', description: 'Paket tiba di sorting center Shenzhen/Guangzhou untuk pelabelan resi internasional.' },
      { status: ShopShipmentStatus.DISPATCHED, label: 'Dikirim dari Negara Asal', description: 'Paket telah lolos pemindaian ekspor dan diberangkatkan ke bandara/pelabuhan asal.' },
      { status: ShopShipmentStatus.IN_TRANSIT, label: 'Dalam Perjalanan Internasional', description: 'Paket sedang transit rute kargo internasional menuju Indonesia.' },
      { status: ShopShipmentStatus.ARRIVED_INDONESIA, label: 'Tiba di Indonesia', description: 'Paket telah mendarat di Port of Entry (Bandara CGK / Pelabuhan Tanjung Priok).' },
      { status: ShopShipmentStatus.CUSTOMS_CLEARANCE, label: 'Pemeriksaan Bea Cukai', description: 'Paket sedang melalui proses verifikasi kepabeanan dan pembayaran bea impor.' },
      { status: ShopShipmentStatus.CUSTOMS_HOLD, label: 'Tertahan di Bea Cukai', description: 'Paket memerlukan konfirmasi dokumen tambahan atau pembayaran pajak kepabeanan.' },
      { status: ShopShipmentStatus.TRANSFERRED_LOCAL_COURIER, label: 'Diteruskan Kurir Lokal', description: 'Paket telah selesai diperiksa Bea Cukai dan diserahkan ke kurir domestik Indonesia.' },
      { status: ShopShipmentStatus.OUT_FOR_DELIVERY, label: 'Dalam Pengantaran ke Alamat', description: 'Kurir lokal membawa paket menuju alamat penerima di Tumpang.' },
      { status: ShopShipmentStatus.DELIVERED, label: 'Terkirim ke Penerima', description: 'Paket impor berhasil diterima oleh pemesan di Tumpang.' }
    ];
  }
}

/**
 * Adapter Registry Singleton
 */
export class CourierAdapterRegistry {
  private adapters: Map<string, CourierAdapter> = new Map();

  constructor() {
    this.register(new TumpangLocalCourierAdapter());
    this.register(new DomesticExpeditionAdapter());
    this.register(new ChinaIndonesiaCrossBorderAdapter());
  }

  public register(adapter: CourierAdapter) {
    this.adapters.set(adapter.code, adapter);
  }

  public get(code: string): CourierAdapter | undefined {
    return this.adapters.get(code);
  }

  public getAll(): CourierAdapter[] {
    return Array.from(this.adapters.values());
  }

  public getAvailableShippingOptions(): ShopShippingOption[] {
    const list: ShopShippingOption[] = [];

    for (const adapter of this.adapters.values()) {
      for (const s of adapter.getServices()) {
        list.push({
          code: s.code,
          courierCode: adapter.code,
          courierName: adapter.name,
          serviceName: s.name,
          scope: s.scope,
          originCountry: adapter.originCountry,
          originCity: adapter.originCity,
          estimatedDays: s.estimatedDays,
          baseCost: s.baseCost,
          description: s.description,
          isAvailable: true,
          isLiveApiIntegrated: adapter.isConfigured(),
          note: adapter.getAdapterNote()
        });
      }
    }

    return list;
  }
}

export const courierRegistry = new CourierAdapterRegistry();
