import { AppState } from '../core/State.js';
import { MatchAlgorithm } from './MatchAlgorithm.js';
import { DbManager } from '../utils/DbManager.js';

export class SpeechEngine {
  constructor() {
    this.recognition = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    
    // Enable native Web Speech API support detection (iOS 16+ standalone PWA supports it)
    this.isSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    
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
    this.correctRecordingStartIndex = null;
    this.resultStartTimes = {};
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
      this.correctRecordingStartIndex = null;
      this.resultStartTimes = {};
      
      // Capture which surah/ayah we are recording for
      this.currentRecordingSurah = AppState.current.surah.id;
      this.currentRecordingAyah = AppState.current.ayah.id;
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                       (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      
      // On mobile devices (Android & iOS), prioritize SpeechRecognition and bypass MediaRecorder to prevent mic conflict blocks
      if (isMobile && this.isSupported) {
        console.log("Mobile device detected. Prioritizing SpeechRecognition, bypassing MediaRecorder.");
        this.mediaRecorder = null;
        this.initRecognition();
        this.safeStartRecognition(3);
        return;
      }
      
      // 1. Get microphone stream (or reuse existing one) asynchronously first
      if (!this.activeStream || this.activeStream.getTracks().every(t => t.readyState === 'ended')) {
        this.activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      
      // 2. Reinitialize and start recognition only if supported
      if (this.isSupported) {
        this.initRecognition();
        this.safeStartRecognition(3);
      }
      
      // Determine best supported mime type for high-quality audio recording
      const options = {};
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          options.mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          options.mimeType = 'audio/webm;codecs=opus';
        }
      }
      options.audioBitsPerSecond = 128000; // 128 kbps high quality audio
      
      // Create new MediaRecorder using the raw microphone stream to prevent iOS Safari crashes
      const recorder = new MediaRecorder(this.activeStream, options);
      this.mediaRecorder = recorder;
      
      const recorderChunks = [];
      const recordingStartTime = Date.now();
      const currentSurah = AppState.current.surah.id;
      const currentAyah = AppState.current.ayah.id;
      
      recorder.ondataavailable = e => {
        if (e.data.size > 0) {
          recorderChunks.push({
            data: e.data,
            timestamp: Date.now()
          });
        }
      };
      
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        
        // Preserve all chunks (no dynamic trimming) to ensure critical container headers (ftyp/moov/EBML) are kept intact
        // Discarding initial chunks creates corrupted, unplayable files.
        const rawChunks = recorderChunks.map(c => c.data);
        const audioBlob = new Blob(rawChunks, { type: mimeType });
        
        // Retrieve captured metadata from the recorder instance itself to prevent race conditions during transitions
        const recordedSurah = recorder.recordedSurah || currentSurah;
        const recordedAyah = recorder.recordedAyah || currentAyah;
        const recordedText = recorder.recordedText || '';
        const recordedScore = recorder.recordedScore || 0;
        
        // Safety: abort recognition again to ensure no dangling recognition
        try { this.recognition.abort(); } catch(e) {}
        
        // Calculate accurate duration of the saved audio segments
        let duration = 0;
        if (recorderChunks.length > 1) {
          duration = (recorderChunks[recorderChunks.length - 1].timestamp - recorderChunks[0].timestamp) / 1000;
        } else {
          duration = (Date.now() - recordingStartTime) / 1000;
        }
        duration = Math.max(duration, 1.0);
        
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
                  score: recordedScore,
                  duration: duration
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
      
      this.mediaRecorder.start(250); // Fire ondataavailable every 250ms to enable precise trimming
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
    
    // Capture the detected text, score, surah, and ayah on the mediaRecorder itself to isolate it and prevent transition race conditions
    if (this.mediaRecorder) {
      this.mediaRecorder.recordedText = AppState.speech.detectedText || '';
      this.mediaRecorder.recordedScore = AppState.speech.latestScore || 0;
      this.mediaRecorder.recordedSurah = this.currentRecordingSurah;
      this.mediaRecorder.recordedAyah = this.currentRecordingAyah;
    }
    
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
    
    // 1. Track start times of each result index
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (!this.resultStartTimes[i]) {
        this.resultStartTimes[i] = Date.now();
      }
    }
    
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
    
    // 2. Identify the earliest index k from which the transcript matches the reference text >= 78%
    const referenceText = AppState.current.ayah.text || '';
    if (referenceText) {
      for (let k = 0; k < event.results.length; ++k) {
        let transcriptFromK = '';
        for (let j = k; j < event.results.length; ++j) {
          transcriptFromK += event.results[j][0].transcript + ' ';
        }
        transcriptFromK = transcriptFromK.trim();
        
        const scoreFromK = this.matchAlgo.calculateMatchScore(transcriptFromK, referenceText);
        if (scoreFromK >= 0.78) {
          this.correctRecordingStartIndex = k;
          break; // Earliest index that achieves correct match
        }
      }
    }
    
    window.dispatchEvent(new CustomEvent('speechresult', {
      detail: { text, confidence: latestConfidence }
    }));
  }

  handleError(event) {
    console.error("Speech recognition error", event.error);
    
    // Self-healing for microphone conflict (especially on iOS/Safari or duplicate mic binds)
    if ((event.error === 'not-allowed' || event.error === 'audio-capture' || event.error === 'service-not-allowed') && this.mediaRecorder) {
      console.warn("Microphone conflict detected. Disabling MediaRecorder to let SpeechRecognition work.");
      try {
        if (this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
      } catch(e) {}
      this.mediaRecorder = null;
      this.stopLiveEcho();
      
      // Close active stream tracks to release microphone lock for MediaRecorder
      if (this.activeStream) {
        this.activeStream.getTracks().forEach(track => track.stop());
        this.activeStream = null;
      }
      
      // Retry starting speech recognition after a short delay to allow mic release
      if (this.isRecording && !this.isStopping) {
        setTimeout(() => {
          this.safeStartRecognition(2);
        }, 300);
      }
      return;
    }

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
