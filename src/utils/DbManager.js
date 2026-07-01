const dbName = "QuranMemorizerDB";
const storeName = "recordings";
const offlineStoreName = "offline_audio";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 2);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
      if (!db.objectStoreNames.contains(offlineStoreName)) {
        db.createObjectStore(offlineStoreName);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

export const DbManager = {
  saveAudioRecording(surah, ayah, blob) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const key = `rec_S${surah}_A${ayah}`;
        const request = store.put(blob, key);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  getAudioRecording(surah, ayah) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const key = `rec_S${surah}_A${ayah}`;
        const request = store.get(key);
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
      });
    }).catch(() => null);
  },

  deleteAudioRecording(surah, ayah) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const key = `rec_S${surah}_A${ayah}`;
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  saveOfflineAudio(reciter, surah, ayah, blob) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(offlineStoreName, "readwrite");
        const store = transaction.objectStore(offlineStoreName);
        const key = `offline_${reciter}_S${surah}_A${ayah}`;
        const request = store.put(blob, key);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  getOfflineAudio(reciter, surah, ayah) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(offlineStoreName, "readonly");
        const store = transaction.objectStore(offlineStoreName);
        const key = `offline_${reciter}_S${surah}_A${ayah}`;
        const request = store.get(key);
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
      });
    }).catch(() => null);
  },

  getCachedKeys() {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(offlineStoreName, "readonly");
        const store = transaction.objectStore(offlineStoreName);
        const request = store.getAllKeys();
        request.onsuccess = (e) => resolve(e.target.result || []);
        request.onerror = (e) => reject(e.target.error);
      });
    }).catch(() => []);
  }
};
