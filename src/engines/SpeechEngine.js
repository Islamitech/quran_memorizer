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
    
    // Live echo nodes
    this.liveEchoCtx = null;
    this.liveEchoSource = null;
    this.liveEchoGain = null;
    
    // Internal state tracking
    this.isRecording = false;
    this.activeStream = null;
    this.pendingRestart = false;
    this.currentRecordingSurah = null;
    this.currentRecordingAyah = null;
    this.currentRecordingText = '';  // Captured detected text at stop time
    this.currentRecordingScore = 0;  // Captured score at stop time
    
    this.init();
  }
  
  init() {
    this.initRecognition();
  }

  initRecognition() {
    if (!this.isSupported) return;
    
    // Clean up old recognition if any to prevent memory/buffer leaks and late events
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch(e) {}
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
    }
    
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

  /**
   * Start or resume live echo (mic → speakers with mosque reverb effect)
   */
  startLiveEcho(stream) {
    try {
      this.stopLiveEcho(); // Clean up any previous echo
      
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.liveEchoCtx = new AudioCtx();
      this.liveEchoSource = this.liveEchoCtx.createMediaStreamSource(stream);
      
      // Reverb chain: source → delay nodes → gain → destination
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
      
      // Feedback loops
      delay1.connect(feedback1);
      feedback1.connect(delay1);
      delay2.connect(feedback2);
      feedback2.connect(delay2);
      
      // Signal routing
      this.liveEchoSource.connect(dryNode);
      dryNode.connect(this.liveEchoCtx.destination);
      this.liveEchoSource.connect(delay1);
      this.liveEchoSource.connect(delay2);
      delay1.connect(wetNode);
      delay2.connect(wetNode);
      wetNode.connect(this.liveEchoCtx.destination);
    } catch(e) {
      console.warn("Live echo setup failed:", e);
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
    if (!this.isSupported) {
      alert('عذراً، متصفحك لا يدعم خاصية التعرف على الصوت. يرجى استخدام Google Chrome.');
      return;
    }
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
      
      // Re-create the recognition instance to prevent buffer leaks or late result events from previous ayah
      this.initRecognition();
      
      setTimeout(() => {
        try {
          if (this.isRecording) {
            this.recognition.start();
          }
        } catch(recError) {
          console.warn("Recognition start issue:", recError);
        }
      }, 50);
      
      // Determine recording stream: apply echo effect if enabled
      let recordingStream = this.activeStream;
      
      if (AppState.speech.liveEchoEnabled) {
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          this.liveEchoCtx = new AudioCtx();
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
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const recordedSurah = this.currentRecordingSurah;
        const recordedAyah = this.currentRecordingAyah;
        const recordedText = this.currentRecordingText;
        const recordedScore = this.currentRecordingScore;
        
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

          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            AppState.speech.audioBlobBase64 = reader.result;
          };
        }
        
        // If pendingRestart, start a new recording segment for the next ayah
        if (this.pendingRestart) {
          this.pendingRestart = false;
          this.isRecording = false;
          setTimeout(() => {
            this.start();
          }, 100);
        } else {
          // Fully stop: release mic stream and echo
          this.isRecording = false;
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
    
    // Capture the detected text and score NOW before loadAyah resets them
    this.currentRecordingText = AppState.speech.detectedText || '';
    this.currentRecordingScore = AppState.speech.latestScore || 0;
    
    // Stop speech recognition
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
    // If we're still actively recording and not in transition, restart recognition silently.
    if (this.isRecording && !this.pendingRestart) {
      try {
        this.recognition.start();
      } catch(e) {}
    }
  }
}
