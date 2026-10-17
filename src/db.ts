/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Compatibility Layer for Tumpang Food Database
 * Re-exports the isolated FoodDatabase instance and models from src/server/db.ts
 */

export { foodDb as dbInstance, FoodDatabase as Database } from './server/db';
export * from './types';
