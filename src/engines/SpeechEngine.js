import { AppState } from '../core/State.js';
import { MatchAlgorithm } from './MatchAlgorithm.js';
import { DbManager } from '../utils/DbManager.js';

export class SpeechEngine {
  constructor() {
    this.recognition = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    // Detect iOS standalone PWA mode (where Apple disabled Web Speech API)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone = window.navigator.standalone === true || 
                         window.matchMedia('(display-mode: standalone)').matches;
    
    if (isIOS && isStandalone) {
      this.isSupported = false;
    } else {
      this.isSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    }
    
    this.matchAlgo = new MatchAlgorithm();
    
    // Live echo nodes
    this.liveEchoCtx = null;
    this.liveEchoSource = null;
    this.liveEchoGain = null;
    
    // Internal state tracking
    this.isRecording = false;
    this.isStopping = false;  // Prevents handleEnd from restarting recognition during stop
    this.activeStream = null;
    this.pendingRestart = false;
    this.currentRecordingSurah = null;
    this.currentRecordingAyah = null;
    this.currentRecordingText = '';
    this.currentRecordingScore = 0;
    this.init();
  }
  
  init() {
    this.initRecognition();
  }

  initRecognition() {
    if (!this.isSupported) return;
    
    // Clean up old recognition if any
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch(e) {}
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
    }
    
    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      
      this.recognition.lang = 'ar-SA';
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
      
