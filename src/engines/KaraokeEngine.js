export class KaraokeEngine {
  constructor() {
    this.audioElement = null;
    this.currentWordIndex = 0;
    this.wordElements = [];
    this.timestamps = [];
    this.timingMode = 'dynamic';
  }
  
  init(audioElement, wordElementsContainer) {
    this.audioElement = audioElement;
    this.wordElements = Array.from(wordElementsContainer.children);
    
    this.audioElement.removeEventListener('timeupdate', this._syncWordsBound);
    this._syncWordsBound = this.syncWords.bind(this);
    this.audioElement.addEventListener('timeupdate', this._syncWordsBound);
  }

  setWords(text, container) {
    if(container) {
        this.wordElements = Array.from(container.children);
        this.reset();
    }
    // Generate dynamic timestamps
    const duration = this.audioElement ? this.audioElement.duration || 5 : 5; // fallback
    this.calculateTimestamps(text, duration);
  }
  
  syncWords() {
    if (!this.audioElement || !this.wordElements.length) return;
    
    const currentTime = this.audioElement.currentTime;
    const duration = this.audioElement.duration;
    
    if (!duration || duration === 0) return;
    
    const progress = currentTime / duration;
    
    if (this.timingMode === 'dynamic') {
      this.syncDynamic(progress);
    } else {
      this.syncStatic(progress);
    }
  }
  
  syncDynamic(progress) {
    const totalWords = this.wordElements.length;
    let expectedIndex = Math.floor(progress * totalWords);
    if(expectedIndex >= totalWords) expectedIndex = totalWords - 1;
    this.updateHighlight(expectedIndex);
  }
  
  syncStatic(progress) {
    let foundIndex = 0;
    for (let i = 0; i < this.timestamps.length; i++) {
      if (progress <= this.timestamps[i]) {
        foundIndex = i;
        break;
      }
    }
    this.updateHighlight(foundIndex);
  }
  
  updateHighlight(index) {
    if (index === this.currentWordIndex) return;
    
    if (this.currentWordIndex >= 0 && this.currentWordIndex < this.wordElements.length) {
      const prevElement = this.wordElements[this.currentWordIndex];
      if (prevElement) {
        prevElement.classList.remove('karaoke-active');
        prevElement.classList.add('karaoke-fade');
      }
    }
    
    if (index >= 0 && index < this.wordElements.length) {
      const currentElement = this.wordElements[index];
      if (currentElement) {
        currentElement.classList.remove('karaoke-fade');
        currentElement.classList.add('karaoke-active');
        this.scrollToWord(currentElement);
      }
    }
    
    // Mark previous as done
    for(let i=0; i<index; i++) {
        if(this.wordElements[i]) {
            this.wordElements[i].classList.remove('karaoke-active', 'karaoke-fade');
            this.wordElements[i].classList.add('karaoke-done');
        }
    }

    this.currentWordIndex = index;
  }
  
  calculateTimestamps(text, duration) {
    const words = text.split(' ');
    const wordCount = words.length;
    
    const wordLengths = words.map(word => word.replace(/[\u064B-\u0652]/g, '').length);
    const totalLength = wordLengths.reduce((a, b) => a + b, 0);
    
    let timestamp = 0;
    this.timestamps = [];
    
    for (let i = 0; i < wordCount; i++) {
      const proportion = wordLengths[i] / totalLength;
      timestamp += proportion * duration;
      this.timestamps.push(timestamp);
    }
    
    const scaleFactor = 0.9;
    this.timestamps = this.timestamps.map(t => t * scaleFactor);
  }
  
  scrollToWord(wordElement) {
    if (!wordElement) return;
    const container = wordElement.closest('.quran-display');
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    const wordRect = wordElement.getBoundingClientRect();
    
    const offsetTop = wordRect.top - containerRect.top - (containerRect.height / 2) + (wordRect.height / 2);
    
    container.scrollTo({
      top: container.scrollTop + offsetTop,
      behavior: 'smooth'
    });
  }

  reset() {
      this.currentWordIndex = -1;
      this.wordElements.forEach(el => el.classList.remove('karaoke-active', 'karaoke-fade', 'karaoke-done'));
  }
}
