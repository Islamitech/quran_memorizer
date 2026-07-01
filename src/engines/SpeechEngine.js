import { AppState } from '../core/State.js';
import { MatchAlgorithm } from './MatchAlgorithm.js';
import { DbManager } from '../utils/DbManager.js';

export class SpeechEngine {
  constructor() {
    this.recognition = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    this.matchAlgo = new MatchAlgorithm();
    this.init();
  }
  
  init() {
    if (!this.isSupported) return;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    
    this.recognition.lang = 'ar-SA';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
    
    this.recognition.onresult = this.handleResults.bind(this);
    this.recognition.onerror = this.handleError.bind(this);
    this.recognition.onend = this.handleEnd.bind(this);
  }

  async start() {
    if (!this.isSupported) {
      alert('عذراً، متصفحك لا يدعم خاصية التعرف على الصوت. يرجى استخدام Google Chrome.');
      return;
    }
    if (AppState.speech.isListening) return;
    
    try {
      AppState.speech.isListening = true; // Set UI to listening immediately
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      try {
        this.recognition.start();
      } catch(recError) {
        console.warn("Recognition already started or failed:", recError);
      }
      
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      
      this.mediaRecorder.ondataavailable = e => {
        if(e.data.size > 0) this.audioChunks.push(e.data);
      };
      
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        DbManager.saveAudioRecording(AppState.current.surah.id, AppState.current.ayah.id, audioBlob)
          .then(() => {
            window.dispatchEvent(new CustomEvent('recordingready', { detail: audioBlob }));
          })
          .catch(err => console.error("Failed to save audio recording:", err));

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          AppState.speech.audioBlobBase64 = reader.result;
        };
        // Stop stream tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      this.mediaRecorder.start();
    } catch(e) {
      console.error(e);
      AppState.speech.isListening = false;
      alert('حدث خطأ في الوصول للميكروفون. يرجى التأكد من إعطاء الصلاحية للمتصفح. ' + (e.message || ''));
    }
  }

  stop() {
    if(!this.isSupported) return;
    try {
      this.recognition.stop();
      if(this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    } catch(e) {}
    AppState.speech.isListening = false;
  }
  
  handleResults(event) {
    let finalTranscript = '';
    let interimTranscript = '';
    let latestConfidence = 0;
    
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript + ' ';
        latestConfidence = event.results[i][0].confidence;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    
    const text = (finalTranscript + interimTranscript).trim();
    if (!text) return;
    
    AppState.speech.detectedText = text;
    AppState.speech.confidence = latestConfidence;
    
    window.dispatchEvent(new CustomEvent('speechresult', {
      detail: { text, confidence: latestConfidence }
    }));
  }

  handleError(event) {
    console.error("Speech recognition error", event.error);
    window.dispatchEvent(new CustomEvent('speecherror', { detail: event.error }));
  }

  handleEnd() {
    AppState.speech.isListening = false;
    window.dispatchEvent(new Event('speechend'));
  }
}