      this.recognition.onresult = this.handleResults.bind(this);
      this.recognition.onerror = this.handleError.bind(this);
      this.recognition.onend = this.handleEnd.bind(this);
    } catch(err) {
      console.warn("SpeechRecognition instantiation failed, falling back to audio-only:", err);
      this.isSupported = false;
      this.recognition = null;
    }
  }

  /**
   * Stop live echo audio routing
   */
  stopLiveEcho() {
    try {
      if (this.liveEchoSource) {
        this.liveEchoSource.disconnect();
        this.liveEchoSource = null;
      }
      if (this.liveEchoCtx && this.liveEchoCtx.state !== 'closed') {
        this.liveEchoCtx.close();
        this.liveEchoCtx = null;
      }
    } catch(e) {}
  }

  async start() {
    const hasMediaRecorder = 'MediaRecorder' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    if (!this.isSupported && !hasMediaRecorder) {
      alert('عذراً، متصفحك لا يدعم تسجيل الصوت أو خاصية التعرف عليه.');
      return;
    }
    if (this.isRecording) return;
    
    try {
      this.isRecording = true;
      this.isStopping = false;
      AppState.speech.isListening = true;
      
      // Clear old speech recognition state before starting
      AppState.speech.detectedText = '';
      AppState.speech.latestScore = 0;
      
      // Capture which surah/ayah we are recording for
      this.currentRecordingSurah = AppState.current.surah.id;
      this.currentRecordingAyah = AppState.current.ayah.id;
      
      // 1. Get microphone stream (or reuse existing one) asynchronously first
      if (!this.activeStream || this.activeStream.getTracks().every(t => t.readyState === 'ended')) {
        this.activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      
      // 2. Reinitialize and start recognition only if supported
      if (this.isSupported) {
        this.initRecognition();
        this.safeStartRecognition(3);
      }
      
      // Determine recording stream: apply echo effect if enabled
      let recordingStream = this.activeStream;
      
      if (AppState.speech.liveEchoEnabled) {
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          this.liveEchoCtx = new AudioCtx();
          if (this.liveEchoCtx.state === 'suspended') {
            await this.liveEchoCtx.resume();
          }
          this.liveEchoSource = this.liveEchoCtx.createMediaStreamSource(this.activeStream);
          
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
          
          // Create a destination stream to capture the processed audio
          const dest = this.liveEchoCtx.createMediaStreamDestination();
          
          this.liveEchoSource.connect(dryNode);
          dryNode.connect(dest);
          this.liveEchoSource.connect(delay1);
          this.liveEchoSource.connect(delay2);
          delay1.connect(wetNode);
          delay2.connect(wetNode);
          wetNode.connect(dest);
          
          recordingStream = dest.stream;
        } catch(echoErr) {
          console.warn("Echo setup failed, recording raw:", echoErr);
          recordingStream = this.activeStream;
        }
      }
      
      // Create new MediaRecorder for this ayah segment
      this.mediaRecorder = new MediaRecorder(recordingStream);
      this.audioChunks = [];
      
      this.mediaRecorder.ondataavailable = e => {
        if(e.data.size > 0) this.audioChunks.push(e.data);
      };
      
      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        const recordedSurah = this.currentRecordingSurah;
        const recordedAyah = this.currentRecordingAyah;
        const recordedText = this.currentRecordingText;
        const recordedScore = this.currentRecordingScore;
        
        // Safety: abort recognition again to ensure no dangling recognition
        try { this.recognition.abort(); } catch(e) {}
        
        // Only save if we actually captured audio data
        if (audioBlob.size > 0) {
          DbManager.saveAudioRecording(recordedSurah, recordedAyah, audioBlob)
            .then(() => {
              window.dispatchEvent(new CustomEvent('recordingready', { 
                detail: {
                  blob: audioBlob,
                  surahId: recordedSurah,
                  ayahId: recordedAyah,
                  detectedText: recordedText,
                  score: recordedScore
                }
              }));
            })
            .catch(err => console.error("Failed to save audio recording:", err));
        }
        
        // If pendingRestart, start a new recording segment for the next ayah
        if (this.pendingRestart) {
          this.pendingRestart = false;
          this.isRecording = false;
          this.isStopping = false;
          setTimeout(() => {
            this.start();
          }, 100);
        } else {
          // Fully stop: release mic stream and echo
          this.isRecording = false;
          this.isStopping = false;
          this.stopLiveEcho();
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
      this.isStopping = false;
      AppState.speech.isListening = false;
      alert('حدث خطأ في الوصول للميكروفون. يرجى التأكد من إعطاء الصلاحية للمتصفح. ' + (e.message || ''));
    }
  }

  safeStartRecognition(retries = 3) {
    if (!this.isRecording || this.isStopping) return;
    try {
      this.recognition.start();
    } catch(e) {
      console.warn("SpeechRecognition start failed, retrying...", e);
      if (retries > 0 && this.isRecording && !this.isStopping) {
        setTimeout(() => {
          this.safeStartRecognition(retries - 1);
        }, 250);
      }
    }
  }

  /**
   * Stop current recording.
   * @param {boolean} restartForNextAyah - If true, automatically starts a new recording after saving.
   */
  stop(restartForNextAyah = false) {
    if (!this.isRecording) return;
    
    this.isStopping = true;  // CRITICAL: Prevent handleEnd from restarting recognition
    this.pendingRestart = restartForNextAyah;
    
    // Capture the detected text and score NOW before loadAyah resets them
    this.currentRecordingText = AppState.speech.detectedText || '';
    this.currentRecordingScore = AppState.speech.latestScore || 0;
    
    // Stop speech recognition only if supported
    if (this.isSupported && this.recognition) {
      try {
        this.recognition.abort();
      } catch(e) {}
    }
    
    // Stop MediaRecorder - this triggers onstop which handles saving + restart
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    } else {
      // MediaRecorder wasn't active, handle cleanup manually
      if (restartForNextAyah) {
        this.pendingRestart = false;
        this.isRecording = false;
        this.isStopping = false;
        setTimeout(() => this.start(), 100);
      } else {
        this.isRecording = false;
        this.isStopping = false;
        this.stopLiveEcho();
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
    // Ignore results if we're in the process of stopping
    if (this.isStopping) return;
    
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
    if (event.error !== 'aborted') {
      window.dispatchEvent(new CustomEvent('speecherror', { detail: event.error }));
    }
  }

  handleEnd() {
    // Speech recognition ended (browser auto-stops on iOS sometimes).
    // Only restart if we're actively recording AND not in the process of stopping.
    if (this.isRecording && !this.isStopping && !this.pendingRestart) {
      this.safeStartRecognition(0);
    }
  }
}
