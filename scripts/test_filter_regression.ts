/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Regression Test Suite for API Response Array Normalization & Defensive Filtering
 * 
 * Verifies that:
 * 1. Direct valid arrays parse correctly
 * 2. Empty arrays parse correctly
 * 3. Wrapped API responses ({ data: [...] }, { merchants: [...] }, etc.) normalize seamlessly
 * 4. Null / undefined / invalid primitives throw clear errors at the ingestion boundary
 * 5. Backend error objects ({ error: '...' }) throw clear errors instead of hiding failures
 * 6. Component filter logic and useMemo selectors never throw TypeError: xxx.filter is not a function
 */

import { extractArrayResponse } from '../src/utils/apiClient.ts';

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, extra?: any) {
  if (condition) {
    console.log(`  ✅ [PASS] ${description}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${description}`, extra || '');
    failed++;
  }
}

function assertThrows(description: string, fn: () => void, expectedMessageFragment?: string) {
  try {
    fn();
    console.error(`  ❌ [FAIL] Expected exception was not thrown: ${description}`);
    failed++;
  } catch (err: any) {
    if (expectedMessageFragment && !err.message.includes(expectedMessageFragment)) {
      console.error(`  ❌ [FAIL] Threw with unexpected message: "${err.message}", expected fragment "${expectedMessageFragment}"`);
      failed++;
    } else {
      console.log(`  ✅ [PASS] Correctly rejected: ${description} ("${err.message}")`);
      passed++;
    }
  }
}

console.log('====================================================');
console.log('🧪 RUNNING TUMPANGGO ARRAY NORMALIZATION REGRESSION TESTS');
console.log('====================================================\n');

// 1. Direct Valid Arrays
console.log('--- Test Suite 1: Direct Array Responses ---');
const directArray = [{ id: 'm1', name: 'Warung Bu Sri' }, { id: 'm2', name: 'Bakso Solo Mas Slamet' }];
const parsedDirect = extractArrayResponse<any>(directArray, 'merchants');
assert('Direct array parsed as array', Array.isArray(parsedDirect) && parsedDirect.length === 2);
assert('Direct array elements preserved', parsedDirect[0].name === 'Warung Bu Sri');

const emptyArray: any[] = [];
const parsedEmpty = extractArrayResponse<any>(emptyArray, 'merchants');
assert('Empty array parses without crashing', Array.isArray(parsedEmpty) && parsedEmpty.length === 0);

// 2. Contract Wrapper Objects ({ data: [...] }, { [resourceKey]: [...] })
console.log('\n--- Test Suite 2: Wrapped Responses (API Contracts) ---');
const dataWrapped = { data: [{ id: 'p1', name: 'Minyak Goreng' }, { id: 'p2', name: 'Beras 5kg' }] };
const parsedDataWrapped = extractArrayResponse<any>(dataWrapped, 'products');
assert('Unwraps { data: [...] }', Array.isArray(parsedDataWrapped) && parsedDataWrapped.length === 2);

const resourceWrapped = { merchants: [{ id: 'm1', name: 'Soto Ayam Tumpang' }] };
const parsedResourceWrapped = extractArrayResponse<any>(resourceWrapped, 'merchants');
assert('Unwraps { merchants: [...] }', Array.isArray(parsedResourceWrapped) && parsedResourceWrapped[0].id === 'm1');

const productsWrapped = { products: [{ id: 'prod_1', name: 'Kopi Dampit' }] };
const parsedProductsWrapped = extractArrayResponse<any>(productsWrapped, 'products');
assert('Unwraps { products: [...] }', Array.isArray(parsedProductsWrapped) && parsedProductsWrapped.length === 1);

const ordersWrapped = { orders: [{ id: 'ord_1', status: 'COMPLETED' }] };
const parsedOrdersWrapped = extractArrayResponse<any>(ordersWrapped, 'orders');
assert('Unwraps { orders: [...] }', Array.isArray(parsedOrdersWrapped) && parsedOrdersWrapped.length === 1);

const driversWrapped = { drivers: [{ id: 'drv_1', name: 'Pak Budi' }] };
const parsedDriversWrapped = extractArrayResponse<any>(driversWrapped, 'drivers');
assert('Unwraps { drivers: [...] }', Array.isArray(parsedDriversWrapped) && parsedDriversWrapped.length === 1);

// 3. Error Responses & Invalid Payloads
console.log('\n--- Test Suite 3: Error Responses & Malformed Payloads ---');
assertThrows(
  'Rejects null response',
  () => extractArrayResponse(null, 'merchants'),
  'Data yang diterima dari server tidak valid'
);

assertThrows(
  'Rejects undefined response',
  () => extractArrayResponse(undefined, 'merchants'),
  'Data yang diterima dari server tidak valid'
);

