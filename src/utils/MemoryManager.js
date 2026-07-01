export class MemoryManager {
  constructor() {
    this.observedElements = new WeakMap();
    this.cacheLimit = 50;
    this.cache = new Map();
    this.cleanupInterval = 30000; // 30 seconds
    
    this.setupObserver();
    this.startCleanupCycle();
  }
  
  setupObserver() {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.removedNodes) {
            if (node.nodeType === 1) {
              this.cleanupNode(node);
            }
          }
        }
      }
    });
    
    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  cleanupNode(node) {
    if (node._listeners) {
      node._listeners.forEach(([event, handler]) => {
        node.removeEventListener(event, handler);
      });
    }
    
    if (this.observedElements.has(node)) {
      const observer = this.observedElements.get(node);
      if (Array.isArray(observer) && observer[0]) {
        observer[0].disconnect();
      }
      this.observedElements.delete(node);
    }
    
    for (const [key, value] of this.cache) {
      if (value === node) {
        this.cache.delete(key);
        break;
      }
    }
  }
  
  startCleanupCycle() {
    setInterval(() => {
      this.performCleanup();
    }, this.cleanupInterval);
  }
  
  performCleanup() {
    if (this.cache.size > this.cacheLimit) {
      const entries = Array.from(this.cache.entries());
      const toRemove = entries.slice(0, this.cache.size - this.cacheLimit);
      for (const [key] of toRemove) {
        this.cache.delete(key);
      }
    }
    
    if (window.gc) {
      window.gc();
    }
  }
  
  cacheItem(key, value) {
    this.cache.set(key, value);
    if (this.cache.size > this.cacheLimit) {
      this.performCleanup();
    }
  }
  
  getCachedItem(key) {
    return this.cache.get(key);
  }
}
