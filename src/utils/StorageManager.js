export class StorageManager {
  constructor() {
    this.available = this.checkAvailability();
    this.quota = null;
    this.usage = null;
    
    if (this.available) {
      this.initializeStorage();
    }
  }
  
  async initializeStorage() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        await navigator.storage.persist();
      }
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        this.quota = estimate.quota;
        this.usage = estimate.usage;
      }
    } catch (error) {
      console.warn('Storage estimation failed:', error);
    }
  }
  
  checkAvailability() {
    try {
      localStorage.setItem('test', 'test');
      localStorage.removeItem('test');
      return true;
    } catch {
      return false;
    }
  }
  
  save(key, data) {
    if (!this.available) return false;
    try {
      const jsonData = JSON.stringify(data);
      let compressedData = jsonData;
      if (jsonData.length > 10000) {
        compressedData = this.compress(jsonData);
      }
      localStorage.setItem(key, compressedData);
      return true;
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        this.emergencyCleanup();
        return false;
      }
      return false;
    }
  }
  
  load(key, defaultValue = null) {
    if (!this.available) return defaultValue;
    try {
      const data = localStorage.getItem(key);
      if (!data) return defaultValue;
      
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        const decompressed = this.decompress(data);
        parsed = JSON.parse(decompressed);
      }
      return parsed;
    } catch (error) {
      return defaultValue;
    }
  }
  
  compress(text) {
    let compressed = '';
    let count = 1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === text[i + 1]) {
        count++;
      } else {
        compressed += text[i] + (count > 1 ? count : '');
        count = 1;
      }
    }
    return compressed;
  }
  
  decompress(text) {
    let decompressed = '';
    let i = 0;
    while (i < text.length) {
      const char = text[i];
      let count = '';
      i++;
      while (i < text.length && /[0-9]/.test(text[i])) {
        count += text[i];
        i++;
      }
      decompressed += char.repeat(count ? parseInt(count) : 1);
    }
    return decompressed;
  }
  
  emergencyCleanup() {
    const keysToDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('cache_') || key.startsWith('temp_')) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(k => localStorage.removeItem(k));
  }
}
