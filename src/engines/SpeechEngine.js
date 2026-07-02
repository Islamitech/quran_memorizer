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
    
    // Internal state tracking
    this.isRecording = false;       // TRUE while mic is active (independent of speech recognition)
    this.activeStream = null;       // The live microphone stream - reused across ayah transitions
    this.pendingRestart = false;    // Flag: should we restart recording for the next ayah?
    this.currentRecordingSurah = null;
    this.currentRecordingAyah = null;
    
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
    // Prevent double-start
    if (this.isRecording) return;
    
    try {
      this.isRecording = true;
      AppState.speech.isListening = true;
      
      // Capture which surah/ayah we are recording for
      this.currentRecordingSurah = AppState.current.surah.id;
      this.currentRecordingAyah = AppState.current.ayah.id;
      
      // Get microphone stream (or reuse existing one)
      if (!this.activeStream || this.activeStream.getTracks().every(t => t.readyState === 'ended')) {
        this.activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      
      // Start speech recognition (may fail if already running - that's ok)
      try {
        this.recognition.start();
      } catch(recError) {
        console.warn("Recognition start issue:", recError);
      }
      
      // Create new MediaRecorder for this ayah segment
      this.mediaRecorder = new MediaRecorder(this.activeStream);
      this.audioChunks = [];
      
      this.mediaRecorder.ondataavailable = e => {
        if(e.data.size > 0) this.audioChunks.push(e.data);
      };
      
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const recordedSurah = this.currentRecordingSurah;
        const recordedAyah = this.currentRecordingAyah;
        
        // Only save if we actually captured audio data
        if (audioBlob.size > 0) {
          DbManager.saveAudioRecording(recordedSurah, recordedAyah, audioBlob)
            .then(() => {
              window.dispatchEvent(new CustomEvent('recordingready', { 
                detail: {
                  blob: audioBlob,
                  surahId: recordedSurah,
                  ayahId: recordedAyah
                }
              }));
            })
            .catch(err => console.error("Failed to save audio recording:", err));

          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            AppState.speech.audioBlobBase64 = reader.result;
          };
        }
        
        // If pendingRestart is set, start a new recording segment for the next ayah
        if (this.pendingRestart) {
          this.pendingRestart = false;
          this.isRecording = false; // Allow start() to run
          // Use setTimeout to let the browser finish cleanup
          setTimeout(() => {
            this.start();
          }, 100);
        } else {
          // Fully stop: release mic stream
          this.isRecording = false;
          if (this.activeStream) {
            this.activeStream.getTracks().forEach(track => track.stop());
            this.activeStream = null;
          }
          AppState.speech.isListening = false;
          window.dispatchEvent(new Event('speechend'));
        }
      };
      
      this.mediaRecorder.start();
    } catch(e) {
      console.error(e);
      this.isRecording = false;
      AppState.speech.isListening = false;
      alert('حدث خطأ في الوصول للميكروفون. يرجى التأكد من إعطاء الصلاحية للمتصفح. ' + (e.message || ''));
    }
  }

  /**
   * Stop current recording.
   * @param {boolean} restartForNextAyah - If true, automatically starts a new recording after saving.
   */
  stop(restartForNextAyah = false) {
    if (!this.isSupported) return;
    if (!this.isRecording) return;
    
    this.pendingRestart = restartForNextAyah;
    
    // Stop speech recognition (may fire handleEnd - we ignore it)
    try {
      this.recognition.stop();
    } catch(e) {}
    
    // Stop MediaRecorder - this triggers onstop which handles saving + restart
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    } else {
      // MediaRecorder wasn't active, handle cleanup manually
      if (restartForNextAyah) {
        this.pendingRestart = false;
        this.isRecording = false;
        setTimeout(() => this.start(), 100);
      } else {
        this.isRecording = false;
        if (this.activeStream) {
          this.activeStream.getTracks().forEach(track => track.stop());
          this.activeStream = null;
        }
        AppState.speech.isListening = false;
        window.dispatchEvent(new Event('speechend'));
      }
    }
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
    // Don't dispatch error for 'aborted' - that's normal during stop
    if (event.error !== 'aborted') {
      window.dispatchEvent(new CustomEvent('speecherror', { detail: event.error }));
    }
  }

  handleEnd() {
    // Speech recognition ended (browser auto-stops on iOS sometimes).
    // If we're still actively recording, restart recognition silently.
    if (this.isRecording) {
      try {
        this.recognition.start();
      } catch(e) {
        // Ignore - recognition may have been stopped intentionally
      }
    }
  }
}