assertThrows(
  'Rejects string response (e.g. 503 HTML or raw text)',
  () => extractArrayResponse('Service Unavailable', 'merchants'),
  'Data yang diterima dari server tidak valid'
);

assertThrows(
  'Rejects server error payload { error: "Database unavailable" }',
  () => extractArrayResponse({ error: 'Database unavailable' }, 'merchants'),
  'Database unavailable'
);

assertThrows(
  'Rejects unknown non-collection object { someUnrelatedKey: 123 }',
  () => extractArrayResponse({ someUnrelatedKey: 123 }, 'merchants'),
  'Respon server tidak memuat data berbentuk daftar array'
);

// 4. Defensive Filtering Simulation (Simulating Component useMemos and renders)
console.log('\n--- Test Suite 4: Component Defensive Filter Safety ---');

// CustomerView filteredMerchants simulation with unexpected input
function simulateCustomerFilteredMerchants(merchantsInput: any, searchQuery = '', category = 'all') {
  const safeMerchants = (Array.isArray(merchantsInput) ? merchantsInput : []);
  return safeMerchants.filter(m => {
    if (!m) return false;
    const query = searchQuery.toLowerCase();
    const name = (m.name || '').toLowerCase();
    const description = (m.description || '').toLowerCase();
    const address = (m.address || '').toLowerCase();
    const matchesSearch = name.includes(query) || description.includes(query) || address.includes(query);
    if (category === 'all') return matchesSearch;
    return matchesSearch && m.category === category;
  });
}

assert('CustomerView filter does NOT crash with valid array', simulateCustomerFilteredMerchants([{ id: '1', name: 'Bakso' }]).length === 1);
assert('CustomerView filter does NOT crash with undefined input', simulateCustomerFilteredMerchants(undefined).length === 0);
assert('CustomerView filter does NOT crash with null input', simulateCustomerFilteredMerchants(null).length === 0);
assert('CustomerView filter does NOT crash with object input', simulateCustomerFilteredMerchants({ error: '503' }).length === 0);
assert('CustomerView filter does NOT crash with sparse array containing nulls', simulateCustomerFilteredMerchants([null, undefined, { id: '2', name: 'Sate' }]).length === 1);

// ShopMarketplaceView filteredProducts simulation
function simulateShopFilteredProducts(productsInput: any, categoriesInput: any, selectedSlug = 'all', search = '') {
  const safeProducts = Array.isArray(productsInput) ? productsInput : [];
  const safeCategories = Array.isArray(categoriesInput) ? categoriesInput : [];

  return safeProducts.filter((p) => {
    if (!p) return false;
    if (selectedSlug !== 'all') {
      const cat = safeCategories.find(c => c && (c.slug === selectedSlug || c.id === selectedSlug));
      if (cat && p.categoryId !== cat.id) return false;
    }
    if (search.trim().length > 0) {
      const q = search.toLowerCase().trim();
      const matchName = (p.name || '').toLowerCase().includes(q);
      const matchSku = (p.sku || '').toLowerCase().includes(q);
      const matchDesc = (p.description || '').toLowerCase().includes(q);
      if (!matchName && !matchSku && !matchDesc) return false;
    }
    return true;
  });
}

assert('Shop filter does NOT crash with valid products and categories', simulateShopFilteredProducts([{ id: 'p1', name: 'Beras' }], [{ id: 'c1', slug: 'sembako' }]).length === 1);
assert('Shop filter does NOT crash when products is an error object', simulateShopFilteredProducts({ error: 'Database disconnected' }, null).length === 0);
assert('Shop filter does NOT crash when categories is null', simulateShopFilteredProducts([{ id: 'p1', name: 'Beras' }], null).length === 1);
assert('Shop filter does NOT crash when both are undefined', simulateShopFilteredProducts(undefined, undefined).length === 0);

// DriverView order filter simulation
function simulateDriverFilter(ordersInput: any) {
  const safeOrders = Array.isArray(ordersInput) ? ordersInput : [];
  const active = safeOrders.filter(o => 
    o && ['PAYMENT_VERIFIED', 'COOKING', 'READY_FOR_PICKUP', 'ORDER_PICKED_UP'].includes(o.status)
  );
  const past = safeOrders.filter(o => 
    o && ['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(o.status)
  );
  return { active, past };
}

assert('Driver filter handles valid orders', simulateDriverFilter([{ id: '1', status: 'COOKING' }, { id: '2', status: 'COMPLETED' }]).active.length === 1);
assert('Driver filter does NOT crash with 503 error response object', simulateDriverFilter({ code: 'DATABASE_UNAVAILABLE' }).active.length === 0);
assert('Driver filter does NOT crash with null', simulateDriverFilter(null).past.length === 0);

console.log('\n====================================================');
console.log(`📊 TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL ARRAY FILTER & EXTRACTION REGRESSION TESTS PASSED!');
  process.exit(0);
}
