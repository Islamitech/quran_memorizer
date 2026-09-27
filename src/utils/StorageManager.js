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
      localStorage.setItem(key, jsonData);
      return true;
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        this.emergencyCleanup();
        try {
          localStorage.setItem(key, JSON.stringify(data));
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }
  
  load(key, defaultValue = null) {
    if (!this.available) return defaultValue;
    try {
      const data = localStorage.getItem(key);
      if (!data) return defaultValue;
      return JSON.parse(data);
    } catch (error) {
      console.warn(`Failed to parse stored data for key "${key}":`, error);
      return defaultValue;
    }
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
