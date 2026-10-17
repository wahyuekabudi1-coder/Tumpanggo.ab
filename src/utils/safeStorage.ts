/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Safe Storage Utility for Iframe & Restricted Environments
 * Prevents DOMException / SecurityError crashes when accessing localStorage in sandboxed iframes.
 */

class MemoryStorage {
  private data: Record<string, string> = {};

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null;
  }

  setItem(key: string, value: string): void {
    this.data[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.data[key];
  }

  clear(): void {
    this.data = {};
  }
}

const memoryStore = new MemoryStorage();

function isLocalStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

const hasLocalStorage = isLocalStorageAvailable();

export const safeStorage = {
  getItem(key: string): string | null {
    if (hasLocalStorage) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        // Fallback to memory
      }
    }
    return memoryStore.getItem(key);
  },

  setItem(key: string, value: string): void {
    if (hasLocalStorage) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch {
        // Fallback to memory
      }
    }
    memoryStore.setItem(key, value);
  },

  removeItem(key: string): void {
    if (hasLocalStorage) {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch {
        // Fallback to memory
      }
    }
    memoryStore.removeItem(key);
  },

  getJSON<T>(key: string, fallback: T): T {
    try {
      const item = safeStorage.getItem(key);
      if (!item) return fallback;
      return JSON.parse(item) as T;
    } catch {
      return fallback;
    }
  },

  setJSON(key: string, value: any): void {
    try {
      safeStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignored
    }
  }
};
