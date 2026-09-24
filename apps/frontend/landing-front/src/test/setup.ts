import '@testing-library/jest-dom';

// Node's own experimental global `localStorage` shadows jsdom's in this
// environment and errors without --localstorage-file, so the docs' remembered
// code language gets an in-memory Storage instead (as in frontend-core).
// Defined rather than vi.stubGlobal'd, so a test's vi.unstubAllGlobals() cannot remove it.
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
Object.defineProperty(globalThis, 'localStorage', { value: memoryLocalStorage, configurable: true });
Object.defineProperty(window, 'localStorage', { value: memoryLocalStorage, configurable: true });
