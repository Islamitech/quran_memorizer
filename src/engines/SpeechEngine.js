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
    this.liveEchoCtx = null;
    this.liveEchoSource = null;
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

      // Live mosque echo support during recitation
      if (AppState.speech.liveEchoEnabled) {
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          this.liveEchoCtx = new AudioContextClass();
          this.liveEchoSource = this.liveEchoCtx.createMediaStreamSource(stream);
          
          // Mosque delay reverb simulation
          const dryNode = this.liveEchoCtx.createGain();
          const wetNode = this.liveEchoCtx.createGain();
          
          const delay1 = this.liveEchoCtx.createDelay(1.0);
          const delay2 = this.liveEchoCtx.createDelay(1.0);
          const feedback1 = this.liveEchoCtx.createGain();
          const feedback2 = this.liveEchoCtx.createGain();
          
          delay1.delayTime.value = 0.18;
          delay2.delayTime.value = 0.28;
          
          feedback1.gain.value = 0.18; 
          feedback2.gain.value = 0.15;
          
          dryNode.gain.value = 1.0;
          wetNode.gain.value = 0.18; 
          
          delay1.connect(feedback1);
          feedback1.connect(delay1);
          
          delay2.connect(feedback2);
          feedback2.connect(delay2);
          
          this.liveEchoSource.connect(dryNode);
          dryNode.connect(this.liveEchoCtx.destination);
          
          this.liveEchoSource.connect(delay1);
          this.liveEchoSource.connect(delay2);
          
          delay1.connect(wetNode);
          delay2.connect(wetNode);
          wetNode.connect(this.liveEchoCtx.destination);
        } catch(audioErr) {
          console.error("Live echo audio graph failed to build:", audioErr);
        }
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
    
    // Stop live echo Context
    if (this.liveEchoCtx) {
      try {
        this.liveEchoCtx.close();
      } catch(ctxErr) {}
      this.liveEchoCtx = null;
      this.liveEchoSource = null;
    }
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
