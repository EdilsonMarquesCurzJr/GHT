import { config } from './config.js';

const STORAGE_KEY = 'timetable_v1';
const IDB_DB_NAME = 'ght_fs_handles';
const IDB_STORE = 'handles';
const IDB_KEY = 'trens_file';
const IDB_KEY_DIR = 'trens_dir';

// Synchronous loader from localStorage (keeps previous API shape)
export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // backward compat: if content is array, treat as trains
    if (Array.isArray(parsed)) return { trains: parsed, restricoes: [] };
    return parsed;
  } catch (err) {
    console.warn('loadFromStorage parse failed:', err && err.message ? err.message : err);
    return null;
  }
}

// persist a FileSystemHandle into IndexedDB (if supported)
async function persistHandle(handle) {
  if (!handle || !window.indexedDB) return false;
  return new Promise((resolve) => {
    try {
      const r = indexedDB.open(IDB_DB_NAME, 1);
      r.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      r.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => {
          db.close();
          resolve(false);
        };
      };
      r.onerror = () => resolve(false);
    } catch (err) {
      resolve(false);
    }
  });
}

async function restoreHandle() {
  if (!window.indexedDB) return null;
  return new Promise((resolve) => {
    try {
      const r = indexedDB.open(IDB_DB_NAME, 1);
      r.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      r.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = () => {
          db.close();
          resolve(req.result || null);
        };
        req.onerror = () => {
          db.close();
          resolve(null);
        };
      };
      r.onerror = () => resolve(null);
    } catch (err) {
      resolve(null);
    }
  });
}

async function writeToLocalFile(payload) {
  // payload is an object; try File System Access API
  try {
    if (!window.showSaveFilePicker) throw new Error('File System Access API not available');
    const fileHandle = await window.showSaveFilePicker({ suggestedName: config.sharepointFileName || 'trens.json', types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    await persistHandle(fileHandle);
    return true;
  } catch (err) {
    return Promise.reject(err);
  }
}

// Attempt to save payload using a few strategies: localStorage (already done by caller), optional endpoint, filesystem
export function saveToStorage(payload, fileHandle = null) {
  // keep API synchronous-like: perform async work in background
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('localStorage set failed:', err && err.message ? err.message : err);
  }

  (async () => {
    try {
      // If configured remote endpoint defined, try POST
      const configured = (localStorage.getItem('saveEndpoint') || config.saveEndpoint || '').trim();
      if (configured) {
        try {
          await fetch(configured, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          return;
        } catch (err) {
          console.warn('posting to configured endpoint failed:', err && err.message ? err.message : err);
        }
      }
      // If caller provided a fileHandle (from UI selection), prefer it
      const preferredHandle = fileHandle || (await restoreHandle());
      if (preferredHandle && preferredHandle.createWritable) {
        try {
          const writable = await preferredHandle.createWritable();
          await writable.write(JSON.stringify(payload, null, 2));
          await writable.close();
          return;
        } catch (err) {
          console.warn('writing to preferred/restored handle failed:', err && err.message ? err.message : err);
        }
      }

      // Don't automatically open a save dialog on every change (user asked to avoid downloads).
      // Only fall back to download if explicitly enabled in config/localStorage.
      if (config.autoDownloadJSON || localStorage.getItem('autoDownloadJSON') === 'true') {
        try {
          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'trens.json';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          return;
        } catch (err) {
          console.warn('auto-download fallback failed:', err && err.message ? err.message : err);
        }
      }
    } catch (err) {
      console.warn('saveToStorage internal error:', err && err.message ? err.message : err);
    }
  })();
}

export async function selectLocalFileAndPersist() {
  if (!window.showOpenFilePicker) throw new Error('File System Access API not available');
  const [handle] = await window.showOpenFilePicker({ multiple: false, types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
  if (!handle) throw new Error('no handle selected');
  await persistHandle(handle);
  return handle;
}

// persist a directory handle into IndexedDB (if supported)
async function persistDirHandle(handle) {
  if (!handle || !window.indexedDB) return false;
  return new Promise((resolve) => {
    try {
      const r = indexedDB.open(IDB_DB_NAME, 1);
      r.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      r.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(handle, IDB_KEY_DIR);
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => {
          db.close();
          resolve(false);
        };
      };
      r.onerror = () => resolve(false);
    } catch (err) {
      resolve(false);
    }
  });
}

async function restoreDirHandle() {
  if (!window.indexedDB) return null;
  return new Promise((resolve) => {
    try {
      const r = indexedDB.open(IDB_DB_NAME, 1);
      r.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      r.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(IDB_KEY_DIR);
        req.onsuccess = () => {
          db.close();
          resolve(req.result || null);
        };
        req.onerror = () => {
          db.close();
          resolve(null);
        };
      };
      r.onerror = () => resolve(null);
    } catch (err) {
      resolve(null);
    }
  });
}

// Write collections as JS module files inside a directory handle. Creates subfolders as needed.
export async function saveCollectionsToDir(dirHandle, collections = {}) {
  if (!dirHandle || !dirHandle.getFileHandle) throw new Error('Directory handle not available');
  try {
    // ensure js/data path exists
    let jsHandle;
    try {
      jsHandle = await dirHandle.getDirectoryHandle('js', { create: true });
    } catch (e) {
      // some implementations may not support getDirectoryHandle on file handles; try root
      jsHandle = dirHandle;
    }
    let dataHandle;
    try {
      dataHandle = await jsHandle.getDirectoryHandle('data', { create: true });
    } catch (e) {
      dataHandle = jsHandle;
    }

    // write trains.js
    if (collections.trains) {
      const trainsContent = `export const trains = ${JSON.stringify(collections.trains, null, 2)};\n`;
      const tf = await dataHandle.getFileHandle('trains.js', { create: true });
      const tw = await tf.createWritable();
      await tw.write(trainsContent);
      await tw.close();
    }

    // write restricoes.js
    if (collections.restricoes) {
      const restrContent = `export const restricoes = ${JSON.stringify(collections.restricoes, null, 2)};\n`;
      const rf = await dataHandle.getFileHandle('restricoes.js', { create: true });
      const rw = await rf.createWritable();
      await rw.write(restrContent);
      await rw.close();
    }

    // persist the directory handle so it can be reused
    try {
      await persistDirHandle(dirHandle);
    } catch (e) {}
    return true;
  } catch (err) {
    console.warn('saveCollectionsToDir failed:', err && err.message ? err.message : err);
    return false;
  }
}

export { persistHandle as _persistHandle, restoreHandle as _restoreHandle, persistDirHandle as _persistDirHandle, restoreDirHandle as _restoreDirHandle };
