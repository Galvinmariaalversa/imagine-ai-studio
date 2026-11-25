/**
 * ImagineAI — IndexedDB Persistent Creation History Store
 * Stores generated image blobs and metadata locally so history survives page refreshes.
 */
const DB_NAME = 'imagineai_studio_db';
const DB_VERSION = 2;
const STORE_NAME = 'creations';
const MAX_HISTORY_ITEMS = 40;

function openDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const HistoryStore = {
  async save(entry) {
    try {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(entry);

      // Prune oldest items beyond MAX_HISTORY_ITEMS
      const allReq = store.index('createdAt').getAll();
      allReq.onsuccess = () => {
        const items = allReq.result || [];
        if (items.length > MAX_HISTORY_ITEMS) {
          items.sort((a, b) => b.createdAt - a.createdAt);
          items.slice(MAX_HISTORY_ITEMS).forEach((old) => store.delete(old.id));
        }
      };

      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('HistoryStore save failed:', e);
    }
  },

  async getAll() {
    try {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      const items = await new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      return items.sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      console.warn('HistoryStore getAll failed:', e);
      return [];
    }
  },

  async remove(id) {
    try {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('HistoryStore remove failed:', e);
    }
  },

  async setFavorite(id, isFavorite) {
    try {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (record) {
          record.isFavorite = Boolean(isFavorite);
          store.put(record);
        }
      };
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('HistoryStore setFavorite failed:', e);
    }
  },

  async clear() {
    try {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('HistoryStore clear failed:', e);
    }
  }
};
