import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Node's own experimental global `localStorage` shadows jsdom's in this
// environment and errors without --localstorage-file, so the colour-mode
// provider (which keeps the choice there) gets an in-memory Storage instead.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

const memoryLocalStorage = new MemoryStorage();
vi.stubGlobal('localStorage', memoryLocalStorage);
Object.defineProperty(window, 'localStorage', { value: memoryLocalStorage, configurable: true });
