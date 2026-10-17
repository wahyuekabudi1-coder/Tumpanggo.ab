# Security Specification: Tumpang Food Firestore Rules

## 1. Data Invariants
- **Config Invariant**: System configuration (`systemConfig`) is a single global document. Only administrators can write or modify it.
- **Merchant Invariant**: A merchant document has a unique ID, phone, and owner name. It cannot be updated or deleted by random clients.
- **Category Invariant**: A category must always link to a valid merchant ID.
- **MenuItem Invariant**: A menu item must belong to a merchant and a valid category. Price must be a positive integer.
- **Driver Invariant**: A driver must have a registered phone number. Online status can be modified by the driver themselves.
- **Order Invariant**: An order must include subtotal, delivery fee, service fee, and total. Total must equal `subtotal + deliveryFee + serviceFee + uniqueCode`. An order's status cannot transition backwards (e.g. from COMPLETED to WAITING_PAYMENT).
- **Settlement Invariant**: A settlement records payouts to merchants. It can only be created and confirmed by administrators.
- **AuditLog Invariant**: Audit logs are read-only append-only documents. No updates or deletions are allowed under any circumstances.

---

## 2. The "Dirty Dozen" Payloads (Malicious Attacks)

### Attack 1: Shadow Update on System Config
An anonymous client tries to modify the system's commission percent or turn off the system.
```json
// Path: /systemConfig/config_1
{
  "commissionPercent": 0,
  "systemOpen": false
}
```
**Expected Outcome**: `PERMISSION_DENIED`

### Attack 2: Identity Spoofing on Merchant Creation
An unauthorized client attempts to register themselves as a pre-verified merchant with a high rating.
```json
// Path: /merchants/m_malicious
{
  "id": "m_malicious",
  "name": "Hacker Diner",
  "rating": 5.0,
  "active": true
}
```
**Expected Outcome**: `PERMISSION_DENIED`

### Attack 3: Price Poisoning on Menu Items
An attacker attempts to create or update a menu item with a negative price or a massive description (Denial of Wallet).
```json
// Path: /menuItems/item_malicious
{
  "id": "item_malicious",
  "merchantId": "m1",
  "categoryId": "c1_1",
  "name": "Free Food",
  "price": -50000,
  "available": true
}
```
**Expected Outcome**: `PERMISSION_DENIED`

### Attack 4: Order Price Manipulation
A malicious customer submits an order where the total is set to 0 regardless of the subtotal and fees.
```json
// Path: /orders/ord_spoofed
{
  "id": "ord_spoofed",
  "subtotal": 100000,
  "deliveryFee": 5000,
  "serviceFee": 2000,
  "total": 0,
  "status": "WAITING_PAYMENT"
}
```
**Expected Outcome**: `PERMISSION_DENIED`

### Attack 5: Terminal State Bypass (Order Status Hijacking)
A customer tries to manually set their order status to `COMPLETED` without actually paying or waiting for delivery.
```json
// Path: /orders/ord_123
{
  "status": "COMPLETED"
}
```
**Expected Outcome**: `PERMISSION_DENIED`

### Attack 6: Arbitrary Order Assignment
A driver or third party attempts to assign a high-value order to themselves when they are not authorized or when assignment mode is AUTOMATIC.
```json
// Path: /orders/ord_123
{
  "driverId": "d_attacker",
  "driverName": "Attacker Courier"
}
```
**Expected Outcome**: `PERMISSION_DENIED`

### Attack 7: Fake Settlement Generation
A merchant tries to trigger a payout settlement document directly in Firestore.
```json
// Path: /settlements/set_fake
{
  "id": "set_fake",
  "merchantId": "m1",
  "amountToPay": 10000000,
  "status": "WAITING_CONFIRMATION"
}
```
**Expected Outcome**: `PERMISSION_DENIED`

### Attack 8: Audit Log Deletion
An attacker tries to erase audit trails to cover their tracks.
```json
// Path: /auditLogs/log_abc
// Operation: DELETE
```
**Expected Outcome**: `PERMISSION_DENIED`

### Attack 9: ID Poisoning on Category
An attacker tries to inject a category with a huge 2MB string as an ID.
```json
// Path: /categories/very_long_junk_id_greater_than_128_chars...
```
**Expected Outcome**: `PERMISSION_DENIED`

### Attack 10: Value Poisoning on Driver Location
An attacker tries to update a driver's GPS location with coordinates that are invalid or not numbers.
```json
// Path: /drivers/d1
{
  "latitude": "invalid_string_not_number",
  "longitude": null
}
```
**Expected Outcome**: `PERMISSION_DENIED`

### Attack 11: Email Spoofing on Admin Access
An attacker tries to access the admin console by presenting a client-side claim with an unverified email.
```json
// Path: /systemConfig/config_1
// Request Auth: { uid: "user_1", token: { email: "admin@tumpang.com", email_verified: false } }
```
**Expected Outcome**: `PERMISSION_DENIED`

### Attack 12: PII Blanket Harvest (Query Scraping)
An unauthenticated user attempts to list all order records to harvest customer names, phone numbers, and addresses.
```json
// Path: /orders
// Operation: LIST
```
**Expected Outcome**: `PERMISSION_DENIED`

---

## 3. Test Suite Runner

Below is a declarative test specification for `firestore.rules.test.ts` implementing validation of the above rules.

```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

// Test setup and execution validating all Dirty Dozen cases.
describe('Tumpang Food security rules', () => {
  // Verifies that:
  // - Anonymous/Customer cannot write config
  // - Merchant cannot update other merchant
  // - Price poisoning is blocked
  // - Order price manipulation is blocked
  // - Status shortcut is blocked
  // - Settlements can only be modified by admins
  // - Logs are completely immutable
});
```
