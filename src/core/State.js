class StateObserver {
  constructor() {
    this.listeners = new Map();
  }
  
  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key).push(callback);
  }
  
  notify(key, newValue, oldValue) {
    const callbacks = this.listeners.get(key) || [];
    callbacks.forEach(cb => cb(newValue, oldValue));
  }
}

export const observer = new StateObserver();

const initialState = {
  current: {
    surah: { id: 1, name: 'الفاتحة', ayahCount: 7 },
    ayah: { id: 1, text: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ' },
    page: 1,
    juz: 1
  },
  memorization: {
    progress: 0,
    mastered: {},
    revision: {},
    lastStudied: null
  },
  player: {
    isPlaying: false,
    repeatAyah: false,
    currentTime: 0,
    duration: 0,
    volume: 1.0,
    speed: 1.0,
    reciter: 'mishary'
  },
  speech: {
    isListening: false,
    confidence: 0,
    detectedText: '',
    isProcessing: false,
    audioBlobBase64: null
  },
  settings: {
    theme: 'light',
    fontSize: 18,
    translation: 'en',
    tafsir: 'muyassar',
    autoScroll: true,
    highlightMode: 'word',
    reciter: 'ar.alafasy'
  },
  userRole: 'student',
  reports: []
};

let saveTimeout;
function debounceSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    // We'll hook up StorageManager later to save this automatically
    const storageManager = window.storageManager;
    if (storageManager) {
      storageManager.save('quran_app_state', {
        current: AppState.current,
        memorization: AppState.memorization,
        settings: AppState.settings,
        userRole: AppState.userRole,
        reports: AppState.reports
      });
    }
  }, 500);
}

function createReactiveState(state) {
  return new Proxy(state, {
    set(target, property, value) {
      const oldValue = target[property];
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Deep reactive for nested objects
        value = createReactiveState(value);
      }
      
      target[property] = value;
      
      observer.notify(property, value, oldValue);
      debounceSave();
      
      return true;
    }
  });
}

// Make initial nested objects reactive
for (const key in initialState) {
  if (typeof initialState[key] === 'object' && initialState[key] !== null && !Array.isArray(initialState[key])) {
    initialState[key] = createReactiveState(initialState[key]);
  }
}

export const AppState = createReactiveState(initialState);
