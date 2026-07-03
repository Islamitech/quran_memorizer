import { AppState, observer } from './core/State.js';
import { StorageManager } from './utils/StorageManager.js';
import { MemoryManager } from './utils/MemoryManager.js';
import { QuranAPIManager } from './api/QuranAPI.js';
import { KaraokeEngine } from './engines/KaraokeEngine.js';
import { SpeechEngine } from './engines/SpeechEngine.js';
import { InteractiveTour } from './components/InteractiveTour.js';
import { DbManager } from './utils/DbManager.js';

// Init core utils
window.storageManager = new StorageManager();
window.dbManager = DbManager;
const memoryManager = new MemoryManager();
const quranAPI = new QuranAPIManager();

// Init engines
const karaokeEngine = new KaraokeEngine();
const speechEngine = new SpeechEngine();
const tour = new InteractiveTour();

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      console.log('SW registered!', reg);
      // Force check update on load
      reg.update();
      
      reg.onupdatefound = () => {
        const installingWorker = reg.installing;
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              console.log('New updates detected; reloading page to apply changes.');
              window.location.reload();
            }
          }
        };
      };
    }).catch(err => console.log('SW registration failed', err));
  });
}

const initApp = async () => {
  // Load state from storage
  const savedState = window.storageManager.load('quran_app_state');
  if (savedState) {
    Object.assign(AppState.current, savedState.current || {});
    Object.assign(AppState.memorization, savedState.memorization || {});
    Object.assign(AppState.settings, savedState.settings || {});
    if (savedState.reports) {
      AppState.reports = savedState.reports;
    }
    if (savedState.userRole) {
      AppState.userRole = savedState.userRole;
    }
  }
  
  if (AppState.settings.childMode) {
    document.body.classList.add('theme-child');
  }

  const ui = {
    audio: document.getElementById('audio-player'),
    playBtn: document.getElementById('btn-play-pause'),
    btnRepeat: document.getElementById('btn-repeat'),
    btnPlayRecording: document.getElementById('btn-play-recording'),
    iconPlay: document.querySelector('.icon-play'),
    iconPause: document.querySelector('.icon-pause'),
    nextBtn: document.getElementById('btn-next'),
    prevBtn: document.getElementById('btn-prev'),
    surahSelect: document.getElementById('surah-select'),
    ayahSelect: document.getElementById('ayah-select'),
    reciterSelect: document.getElementById('reciter-select'),
    quranDisplay: document.getElementById('current-ayah-display'),
    progressSlider: document.getElementById('progress-slider'),
    sliderProgress: document.getElementById('slider-progress'),
    timeCurrent: document.getElementById('time-current'),
    timeTotal: document.getElementById('time-total'),
    micBtn: document.getElementById('btn-mic'),
    speechResult: document.getElementById('speech-result'),
    btnTour: document.getElementById('btn-tour'),
    btnSwitchRole: document.getElementById('btn-switch-role'),
    btnSendTeacher: document.getElementById('btn-send-teacher'),
    teacherModal: document.getElementById('teacher-dashboard-modal'),
    btnCloseTeacher: document.getElementById('btn-close-teacher'),
    teacherReportsList: document.getElementById('teacher-reports-list'),
    modalOverlay: document.getElementById('modal-overlay'),
    basmalah: document.getElementById('basmalah-container'),
    surahInput: document.getElementById('surah-input'),
    surahSuggestions: document.getElementById('surah-suggestions'),
    statMastered: document.getElementById('stat-mastered'),
    btnChildMode: document.getElementById('btn-child-mode'),
    btnEcho: document.getElementById('btn-echo'),
    btnListening: document.getElementById('btn-listening'),
    btnInstall: document.getElementById('btn-install'),
    btnForceUpdate: document.getElementById('btn-force-update'),
    tafsirDisplay: document.getElementById('tafsir-display'),
    translationDisplay: document.getElementById('translation-display'),
    listeningModal: document.getElementById('listening-mode-modal'),
    btnCloseListening: document.getElementById('btn-close-listening'),
    chkRepeatSurah: document.getElementById('chk-repeat-surah'),
    listeningRepeatContainer: document.getElementById('listening-repeat-surah-select-container'),
    listeningRepeatSelect: document.getElementById('listening-repeat-surah-select'),
    listeningSurahsList: document.getElementById('listening-surahs-list'),
    btnStartListeningMode: document.getElementById('btn-start-listening-mode'),
    chkLiveEcho: document.getElementById('chk-live-echo'),
    btnDonate: document.getElementById('btn-donate'),
    modalDonate: document.getElementById('modal-donate'),
    btnCloseDonate: document.getElementById('btn-close-donate'),
    btnCopyWallet: document.getElementById('btn-copy-wallet'),
    donateToast: document.getElementById('donate-toast'),
    btnShare: document.getElementById('btn-share'),
    modalShare: document.getElementById('modal-share'),
    btnCloseShare: document.getElementById('btn-close-share'),
    btnCopyLink: document.getElementById('btn-copy-link'),
    btnNativeShare: document.getElementById('btn-native-share'),
    shareToast: document.getElementById('share-toast'),
    btnToggleTextMinimal: document.getElementById('btn-toggle-text-minimal'),
    btnMoreMenu: document.getElementById('btn-more-menu'),
    headerMoreDropdown: document.getElementById('header-more-dropdown'),
    eyeIconOpen: document.getElementById('eye-icon-open'),
    eyeIconClosed: document.getElementById('eye-icon-closed'),
    btnAyahInfo: document.getElementById('btn-ayah-info'),
    modalTafsir: document.getElementById('modal-tafsir'),
    btnCloseTafsir: document.getElementById('btn-close-tafsir'),
    tafsirModalQuranText: document.getElementById('tafsir-modal-quran-text'),
    
    // Help & Guide Modal
    modalHelp: document.getElementById('modal-help'),
    btnCloseHelp: document.getElementById('btn-close-help'),
    tabHelpFeatures: document.getElementById('tab-help-features'),
    tabHelpTour: document.getElementById('tab-help-tour'),
    helpContentFeatures: document.getElementById('help-content-features'),
    helpContentTour: document.getElementById('help-content-tour'),
    btnStartInteractiveTour: document.getElementById('btn-start-interactive-tour')
  };

  karaokeEngine.init(ui.audio, ui.quranDisplay);
  let currentRecordedBlob = null;
  let listeningPlaylist = [];
  let currentPlaylistIndex = 0;
  let repeatSurahId = null;
  let currentPlayingRecording = null;
  let isTransitioning = false;
  let ayahErrorCount = 0;

  // Continuous gapless preloader system
  let preloadedNextAudio = {
    surahId: null,
    ayahNumber: null,
    url: null,
    blob: null
  };

  const preloaderAudio = document.createElement('audio');
  preloaderAudio.preload = 'auto';
  preloaderAudio.style.display = 'none';
  document.body.appendChild(preloaderAudio);

  function preloadNextAyah(currentSurahId, currentAyahNumber) {
    let nextSurahId = currentSurahId;
    let nextAyahNumber = parseInt(currentAyahNumber) + 1;
    
    // Find metadata for current surah
    const curSurahData = surahsData.find(s => s.id === currentSurahId);
    if (!curSurahData) return;
    
    // Check if we hit the end of the Surah
    if (nextAyahNumber > curSurahData.ayahCount) {
      if (document.body.classList.contains('theme-listening')) {
        // If looping specific Surah is enabled
        if (repeatSurahId && repeatSurahId == currentSurahId) {
          nextAyahNumber = 1;
        } else {
          // Find next Surah in playlist
          const nextIndex = currentPlaylistIndex + 1;
          if (nextIndex < listeningPlaylist.length) {
            nextSurahId = listeningPlaylist[nextIndex];
            nextAyahNumber = 1;
          } else {
            return; // end of playlist
          }
        }
      } else {
        return; // regular mode, end of surah
      }
    }
    
    const reciter = AppState.settings.reciter || 'fares';
    
    // Asynchronously resolve next audio to preloaderAudio
    DbManager.getOfflineAudio(reciter, nextSurahId, nextAyahNumber).then(blob => {
      if (blob) {
        preloadedNextAudio = {
          surahId: nextSurahId,
          ayahNumber: nextAyahNumber,
          url: URL.createObjectURL(blob),
          blob: blob
        };
        preloaderAudio.src = preloadedNextAudio.url;
        preloaderAudio.load();
      } else {
        const netUrl = quranAPI.generateAudioUrl(nextSurahId, nextAyahNumber, reciter);
        preloadedNextAudio = {
          surahId: nextSurahId,
          ayahNumber: nextAyahNumber,
          url: netUrl,
          blob: null
        };
        preloaderAudio.src = netUrl;
        preloaderAudio.load();
      }
    }).catch(e => console.warn("Background gapless preloading failed:", e));
  }

  // Initialize live echo state from UI checkbox
  if (ui.chkLiveEcho) {
    AppState.speech.liveEchoEnabled = ui.chkLiveEcho.checked;
  }

  const surahsData = [
    {id:1,name:'الفاتحة'},{id:2,name:'البقرة'},{id:3,name:'آل عمران'},{id:4,name:'النساء'},{id:5,name:'المائدة'},{id:6,name:'الأنعام'},{id:7,name:'الأعراف'},{id:8,name:'الأنفال'},{id:9,name:'التوبة'},{id:10,name:'يونس'},{id:11,name:'هود'},{id:12,name:'يوسف'},{id:13,name:'الرعد'},{id:14,name:'إبراهيم'},{id:15,name:'الحجر'},{id:16,name:'النحل'},{id:17,name:'الإسراء'},{id:18,name:'الكهف'},{id:19,name:'مريم'},{id:20,name:'طه'},{id:21,name:'الأنبياء'},{id:22,name:'الحج'},{id:23,name:'المؤمنون'},{id:24,name:'النور'},{id:25,name:'الفرقان'},{id:26,name:'الشعراء'},{id:27,name:'النمل'},{id:28,name:'القصص'},{id:29,name:'العنكبوت'},{id:30,name:'الروم'},{id:31,name:'لقمان'},{id:32,name:'السجدة'},{id:33,name:'الأحزاب'},{id:34,name:'سبأ'},{id:35,name:'فاطر'},{id:36,name:'يس'},{id:37,name:'الصافات'},{id:38,name:'ص'},{id:39,name:'الزمر'},{id:40,name:'غافر'},{id:41,name:'فصلت'},{id:42,name:'الشورى'},{id:43,name:'الزخرف'},{id:44,name:'الدخان'},{id:45,name:'الجاثية'},{id:46,name:'الأحقاف'},{id:47,name:'محمد'},{id:48,name:'الفتح'},{id:49,name:'الحجرات'},{id:50,name:'ق'},{id:51,name:'الذاريات'},{id:52,name:'الطور'},{id:53,name:'النجم'},{id:54,name:'القمر'},{id:55,name:'الرحمن'},{id:56,name:'الواقعة'},{id:57,name:'الحديد'},{id:58,name:'المجادلة'},{id:59,name:'الحشر'},{id:60,name:'الممتحنة'},{id:61,name:'الصف'},{id:62,name:'الجمعة'},{id:63,name:'المنافقون'},{id:64,name:'التغابن'},{id:65,name:'الطلاق'},{id:66,name:'التحريم'},{id:67,name:'الملك'},{id:68,name:'القلم'},{id:69,name:'الحاقة'},{id:70,name:'المعارج'},{id:71,name:'نوح'},{id:72,name:'الجن'},{id:73,name:'المزمل'},{id:74,name:'المدثر'},{id:75,name:'القيامة'},{id:76,name:'الإنسان'},{id:77,name:'المرسلات'},{id:78,name:'النبأ'},{id:79,name:'النازعات'},{id:80,name:'عبس'},{id:81,name:'التكوير'},{id:82,name:'الانفطار'},{id:83,name:'المطففين'},{id:84,name:'الانشقاق'},{id:85,name:'البروج'},{id:86,name:'الطارق'},{id:87,name:'الأعلى'},{id:88,name:'الغاشية'},{id:89,name:'الفجر'},{id:90,name:'البلد'},{id:91,name:'الشمس'},{id:92,name:'الليل'},{id:93,name:'الضحى'},{id:94,name:'الشرح'},{id:95,name:'التين'},{id:96,name:'العلق'},{id:97,name:'القدر'},{id:98,name:'البينة'},{id:99,name:'الزلزلة'},{id:100,name:'العاديات'},{id:101,name:'القارعة'},{id:102,name:'التكاثر'},{id:103,name:'العصر'},{id:104,name:'الهمزة'},{id:105,name:'الفيل'},{id:106,name:'قريش'},{id:107,name:'الماعون'},{id:108,name:'الكوثر'},{id:109,name:'الكافرون'},{id:110,name:'النصر'},{id:111,name:'المسد'},{id:112,name:'الإخلاص'},{id:113,name:'الفلق'},{id:114,name:'الناس'}
  ];

  const initialSurah = surahsData.find(s => s.id == AppState.current.surah.id);
  ui.surahInput.value = initialSurah ? `سورة ${initialSurah.name}` : '';

  // Populate reciters list
  const reciters = [
    { id: 'fares', name: 'الشيخ فارس عباد' },
    { id: 'minshawi_muallim', name: 'الشيخ محمد صديق المنشاوي (المعلم)' },
    { id: 'mishary', name: 'الشيخ مشاري العفاسي' },
    { id: 'husary', name: 'الشيخ محمود خليل الحصري' },
    { id: 'maher', name: 'الشيخ ماهر المعيقلي' },
    { id: 'sudais', name: 'الشيخ عبد الرحمن السديس' },
    { id: 'abdulbasit', name: 'الشيخ عبد الباسط عبد الصمد' },
    { id: 'ayman', name: 'الشيخ أيمن سويد (المصحف المعلم)' }
  ];
  reciters.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = r.name;
    ui.reciterSelect.appendChild(opt);
  });

  // Default to fares (Fares Abbad)
  if (!AppState.settings.reciter || !['fares', 'minshawi_muallim', 'mishary', 'husary', 'maher', 'sudais', 'abdulbasit', 'ayman'].includes(AppState.settings.reciter)) {
    AppState.settings.reciter = 'fares';
  }
  ui.reciterSelect.value = AppState.settings.reciter;

  async function loadSurah(surahId) {
    try {
      ui.quranDisplay.innerHTML = 'جاري التحميل...';
      const data = await quranAPI.fetchSurahWithTranslations(surahId);
      AppState.current.surah.id = data.metadata.id;
      AppState.current.surah.ayahCount = data.metadata.ayahCount;
      AppState.current.surah.name = data.metadata.name;
      
      // Update ayah select
      ui.ayahSelect.innerHTML = '';
      for(let i=1; i<=data.metadata.ayahCount; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `آية ${i}`;
        ui.ayahSelect.appendChild(opt);
      }

      // Select first ayah
      loadAyah(1, data.arabic);
      
      // Update progress badge for current surah
      const masteredArr = AppState.memorization.mastered[surahId] || [];
      const progressVal = Math.round((masteredArr.length / data.metadata.ayahCount) * 100);
      AppState.memorization.progress = progressVal;
      
    } catch(err) {
      ui.quranDisplay.innerHTML = 'حدث خطأ في تحميل السورة';
    }
  }

  async function checkOfflineStatusAndAlert() {
    if (!navigator.onLine) {
      const cachedKeys = await DbManager.getCachedKeys();
      const cachedSurahIds = new Set();
      cachedKeys.forEach(key => {
        const parts = key.split('_S');
        if (parts.length > 1) {
          const surahId = parseInt(parts[1].split('_')[0]);
          cachedSurahIds.add(surahId);
        }
      });
      
      if (cachedSurahIds.size > 0) {
        const names = Array.from(cachedSurahIds)
          .map(id => surahsData.find(s => s.id === id)?.name)
          .filter(Boolean)
          .join('، ');
        ui.speechResult.textContent = `تنبيه: أنت غير متصل بالإنترنت. السور المتاحة للاستماع إليها حالياً دون اتصال هي: سورة (${names}) فقط.`;
        ui.speechResult.classList.add('show');
        setTimeout(() => ui.speechResult.classList.remove('show'), 8000);
      } else {
        ui.speechResult.textContent = 'تنبيه: أنت غير متصل بالإنترنت، ولا توجد سور محفوظة مسبقاً للاستماع إليها دون اتصال.';
        ui.speechResult.classList.add('show');
        setTimeout(() => ui.speechResult.classList.remove('show'), 6000);
      }
    }
  }

  function updateMediaSessionMetadata(ayahNumber) {
    if ('mediaSession' in navigator) {
      let currentSurah = AppState.current.surah.name || '';
      // Clean duplicate "سورة" prefixes from API output if already present
      if (!currentSurah.startsWith('سورة') && !currentSurah.startsWith('سُورَة')) {
        currentSurah = `سورة ${currentSurah}`;
      }
      const reciterId = AppState.settings.reciter || 'fares';
      const reciterName = reciters.find(r => r.id === reciterId)?.name || 'القارئ';
      
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${currentSurah} - آية ${ayahNumber}`,
        artist: reciterName,
        album: 'محفّظ',
        artwork: [
          { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: './icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      });

      // Synchronize lockscreen active playback state
      navigator.mediaSession.playbackState = AppState.player.isPlaying ? 'playing' : 'paused';
    }
  }

  function loadAyah(ayahNumber, arabicData) {
    if(!arabicData) {
        // Find in cache
        const cacheKey = `surah_${AppState.current.surah.id}`;
        const cached = quranAPI.cache.get(cacheKey);
        if(cached) arabicData = cached.arabic;
    }
    
    if(!arabicData) return;
    
    const ayahData = arabicData.find(a => a.id == ayahNumber);
    if(!ayahData) return;

    AppState.current.ayah.id = ayahNumber;
    AppState.current.ayah.text = ayahData.text;
    ui.ayahSelect.value = ayahNumber;

    // Reset recording buttons
    ui.btnPlayRecording.disabled = true;
    ui.btnPlayRecording.style.opacity = '0.5';
    AppState.speech.detectedText = '';
    AppState.speech.latestScore = 0;
    ayahErrorCount = 0;
    currentRecordedBlob = null;
    ui.speechResult.classList.remove('show');
    ui.btnSendTeacher.style.display = 'none';

    // Load existing recording from IndexedDB
    DbManager.getAudioRecording(AppState.current.surah.id, ayahNumber).then(blob => {
      if (blob) {
        currentRecordedBlob = blob;
        ui.btnPlayRecording.disabled = false;
        ui.btnPlayRecording.style.opacity = '1';
        ui.btnPlayRecording.style.color = '#0ea5e9'; // Blue indicates a saved recording exists
      } else {
        ui.btnPlayRecording.style.color = ''; // Default grey
      }
    });
    
    // Update Tafsir and Translation content
    ui.tafsirDisplay.innerHTML = `<strong>التفسير الميسر:</strong><br>${ayahData.tafsir || 'جاري التحميل...'}`;
    ui.translationDisplay.innerHTML = `<strong>Sahih International:</strong><br>${ayahData.translation || 'Loading...'}`;
    if (ui.tafsirModalQuranText) {
      ui.tafsirModalQuranText.textContent = ayahData.text || '';
    }
    
    // Basmalah logic
    if (ayahNumber == 1 && AppState.current.surah.id != 1 && AppState.current.surah.id != 9) {
      ui.basmalah.style.display = 'block';
    } else {
      ui.basmalah.style.display = 'none';
    }

    // Update focused title in focus mode
    const focusedTitle = document.getElementById('focused-ayah-title');
    if (focusedTitle) {
      const surahName = AppState.current.surah.name || '';
      const repeatText = AppState.player.repeatAyah ? ' (تكرار مفعل)' : '';
      focusedTitle.textContent = `سورة ${surahName} - آية ${ayahNumber}${repeatText}`;
    }

    // Display words
    ui.quranDisplay.innerHTML = '';
    
    // Add size modifier classes based on character and word count to prevent vertical overflow
    const charCount = ayahData.text.length;
    const wordCount = ayahData.words.length;
    ui.quranDisplay.classList.remove('long-ayah', 'very-long-ayah');
    if (charCount > 100 || wordCount > 15) {
      ui.quranDisplay.classList.add('very-long-ayah');
    } else if (charCount > 55 || wordCount > 9) {
      ui.quranDisplay.classList.add('long-ayah');
    }

    ayahData.words.forEach(word => {
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = word;
      ui.quranDisplay.appendChild(span);
      ui.quranDisplay.appendChild(document.createTextNode(' '));
    });

    // Append traditional Arabic end-of-ayah marker
    const marker = document.createElement('span');
    marker.className = 'ayah-number-marker';
    marker.style.fontFamily = 'var(--font-quran)';
    marker.style.fontSize = '0.8em';
    marker.style.color = 'var(--text-secondary)';
    marker.style.opacity = '0.8';
    marker.style.marginRight = '6px';
    marker.style.userSelect = 'none';
    marker.textContent = `﴿${parseInt(ayahNumber).toLocaleString('ar-EG')}﴾`;
    ui.quranDisplay.appendChild(marker);

    // Update Audio (Offline caching first)
    const reciter = AppState.settings.reciter || 'fares';
    const surahId = AppState.current.surah.id;
    
    // Check if preloaded URL is ready for this ayah!
    if (preloadedNextAudio.surahId === surahId && preloadedNextAudio.ayahNumber === ayahNumber && preloadedNextAudio.url) {
      ui.audio.src = preloadedNextAudio.url;
      playAudio();
      
      // Start preloading the NEXT ayah immediately in the background!
      preloadNextAyah(surahId, ayahNumber);
    } else {
      // If we are online, construct the network URL and play SYNCHRONOUSLY to preserve user gesture
      if (navigator.onLine) {
        const netUrl = quranAPI.generateAudioUrl(surahId, ayahNumber, reciter);
        ui.audio.src = netUrl;
        playAudio();
        
        // Cache to IndexedDB in background
        fetch(netUrl)
          .then(res => { if (res.ok) return res.blob(); })
          .then(blob => { if (blob) DbManager.saveOfflineAudio(reciter, surahId, ayahNumber, blob); })
          .catch(err => console.warn("Background audio cache failed:", err));
          
        preloadNextAyah(surahId, ayahNumber);
      } else {
        // If offline and not preloaded, fall back to checking IndexedDB asynchronously
        DbManager.getOfflineAudio(reciter, surahId, ayahNumber).then(cachedBlob => {
          if (cachedBlob) {
            const localUrl = URL.createObjectURL(cachedBlob);
            ui.audio.src = localUrl;
            playAudio();
          } else {
            ui.audio.src = '';
            AppState.player.isPlaying = false;
            checkOfflineStatusAndAlert();
          }
          preloadNextAyah(surahId, ayahNumber);
        }).catch(err => {
          preloadNextAyah(surahId, ayahNumber);
        });
      }
    }

    function playAudio() {
      ui.audio.volume = 1.0;
      ui.audio.muted = false;
      
      karaokeEngine.setWords(ayahData.text, ui.quranDisplay);
      
      // Update background OS lockscreen metadata
      updateMediaSessionMetadata(ayahNumber);
      
      // Play automatically if playing state is true
      if (AppState.player.isPlaying) {
        if (speechEngine.isRecording) speechEngine.stop(); // Prevent overlap
        ui.audio.play().catch(e => { AppState.player.isPlaying = false; });
      }
    }
  }

  observer.subscribe('isPlaying', (val) => {
    if(val) {
      if (speechEngine.isRecording) speechEngine.stop(); // Stop mic if audio plays
      ui.iconPlay.style.display = 'none';
      ui.iconPause.style.display = 'block';
      document.body.classList.add('recitation-playing');
    } else {
      ui.iconPlay.style.display = 'block';
      ui.iconPause.style.display = 'none';
      ui.audio.pause();
      document.body.classList.remove('recitation-playing');
    }
  });

  observer.subscribe('isListening', (val) => {
    if(val) {
      ui.micBtn.classList.add('listening');
    } else {
      ui.micBtn.classList.remove('listening');
    }
  });

  observer.subscribe('progress', (val) => {
    if(ui.statMastered) ui.statMastered.textContent = `${val}%`;
  });

  // Audio events and OS lockscreen state synchronization
  const syncPlaybackState = () => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = AppState.player.isPlaying ? 'playing' : 'paused';
    }
  };

  ui.audio.addEventListener('play', () => {
    isTransitioning = false;
    AppState.player.isPlaying = true;
    syncPlaybackState();
    setTimeout(syncPlaybackState, 100);
    setTimeout(syncPlaybackState, 300);
  });

  ui.audio.addEventListener('playing', () => {
    isTransitioning = false;
    AppState.player.isPlaying = true;
    syncPlaybackState();
    setTimeout(syncPlaybackState, 100);
    setTimeout(syncPlaybackState, 300);
  });

  ui.audio.addEventListener('pause', () => {
    if (isTransitioning) return;
    AppState.player.isPlaying = false;
    syncPlaybackState();
    setTimeout(syncPlaybackState, 100);
  });
  ui.audio.addEventListener('ended', () => {
    if (AppState.player.repeatAyah) {
      ui.audio.currentTime = 0;
      ui.audio.play();
    } else {
      // Next ayah
      const next = parseInt(AppState.current.ayah.id) + 1;
      if (next <= AppState.current.surah.ayahCount) {
        isTransitioning = true;
        AppState.player.isPlaying = true;
        loadAyah(next);
      } else {
        // If we are in listening mode, check if we go to next surah
        if (document.body.classList.contains('theme-listening')) {
          // Check if we should repeat this specific surah
          if (repeatSurahId && repeatSurahId == AppState.current.surah.id) {
            isTransitioning = true;
            AppState.player.isPlaying = true;
            loadSurah(AppState.current.surah.id).catch(e => {});
          } else {
            // Next surah in playlist
            currentPlaylistIndex++;
            if (currentPlaylistIndex < listeningPlaylist.length) {
              isTransitioning = true;
              AppState.player.isPlaying = true;
              loadSurah(listeningPlaylist[currentPlaylistIndex]).catch(e => {});
            } else {
              // End of playlist
              AppState.player.isPlaying = false;
              document.body.classList.remove('theme-listening');
              ui.btnListening.style.color = '';
            }
          }
        } else {
          AppState.player.isPlaying = false;
        }
      }
    }
  });

  ui.audio.addEventListener('timeupdate', () => {
    const cur = ui.audio.currentTime;
    const dur = ui.audio.duration || 0;
    const percent = dur ? (cur/dur)*100 : 0;
    ui.progressSlider.value = percent;
    ui.sliderProgress.style.width = `${percent}%`;
    
    const fmt = (t) => {
        let m = Math.floor(t/60);
        let s = Math.floor(t%60);
        return `${m < 10 ? '0':''}${m}:${s<10?'0':''}${s}`;
    }
    ui.timeCurrent.textContent = fmt(cur);
    if(dur) ui.timeTotal.textContent = fmt(dur);
  });

  ui.playBtn.addEventListener('click', () => {
    if (AppState.player.isPlaying) {
      ui.audio.pause();
      AppState.player.isPlaying = false;
    } else {
      if (speechEngine.isRecording) speechEngine.stop();
      ui.audio.volume = 1.0;
      ui.audio.muted = false;
      ui.audio.play().catch(e => {
        alert("لم نتمكن من تشغيل الصوت. تأكد من اتصالك بالإنترنت. " + e.message);
        AppState.player.isPlaying = false;
      });
      AppState.player.isPlaying = true;
    }
  });

  if (ui.btnRepeat) {
    ui.btnRepeat.addEventListener('click', () => {
      AppState.player.repeatAyah = !AppState.player.repeatAyah;
      if (AppState.player.repeatAyah) {
        ui.btnRepeat.style.color = 'var(--accent-primary)';
      } else {
        ui.btnRepeat.style.color = '';
      }
      // Update focused title repeat status immediately!
      const focusedTitle = document.getElementById('focused-ayah-title');
      if (focusedTitle) {
        const surahName = AppState.current.surah.name || '';
        const repeatText = AppState.player.repeatAyah ? ' (تكرار مفعل)' : '';
        focusedTitle.textContent = `سورة ${surahName} - آية ${AppState.current.ayah.id}${repeatText}`;
      }
    });
  }

  function transitionToAyahWithRecording(targetAyah) {
    if (speechEngine.isRecording) {
      // Stop current recording, save it, and restart for the next ayah
      speechEngine.stop(true);
      
      // Update UI immediately to show recording will continue
      ui.btnPlayRecording.disabled = true;
      ui.btnPlayRecording.style.opacity = '0.5';
      ui.speechResult.textContent = 'جاري تسجيل تلاوتك للآية التالية تلقائياً...';
      ui.speechResult.classList.add('show');
    }
    
    isRecitationTransitioning = true;
    setTimeout(() => {
      isRecitationTransitioning = false;
    }, 2000); // 2.0s safety window to allow speech engine to completely restart and ignore any previous trailing words
    
    loadAyah(targetAyah);
  }

  ui.nextBtn.addEventListener('click', () => {
    const next = parseInt(AppState.current.ayah.id) + 1;
    if (next <= AppState.current.surah.ayahCount) {
      isTransitioning = true;
      if (speechEngine.isRecording) {
        transitionToAyahWithRecording(next);
      } else {
        if (AppState.player.isPlaying) {
          AppState.player.isPlaying = true;
        }
        loadAyah(next);
      }
    }
  });

  ui.prevBtn.addEventListener('click', () => {
    const prev = parseInt(AppState.current.ayah.id) - 1;
    if (prev > 0) {
      isTransitioning = true;
      if (speechEngine.isRecording) {
        transitionToAyahWithRecording(prev);
      } else {
        if (AppState.player.isPlaying) {
          AppState.player.isPlaying = true;
        }
        loadAyah(prev);
      }
    }
  });

  // Render custom autocomplete suggestions for Surahs
  function renderSuggestions(query = '') {
    ui.surahSuggestions.innerHTML = '';
    const cleanQuery = query.trim().replace('سورة ', '').replace(/[أإآ]/g, 'ا');
    
    const filtered = surahsData.filter(s => {
      if (!cleanQuery) return true;
      const cleanName = s.name.replace(/[أإآ]/g, 'ا');
      return cleanName.includes(cleanQuery);
    });
    
    if (filtered.length === 0) {
      ui.surahSuggestions.style.display = 'none';
      return;
    }
    
    filtered.forEach(s => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      item.textContent = `سورة ${s.name}`;
      item.addEventListener('mousedown', (e) => {
        // Prevent input blur before click is registered
        e.preventDefault(); 
        ui.surahInput.value = `سورة ${s.name}`;
        ui.surahSuggestions.style.display = 'none';
        loadSurah(s.id);
      });
      ui.surahSuggestions.appendChild(item);
    });
    
    ui.surahSuggestions.style.display = 'block';
  }

  ui.surahInput.addEventListener('input', (e) => {
    renderSuggestions(e.target.value);
  });

  ui.surahInput.addEventListener('focus', (e) => {
    e.target.value = ''; // clear to allow easy searching
    renderSuggestions('');
  });

  ui.surahInput.addEventListener('blur', (e) => {
    ui.surahSuggestions.style.display = 'none';
    if (!e.target.value) {
      const current = surahsData.find(s => s.id == AppState.current.surah.id);
      e.target.value = current ? `سورة ${current.name}` : '';
    }
  });

  ui.ayahSelect.addEventListener('change', (e) => {
    loadAyah(e.target.value);
  });

  ui.reciterSelect.addEventListener('change', (e) => {
    AppState.settings.reciter = e.target.value;
    // Reload current ayah to update audio source
    loadAyah(AppState.current.ayah.id);
  });

  ui.progressSlider.addEventListener('input', (e) => {
    const dur = ui.audio.duration;
    if(dur) {
        ui.audio.currentTime = (e.target.value / 100) * dur;
    }
  });

  // View Toggles Logic & Tafsir Modal
  function openTafsirModal() {
    if (ui.tafsirModalQuranText) {
      ui.tafsirModalQuranText.textContent = AppState.current.ayah.text || '';
    }
    ui.modalOverlay.style.display = 'block';
    if (ui.modalTafsir) ui.modalTafsir.style.display = 'block';
  }

  function closeTafsirModal() {
    ui.modalOverlay.style.display = 'none';
    if (ui.modalTafsir) ui.modalTafsir.style.display = 'none';
  }

  if (ui.btnAyahInfo) {
    ui.btnAyahInfo.addEventListener('click', () => {
      const sectionTafsir = document.getElementById('modal-tafsir-section');
      const sectionTranslation = document.getElementById('modal-translation-section');
      if (sectionTafsir) sectionTafsir.style.display = 'block';
      if (sectionTranslation) sectionTranslation.style.display = 'block';
      
      openTafsirModal();
    });
  }

  if (ui.btnCloseTafsir) {
    ui.btnCloseTafsir.addEventListener('click', closeTafsirModal);
  }

  // Speech listeners & testing mode transitions
  let correctTransitionTimeout = null;
  let isRecitationTransitioning = false;

  // Google Analytics Event Tracking Helper
  function trackAnalyticsEvent(eventName, params = {}) {
    if (typeof gtag === 'function') {
      try {
        gtag('event', eventName, params);
      } catch (err) {
        console.warn("Analytics event tracking failed:", err);
      }
    }
  }

  function markAyahAsMastered(surahId, ayahId) {
    if (!surahId || !ayahId) return;
    if (!AppState.memorization.mastered[surahId]) {
      AppState.memorization.mastered[surahId] = [];
    }
    
    const masteredForSurah = AppState.memorization.mastered[surahId];
    if (!masteredForSurah.includes(ayahId)) {
      const updated = [...masteredForSurah, ayahId];
      
      // Update state reactively
      const newMastered = { ...AppState.memorization.mastered };
      newMastered[surahId] = updated;
      AppState.memorization.mastered = newMastered;
      
      // Recalculate progress for current surah
      const ayahCount = AppState.current.surah.ayahCount || 1;
      const progressVal = Math.round((updated.length / ayahCount) * 100);
      AppState.memorization.progress = progressVal;
    }
  }

  function markAyahAsUnmastered(surahId, ayahId) {
    if (!surahId || !ayahId) return;
    if (!AppState.memorization.mastered[surahId]) return;
    
    const masteredForSurah = AppState.memorization.mastered[surahId];
    if (masteredForSurah.includes(ayahId)) {
      const updated = masteredForSurah.filter(id => id !== ayahId);
      
      // Update state reactively
      const newMastered = { ...AppState.memorization.mastered };
      newMastered[surahId] = updated;
      AppState.memorization.mastered = newMastered;
      
      // Recalculate progress for current surah
      const ayahCount = AppState.current.surah.ayahCount || 1;
      const progressVal = Math.round((updated.length / ayahCount) * 100);
      AppState.memorization.progress = progressVal;
    }
  }

  function highlightMistakes(spokenText, referenceText) {
    const normalizeOpts = { removeDiacritics: true, unifyLetters: true };
    const normalizer = speechEngine.matchAlgo.normalizer;
    
    const cleanSpoken = normalizer.normalize(spokenText, normalizeOpts);
    const spokenWords = cleanSpoken.split(' ').filter(w => w.length > 0);
    
    const rawRefWords = referenceText.split(' ').filter(w => w.length > 0);
    const cleanRefWords = rawRefWords.map(w => normalizer.normalize(w, normalizeOpts));
    
    const m = spokenWords.length;
    const n = cleanRefWords.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (spokenWords[i - 1] === cleanRefWords[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    
    const matchedRefIndices = new Set();
    const matchedSpokenIndices = new Set();
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (spokenWords[i - 1] === cleanRefWords[j - 1]) {
        matchedRefIndices.add(j - 1);
        matchedSpokenIndices.add(i - 1);
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    // Levenshtein distance helper for phonetic similarity check
    const getEditDistance = (a, b) => {
      const matrix = [];
      for (let x = 0; x <= b.length; x++) matrix[x] = [x];
      for (let y = 0; y <= a.length; y++) matrix[0][y] = y;
      
      for (let x = 1; x <= b.length; x++) {
        for (let y = 1; y <= a.length; y++) {
          if (b.charAt(x - 1) === a.charAt(y - 1)) {
            matrix[x][y] = matrix[x - 1][y - 1];
          } else {
            matrix[x][y] = Math.min(
              matrix[x - 1][y - 1] + 1, // substitution
              matrix[x][y - 1] + 1,     // insertion
              matrix[x - 1][y] + 1      // deletion
            );
          }
        }
      }
      return matrix[b.length][a.length];
    };

    const isPhoneticallyClose = (wordA, wordB) => {
      const dist = getEditDistance(wordA, wordB);
      const maxLen = Math.max(wordA.length, wordB.length);
      if (maxLen <= 3) return dist <= 1;
      if (maxLen <= 5) return dist <= 2;
      return dist <= 3;
    };
    
    ui.quranDisplay.innerHTML = '';
    rawRefWords.forEach((word, idx) => {
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = word;
      
      if (matchedRefIndices.has(idx)) {
        span.style.color = '#22c55e'; // Green for correct words
        span.style.fontWeight = '500';
      } else {
        // Check if there is an unmatched spoken word that is phonetically close
        let closeMatchFound = false;
        for (let sIdx = 0; sIdx < spokenWords.length; sIdx++) {
          if (!matchedSpokenIndices.has(sIdx) && isPhoneticallyClose(cleanRefWords[idx], spokenWords[sIdx])) {
            closeMatchFound = true;
            matchedSpokenIndices.add(sIdx); // Consume it
            break;
          }
        }
        
        if (closeMatchFound) {
          span.style.color = '#f97316'; // Orange for tajweed/pronunciation mistakes
          span.style.textDecoration = 'underline double #f97316';
          span.style.fontWeight = 'bold';
        } else {
          span.style.color = '#ef4444'; // Red for missing/forgotten words (Hifz)
          span.style.textDecoration = 'underline dashed #ef4444';
          span.style.fontWeight = 'bold';
        }
      }
      
      ui.quranDisplay.appendChild(span);
      ui.quranDisplay.appendChild(document.createTextNode(' '));
    });
    
    const marker = document.createElement('span');
    marker.className = 'ayah-number-marker';
    marker.style.fontFamily = 'var(--font-quran)';
    marker.style.fontSize = '0.8em';
    marker.style.color = 'var(--text-secondary)';
    marker.style.opacity = '0.8';
    marker.style.marginRight = '6px';
    marker.style.userSelect = 'none';
    marker.textContent = `﴿${parseInt(AppState.current.ayah.id).toLocaleString('ar-EG')}﴾`;
    ui.quranDisplay.appendChild(marker);
    
    ui.quranDisplay.classList.add('reveal-words');
  }

  ui.micBtn.addEventListener('click', () => {
    if(speechEngine.isRecording) {
      speechEngine.stop();
    } else {
      if (AppState.player.isPlaying) AppState.player.isPlaying = false; // Stop reciter audio
      ui.btnPlayRecording.disabled = true;
      ui.btnPlayRecording.style.opacity = '0.5';
      ui.speechResult.textContent = 'جاري تسجيل تلاوتك الآن...';
      ui.speechResult.classList.add('show');
      speechEngine.start();
    }
  });

  // --- المؤثرات الصوتية والبصرية لتشجيع الأطفال في وضع التسميع ---
  function playChildSuccessSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      const now = ctx.currentTime;
      
      // نغمتين متتاليتين صاعدتين ومبهجتين (أصوات ألعاب فيديو)
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
      osc.frequency.setValueAtTime(1046.50, now + 0.24); // C6
      
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.45);
      
      osc.start(now);
      osc.stop(now + 0.45);
    } catch(e) {
      console.warn("Child sound context error:", e);
    }
  }

  function playChildOopsSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle'; // صوت دافئ وناعم وغير مخيف
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      const now = ctx.currentTime;
      
      // نغمة كرتونية لطيفة للتشجيع على المحاولة من جديد
      osc.frequency.setValueAtTime(329.63, now); // E4
      osc.frequency.exponentialRampToValueAtTime(220.00, now + 0.22); // A3
      
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.25);
      
      osc.start(now);
      osc.stop(now + 0.25);
    } catch(e) {
      console.warn("Child sound context error:", e);
    }
  }

  function triggerEmojiExplosion() {
    try {
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '100vw';
      container.style.height = '100vh';
      container.style.pointerEvents = 'none';
      container.style.zIndex = '9999';
      document.body.appendChild(container);
      
      const emojis = ['⭐', '🎉', '🎈', '✨', '🌸', '🥳', '🌈', '👏', '🏆', '💫'];
      const count = 30;
      
      for (let i = 0; i < count; i++) {
        const el = document.createElement('span');
        el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        el.style.position = 'absolute';
        el.style.left = '50%';
        el.style.top = '60%';
        el.style.fontSize = `${Math.floor(Math.random() * 20) + 20}px`;
        el.style.transition = 'all 1.2s cubic-bezier(0.25, 1, 0.5, 1)';
        el.style.opacity = '1';
        
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * 250 + 60;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance - 150;
        
        container.appendChild(el);
        
        requestAnimationFrame(() => {
          el.style.transform = `translate(${tx}px, ${ty}px) scale(0)`;
          el.style.opacity = '0';
        });
      }
      
      setTimeout(() => container.remove(), 1200);
    } catch(e) {}
  }

  window.addEventListener('speechresult', (e) => {
    if (isRecitationTransitioning) return;
    const { text } = e.detail;
    AppState.speech.detectedText = text;
    
    // Calculate word match score against the current ayah text
    const referenceText = AppState.current.ayah.text || '';
    if (referenceText && text) {
      const score = speechEngine.matchAlgo.calculateMatchScore(text, referenceText);
      AppState.speech.latestScore = score;

      const spokenWords = text.trim().split(/\s+/).filter(w => w.length > 0);
      const refWords = referenceText.trim().split(/\s+/).filter(w => w.length > 0);
      const spokenWordsCount = spokenWords.length;
      const refWordsCount = refWords.length;
      
      // Relaxed matching check: accepts if score >= 78% (allowing speech-to-text minor word/pronunciation variations)
      const scoreCorrect = score >= 0.78;
      
      // To prevent premature ending, ensure they have reached the end of the ayah:
      // 1. Spoken words length must be at least refWordsCount - 1
      // 2. Either the last word or second-to-last word of the reference must be matched somewhere in the spoken text, or spoken words count is >= refWordsCount
      let isCorrect = scoreCorrect;
      if (scoreCorrect && refWordsCount > 1) {
        const lastWord = refWords[refWordsCount - 1];
        const secondLastWord = refWords[refWordsCount - 2];
        
        const isLastWordMatched = spokenWords.some(sw => speechEngine.matchAlgo.isWordMatch(sw, lastWord));
        const isSecondLastMatched = spokenWords.some(sw => speechEngine.matchAlgo.isWordMatch(sw, secondLastWord));
        
        const hasReachedEnd = (spokenWordsCount >= refWordsCount - 1) && 
                             (isLastWordMatched || isSecondLastMatched || spokenWordsCount >= refWordsCount);
        
        isCorrect = hasReachedEnd;
      }

      // Mark as mastered if correct, otherwise mark as unmastered (for logical accuracy)
      if (isCorrect) {
        markAyahAsMastered(AppState.current.surah.id, AppState.current.ayah.id);
        trackAnalyticsEvent('recitation_success', {
          surah_id: AppState.current.surah.id,
          surah_name: AppState.current.surah.name,
          ayah_id: AppState.current.ayah.id,
          score: score
        });
      } else {
        markAyahAsUnmastered(AppState.current.surah.id, AppState.current.ayah.id);
      }

      // Handle recitation testing mode (whole Surah recitation mode)
      if (AppState.settings.hideTextMode) {
        const isChildMode = document.body.classList.contains('theme-child');

        // If the score is correct, reveal the ayah and auto-advance
        if (isCorrect && !correctTransitionTimeout) {
          isRecitationTransitioning = true;
          // Play sounds & rewards if child mode is active
          if (isChildMode) {
            playChildSuccessSound();
            triggerEmojiExplosion();
          }

          // 1. Reveal words of current active Ayah
          ui.quranDisplay.classList.add('reveal-words');
          
          if (isChildMode) {
            const successMsgs = [
              '🏆✨ <strong>أنت بطل الحفظ المتميز!</strong> تبارك الرحمن قراءة رائعة وممتازة...',
              '🌟🎈 <strong>ما شاء الله!</strong> قراءتك صحيحة وجميلة جداً يا بطل...',
              '⭐🎉 <strong>أحسنت يا ذكي!</strong> تلاوة صحيحة، استمر في هذا الأداء الرائع...',
              '🌈👏 <strong>ممتاز جداً!</strong> حافظ على هذا المستوى الجميل يا بطل...'
            ];
            ui.speechResult.innerHTML = successMsgs[Math.floor(Math.random() * successMsgs.length)];
          } else {
            ui.speechResult.innerHTML = '✔️ <strong>تسميع صحيح ومقبول!</strong> - الانتقال للآية التالية...';
          }
          ui.speechResult.classList.add('show');
          
          // 2. Clear error class if any
          ui.quranDisplay.classList.remove('recitation-error');
          
          // 3. Set timeout to transition to next Ayah and keep mic recording
          correctTransitionTimeout = setTimeout(() => {
            ui.quranDisplay.classList.remove('reveal-words');
            correctTransitionTimeout = null;
            
            const next = parseInt(AppState.current.ayah.id) + 1;
            if (next <= AppState.current.surah.ayahCount) {
              transitionToAyahWithRecording(next);
            } else {
              speechEngine.stop(false);
              if (isChildMode) {
                ui.speechResult.innerHTML = '🎉🏆 <strong>تهانينا يا بطل الأبطال!</strong> لقد أتممت تسميع السورة كاملة بنجاح! 👑🎈';
              } else {
                ui.speechResult.innerHTML = '🎉 <strong>تهانينا!</strong> لقد أتممت تسميع السورة كاملة بنجاح!';
              }
              ui.speechResult.classList.add('show');
              setTimeout(() => ui.speechResult.classList.remove('show'), 5000);
            }
          }, 1800);
        }
        // If user spoke a significant number of words (with a safe buffer for tartil) but it's not correct (Mistake)
        else if (!correctTransitionTimeout && spokenWordsCount >= Math.max(refWordsCount + 5, Math.ceil(refWordsCount * 1.5))) {
          // Stop recording to prevent extra recording and let them fix
          speechEngine.stop(false);
          
          ayahErrorCount++;
          
          trackAnalyticsEvent('recitation_error', {
            surah_id: AppState.current.surah.id,
            surah_name: AppState.current.surah.name,
            ayah_id: AppState.current.ayah.id,
            error_count: ayahErrorCount,
            score: score
          });
          
          // Always unmark as mastered since there are errors in recitation
          markAyahAsUnmastered(AppState.current.surah.id, AppState.current.ayah.id);
          
          if (isChildMode) {
            playChildOopsSound();
            ui.quranDisplay.classList.add('recitation-error');
            setTimeout(() => ui.quranDisplay.classList.remove('recitation-error'), 1000);

            const encouragements = [
              '💫🦁 <strong>لا بأس يا بطل!</strong> حاول مرة أخرى بصوتك الجميل وسوف تنجح بالتأكيد...',
              '🦄🌸 <strong>حاولة رائعة!</strong> أنت قريب جداً، أعد المحاولة يا ذكي...',
              '🎈❤️ <strong>أنت شجاع وتستطيع فعلها!</strong> ركز جيداً وأعد قراءتها...'
            ];
            ui.speechResult.innerHTML = encouragements[Math.floor(Math.random() * encouragements.length)];
          } else {
            if (ayahErrorCount >= 3) {
              highlightMistakes(text, referenceText);
              ui.speechResult.innerHTML = '⚠️ <strong>تحليل التسميع (أخطاء الحفظ والتجويد):</strong> تم تلوين الكلمات لمساعدتك لتصحيح التلاوة:<br>' +
                '<span style="color: #22c55e; font-weight: bold; margin: 0 5px;">🟢 صحيح</span> | ' +
                '<span style="color: #f97316; font-weight: bold; margin: 0 5px;">🟠 خطأ نطق/تجويد</span> | ' +
                '<span style="color: #ef4444; font-weight: bold; margin: 0 5px;">🔴 خطأ حفظ (نسيان)</span>';
            } else {
              ui.speechResult.innerHTML = `⚠️ <strong>خطأ في التسميع:</strong> تلاوتك غير مطابقة بالكامل. المحاولة الخاطئة: ${ayahErrorCount}/3`;
              ui.quranDisplay.classList.add('recitation-error');
              setTimeout(() => {
                ui.quranDisplay.classList.remove('recitation-error');
              }, 1000);
            }
          }
          ui.speechResult.classList.add('show');
        }
      }
    }
  });

  window.addEventListener('recordingready', (e) => {
    const { blob, surahId, ayahId, detectedText, score } = e.detail;
    
    // Update play button only if the recording belongs to the currently displayed Ayah
    if (AppState.current.surah.id === surahId && AppState.current.ayah.id === ayahId) {
      currentRecordedBlob = blob;
      ui.btnPlayRecording.disabled = false;
      ui.btnPlayRecording.style.opacity = '1';
      ui.btnPlayRecording.style.color = '#0ea5e9';
    }

    // Mark or unmark as mastered based on score (>= 78%)
    if (score >= 0.78) {
      markAyahAsMastered(surahId, ayahId);
    } else {
      markAyahAsUnmastered(surahId, ayahId);
    }
    
    ui.speechResult.textContent = 'تم تسجيل تلاوتك وحفظها وإرسالها للمعلم تلقائياً! ✔️';
    ui.speechResult.classList.add('show');
    setTimeout(() => ui.speechResult.classList.remove('show'), 3500);

    // Convert Blob to Base64 and automatically add/replace report for teacher
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
      const audioBase64 = reader.result;
      const surahName = surahsData.find(s => s.id === surahId)?.name || AppState.current.surah.name;
      
      const report = {
        id: Date.now(),
        timestamp: Date.now(),
        surahId: surahId,
        surahName: surahName,
        ayahNumber: ayahId,
        text: detectedText || 'تم تسجيل الصوت لتسميعه للمعلم',
        score: score || 0,
        audioBase64: audioBase64
      };
      
      // Filter out existing report for same ayah in same surah (replacing old recording)
      const otherReports = AppState.reports.filter(r => 
        !(r.surahId === report.surahId && r.ayahNumber === report.ayahNumber)
      );
      
      AppState.reports = [...otherReports, report];
    };
  });

  let currentPlayingSource = null;
  let currentPlayingCtx = null;

  ui.btnPlayRecording.addEventListener('click', () => {
    if (!currentRecordedBlob) return;
    
    // Stop any playing reciter audio
    if (AppState.player.isPlaying) {
      ui.audio.pause();
      AppState.player.isPlaying = false;
    }

    // Stop current Web Audio playback if active
    if (currentPlayingSource) {
      currentPlayingSource.stop();
      currentPlayingSource = null;
      if (currentPlayingCtx) {
        currentPlayingCtx.close();
        currentPlayingCtx = null;
      }
      ui.btnPlayRecording.style.color = '';
      return;
    }

    // Stop simple audio playback if active
    if (currentPlayingRecording) {
      currentPlayingRecording.pause();
      currentPlayingRecording = null;
      ui.btnPlayRecording.style.color = '';
      return;
    }

    if (AppState.speech.liveEchoEnabled) {
      // Play with Mosque Echo
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      currentPlayingCtx = new AudioContextClass();
      
      const reader = new FileReader();
      reader.onload = async function() {
        try {
          if (!currentPlayingCtx) return;
          const buffer = await currentPlayingCtx.decodeAudioData(reader.result);
          currentPlayingSource = currentPlayingCtx.createBufferSource();
          currentPlayingSource.buffer = buffer;
          
          const dryNode = currentPlayingCtx.createGain();
          const wetNode = currentPlayingCtx.createGain();
          
          const delay1 = currentPlayingCtx.createDelay(1.0);
          const delay2 = currentPlayingCtx.createDelay(1.0);
          const feedback1 = currentPlayingCtx.createGain();
          const feedback2 = currentPlayingCtx.createGain();
          
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
          
          currentPlayingSource.connect(dryNode);
          dryNode.connect(currentPlayingCtx.destination);
          
          currentPlayingSource.connect(delay1);
          currentPlayingSource.connect(delay2);
          
          delay1.connect(wetNode);
          delay2.connect(wetNode);
          wetNode.connect(currentPlayingCtx.destination);
          
          currentPlayingSource.start(0);
          ui.btnPlayRecording.style.color = 'var(--accent-primary)';
          
          currentPlayingSource.onended = () => {
            ui.btnPlayRecording.style.color = '';
            currentPlayingSource = null;
            if (currentPlayingCtx) {
              currentPlayingCtx.close();
              currentPlayingCtx = null;
            }
          };
        } catch (e) {
          console.error("Decoding audio failed", e);
        }
      };
      reader.readAsArrayBuffer(currentRecordedBlob);
    } else {
      // Play naturally
      const url = URL.createObjectURL(currentRecordedBlob);
      currentPlayingRecording = new Audio(url);
      ui.btnPlayRecording.style.color = 'var(--accent-primary)';
      
      currentPlayingRecording.play().catch(err => {
        console.error("Playback failed", err);
      });

      currentPlayingRecording.onended = () => {
        ui.btnPlayRecording.style.color = '';
        currentPlayingRecording = null;
      };
    }
  });

  window.addEventListener('speechend', (e) => {
    if (isRecitationTransitioning) return;
    // If Hide Text mode is active, and they were reciting, but they didn't match the current ayah perfectly
    if (AppState.settings.hideTextMode && !correctTransitionTimeout) {
      const score = AppState.speech.latestScore || 0;
      const text = AppState.speech.detectedText || '';
      const referenceText = AppState.current.ayah.text || '';
      
      const spokenWordsCount = text.trim().split(/\s+/).filter(Boolean).length;
      const refWordsCount = referenceText.trim().split(/\s+/).filter(Boolean).length;
      const isCorrect = score >= 0.78;

      if (!isCorrect && text) {
        ayahErrorCount++;
        
        // Mark as unmastered because there's an active error in recitation
        markAyahAsUnmastered(AppState.current.surah.id, AppState.current.ayah.id);
        
        const isChildMode = document.body.classList.contains('theme-child');
        
        if (isChildMode) {
          playChildOopsSound();
          ui.quranDisplay.classList.add('recitation-error');
          setTimeout(() => ui.quranDisplay.classList.remove('recitation-error'), 1000);

          const encouragements = [
            '💫🦁 <strong>لا بأس يا بطل!</strong> حاول مرة أخرى بصوتك الجميل وسوف تنجح بالتأكيد...',
            '🦄🌸 <strong>حاولة رائعة!</strong> أنت قريب جداً، أعد المحاولة يا ذكي...',
            '🎈❤️ <strong>أنت شجاع وتستطيع فعلها!</strong> ركز جيداً وأعد قراءتها...'
          ];
          ui.speechResult.innerHTML = encouragements[Math.floor(Math.random() * encouragements.length)];
        } else {
          if (ayahErrorCount >= 3) {
            highlightMistakes(text, referenceText);
            ui.speechResult.innerHTML = '⚠️ <strong>تحليل التسميع (أخطاء الحفظ والتجويد):</strong> تم تلوين الكلمات لمساعدتك لتصحيح التلاوة:<br>' +
              '<span style="color: #22c55e; font-weight: bold; margin: 0 5px;">🟢 صحيح</span> | ' +
              '<span style="color: #f97316; font-weight: bold; margin: 0 5px;">🟠 خطأ نطق/تجويد</span> | ' +
              '<span style="color: #ef4444; font-weight: bold; margin: 0 5px;">🔴 خطأ حفظ (نسيان)</span>';
          } else {
            ui.speechResult.innerHTML = `⚠️ <strong>تنبيه:</strong> تلاوتك غير مطابقة بالكامل. المحاولة الخاطئة: ${ayahErrorCount}/3`;
            ui.quranDisplay.classList.add('recitation-error');
            setTimeout(() => {
              ui.quranDisplay.classList.remove('recitation-error');
            }, 1000);
          }
        }
        ui.speechResult.classList.add('show');
      } else {
        ui.speechResult.classList.remove('show');
      }
    } else {
      ui.speechResult.classList.remove('show');
    }
  });

  // Tour setup
  tour.defineSteps([
    { target: '.logo', title: 'مرحباً بك في محفّظ! 📖', description: 'التطبيق الذكي التفاعلي لمساعدتك ومساعدة أطفالك على حفظ وتدبر القرآن الكريم بأساليب مبتكرة.' },
    { target: '.selectors-card', title: 'إعدادات التلاوة والقراء 👤', description: 'اختر قارئك المفضل من بين كبار القراء، وابحث عن السورة والآية المحددة التي تود البدء بحفظها أو الاستماع إليها.' },
    { target: '#btn-ayah-info', title: 'تفسير وترجمة الآية ℹ️', description: 'اضغط على أيقونة (i) في أعلى المربع لعرض التفسير الميسر والترجمة الإنجليزية للآية الحالية في أي وقت.' },
    { target: '#quran-container', title: 'لوحة عرض الآية المصحفية 🕌', description: 'تُعرض الآيات بخط عثماني واضح مع تظليل متزامن للكلمات (كاريوكي) ورقم الآية المصحفي لتسهيل الحفظ البصري.' },
    { target: '#btn-toggle-text-minimal', title: 'وضع التسميع الغيبي 👁️', description: 'اضغط على العين لإخفاء نص الآية تماماً لتسميعها غيبياً، وبمجرد نجاحك سيتم كشف الكلمات تلقائياً!' },
    { target: '#btn-play-pause', title: 'مشغل التلاوة الصوتية ▶️', description: 'اضغط هنا للاستماع لتلاوة الآية الحالية بصوت الشيخ المختار لتصحيح النطق ومحاكاة التلاوة.' },
    { target: '#btn-repeat', title: 'تكرار الآية تلقائياً 🔁', description: 'فعل هذا الخيار لتكرار تلاوة الآية الحالية بشكل مستمر دون توقف، وهو أمر أساسي لتثبيت الحفظ في الذهن.' },
    { target: '#btn-mic', title: 'بدء التسميع الصوتي 🎤', description: 'اضغط هنا وتحدث لتسميع الآية. سيقوم التطبيق بذكاء بتقييم حفظك ونطقك وتلوين الكلمات (أخضر للصحيح، برتقالي للتجويد، أحمر للنسيان).' },
    { target: '#chk-live-echo', title: 'صدى الصوت (صدى المسجد) 📻', description: 'فعل خيار (صدى) للاستماع لتلاوتك الذاتية بصدى صوتي رائع ومؤثر يحاكي مساجد التلاوة ومكبرات الصوت.' },
    { target: '#btn-switch-role', title: 'نظام المعلم والتسميعات 👥', description: 'اضغط هنا لتبديل حسابك إلى لوحة المعلم لمراجعة تسميعات الطلاب وتقييمها، أو لإرسال تلاوتك لمعلمك الخاص.' },
    { target: '#btn-child-mode', title: 'وضع الأطفال والتحفيز 🧒🎈', description: 'يحول التطبيق إلى واجهة ذات ألوان مبهجة وتأثيرات بصرية جذابة مع نجوم متحركة (⭐) لتشجيع الأطفال وتكريمهم عند التسميع الصحيح.' },
    { target: '#btn-more-menu', title: 'المزيد من الأدوات (وضع الاستماع) ⚙️', description: 'اضغط هنا لفتح خيارات إضافية مثل (وضع الاستماع المتتالي لآيات وسور متعددة)، دعم التطبيق، وتحديث الكاش.' }
  ]);

  // btnTour listener is defined below in the helper setup

  // --- Teacher System Logic ---
  
  function renderTeacherReports() {
    ui.teacherReportsList.innerHTML = '';
    const reports = AppState.reports;
    const currentSurahId = AppState.current.surah.id;
    
    // Filter reports by the currently open Surah
    const filtered = reports.filter(r => r.surahId === currentSurahId);
    
    if (filtered.length === 0) {
      ui.teacherReportsList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); margin: 30px 0; font-family: var(--font-arabic);">لا توجد تسجيلات مرسلة لهذه السورة بعد. ابدأ بالتسجيل لتظهر هنا.</p>';
      return;
    }
    
    // Sort by ayah number ascending (Ayah 1 at top)
    const sorted = [...filtered].sort((a, b) => a.ayahNumber - b.ayahNumber);
    
    sorted.forEach(report => {
      const card = document.createElement('div');
      card.className = 'report-card';
      
      const audioHtml = report.audioBase64 ? `<div class="report-audio"><audio src="${report.audioBase64}" controls></audio></div>` : '<p>لا يوجد تسجيل صوتي.</p>';
      
      card.innerHTML = `
        <div class="report-header">
          <span>${report.surahName} - آية ${report.ayahNumber}</span>
          <span class="report-score" style="background-color: #0ea5e9; color: #fff; font-weight: bold; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem;">تم التسميع</span>
        </div>
        <div class="report-text" style="color: var(--text-secondary); font-style: italic;">"${report.text}"</div>
        ${audioHtml}
        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">
          التاريخ: ${new Date(report.timestamp).toLocaleString()}
        </div>
        <div class="report-actions">
          <a href="${report.audioBase64}" download="سورة_${report.surahName}_آية_${report.ayahNumber}.webm" class="report-action-btn download-btn" title="تنزيل التسجيل">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span>تنزيل</span>
          </a>
          <button class="report-action-btn edit-btn" data-ayah="${report.ayahNumber}" title="تعديل التسجيل">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            <span>تعديل</span>
          </button>
          <button class="report-action-btn delete-btn" data-ayah="${report.ayahNumber}" data-surah="${report.surahId}" title="حذف التسجيل">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            <span>حذف</span>
          </button>
        </div>
      `;
      ui.teacherReportsList.appendChild(card);
    });
  }

  // Register event delegation click listener for report action buttons
  ui.teacherReportsList.addEventListener('click', (e) => {
    const targetBtn = e.target.closest('.report-action-btn');
    if (!targetBtn) return;
    
    const ayahNum = parseInt(targetBtn.getAttribute('data-ayah'));
    
    if (targetBtn.classList.contains('edit-btn')) {
      // Edit: Close dashboard, load selected Ayah to allow user to record over it
      ui.modalOverlay.style.display = 'none';
      ui.teacherModal.style.display = 'none';
      AppState.userRole = 'student';
      loadAyah(ayahNum);
    } else if (targetBtn.classList.contains('delete-btn')) {
      const surahId = parseInt(targetBtn.getAttribute('data-surah'));
      if (confirm("هل أنت متأكد من رغبتك في حذف هذا التسجيل؟")) {
        DbManager.deleteAudioRecording(surahId, ayahNum).then(() => {
          AppState.reports = AppState.reports.filter(r => !(r.surahId === surahId && r.ayahNumber === ayahNum));
          
          if (AppState.current.surah.id === surahId && AppState.current.ayah.id === ayahNum) {
            currentRecordedBlob = null;
            ui.btnPlayRecording.disabled = true;
            ui.btnPlayRecording.style.opacity = '0.5';
            ui.btnPlayRecording.style.color = '';
          }
          renderTeacherReports();
        }).catch(err => console.error("حذف التسجيل فشل:", err));
      }
    }
  });

  ui.btnSwitchRole.addEventListener('click', () => {
    if (AppState.userRole === 'student') {
      AppState.userRole = 'teacher';
      ui.modalOverlay.style.display = 'block';
      ui.teacherModal.style.display = 'flex';
      renderTeacherReports();
    } else {
      AppState.userRole = 'student';
      ui.modalOverlay.style.display = 'none';
      ui.teacherModal.style.display = 'none';
    }
  });

  ui.btnCloseTeacher.addEventListener('click', () => {
    AppState.userRole = 'student';
    ui.modalOverlay.style.display = 'none';
    ui.teacherModal.style.display = 'none';
  });

  if (ui.modalOverlay) {
    ui.modalOverlay.addEventListener('click', () => {
      if (ui.teacherModal) ui.teacherModal.style.display = 'none';
      if (ui.listeningModal) ui.listeningModal.style.display = 'none';
      if (ui.modalDonate) ui.modalDonate.style.display = 'none';
      if (ui.modalShare) ui.modalShare.style.display = 'none';
      if (ui.modalTafsir) ui.modalTafsir.style.display = 'none';
      if (ui.modalHelp) ui.modalHelp.style.display = 'none';
      ui.modalOverlay.style.display = 'none';
      AppState.userRole = 'student';
    });
  }

  // Help & Guide Modal Logic
  if (ui.btnTour && ui.modalHelp) {
    ui.btnTour.addEventListener('click', () => {
      if (ui.headerMoreDropdown) ui.headerMoreDropdown.classList.remove('show');
      activateHelpTab('features');
      ui.modalOverlay.style.display = 'block';
      ui.modalHelp.style.display = 'flex';
    });
  }

  if (ui.btnCloseHelp) {
    ui.btnCloseHelp.addEventListener('click', () => {
      ui.modalHelp.style.display = 'none';
      ui.modalOverlay.style.display = 'none';
    });
  }

  function activateHelpTab(tabName) {
    if (tabName === 'features') {
      if (ui.tabHelpFeatures) {
        ui.tabHelpFeatures.style.borderBottom = '3px solid var(--accent-primary)';
        ui.tabHelpFeatures.style.fontWeight = '700';
        ui.tabHelpFeatures.style.color = 'var(--text-primary)';
      }
      if (ui.tabHelpTour) {
        ui.tabHelpTour.style.borderBottom = '3px solid transparent';
        ui.tabHelpTour.style.fontWeight = '500';
        ui.tabHelpTour.style.color = 'var(--text-secondary)';
      }
      if (ui.helpContentFeatures) ui.helpContentFeatures.style.display = 'flex';
      if (ui.helpContentTour) ui.helpContentTour.style.display = 'none';
    } else {
      if (ui.tabHelpTour) {
        ui.tabHelpTour.style.borderBottom = '3px solid var(--accent-primary)';
        ui.tabHelpTour.style.fontWeight = '700';
        ui.tabHelpTour.style.color = 'var(--text-primary)';
      }
      if (ui.tabHelpFeatures) {
        ui.tabHelpFeatures.style.borderBottom = '3px solid transparent';
        ui.tabHelpFeatures.style.fontWeight = '500';
        ui.tabHelpFeatures.style.color = 'var(--text-secondary)';
      }
      if (ui.helpContentTour) ui.helpContentTour.style.display = 'flex';
      if (ui.helpContentFeatures) ui.helpContentFeatures.style.display = 'none';
    }
  }

  if (ui.tabHelpFeatures) {
    ui.tabHelpFeatures.addEventListener('click', () => activateHelpTab('features'));
  }
  if (ui.tabHelpTour) {
    ui.tabHelpTour.addEventListener('click', () => activateHelpTab('tour'));
  }

  if (ui.btnStartInteractiveTour) {
    ui.btnStartInteractiveTour.addEventListener('click', () => {
      ui.modalHelp.style.display = 'none';
      ui.modalOverlay.style.display = 'none';
      setTimeout(() => {
        tour.start();
      }, 300);
    });
  }

  // Child Mode Toggle
  if (ui.btnChildMode) {
    if (document.body.classList.contains('theme-child')) {
      ui.btnChildMode.style.color = 'var(--accent-primary)';
    }

    ui.btnChildMode.addEventListener('click', () => {
      document.body.classList.toggle('theme-child');
      
      const isChildMode = document.body.classList.contains('theme-child');
      AppState.settings.childMode = isChildMode;
      if (isChildMode) {
        ui.btnChildMode.style.color = 'var(--accent-primary)';
      } else {
        ui.btnChildMode.style.color = '';
      }
      
      trackAnalyticsEvent('toggle_child_mode', { enabled: isChildMode });
    });
  }

  // --- ميزة إخفاء الآيات للتسميع الغيبي ---
  let isTextHidden = savedState?.settings?.hideTextMode || false;

  const applyTextVisibility = () => {
    let styleTag = document.getElementById('hide-text-style-rule');
    if (isTextHidden) {
      if (ui.btnToggleTextMinimal) {
        ui.btnToggleTextMinimal.classList.add('active');
        if (ui.eyeIconOpen) ui.eyeIconOpen.style.display = 'none';
        if (ui.eyeIconClosed) ui.eyeIconClosed.style.display = 'block';
      }
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'hide-text-style-rule';
        styleTag.innerHTML = `
          #current-ayah-display .word { display: none !important; }
          #tafsir-display, #translation-display { display: none !important; }
        `;
        document.head.appendChild(styleTag);
      }
    } else {
      if (ui.btnToggleTextMinimal) {
        ui.btnToggleTextMinimal.classList.remove('active');
        if (ui.eyeIconOpen) ui.eyeIconOpen.style.display = 'block';
        if (ui.eyeIconClosed) ui.eyeIconClosed.style.display = 'none';
      }
      if (styleTag) styleTag.remove();
      // Ensure the display is cleared from reveal class
      if (ui.quranDisplay) ui.quranDisplay.classList.remove('reveal-words');
    }
    AppState.settings.hideTextMode = isTextHidden;
    window.storageManager.save('quran_app_state', AppState);
  };

  if (ui.btnToggleTextMinimal) {
    ui.btnToggleTextMinimal.addEventListener('click', () => {
      isTextHidden = !isTextHidden;
      applyTextVisibility();
      if (!isTextHidden) {
        if (correctTransitionTimeout) {
          clearTimeout(correctTransitionTimeout);
          correctTransitionTimeout = null;
        }
        ayahErrorCount = 0;
        // Reload current ayah to clear any red/green highlights
        loadAyah(AppState.current.ayah.id);
      }
    });
  }

  applyTextVisibility();

  // --- القائمة المنسدلة للإعدادات (Settings Dropdown Menu) ---
  if (ui.btnMoreMenu && ui.headerMoreDropdown) {
    ui.btnMoreMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      ui.headerMoreDropdown.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      if (!ui.btnMoreMenu.parentElement.contains(e.target)) {
        ui.headerMoreDropdown.classList.remove('show');
      }
    });
  }

  // Dynamically update the repeat Surah selection dropdown based on checked Surahs
  function updateRepeatDropdown() {
    ui.listeningRepeatSelect.innerHTML = '';
    const checkedBoxes = Array.from(document.querySelectorAll('.listening-surah-chk:checked'));
    
    if (checkedBoxes.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'يرجى اختيار السور أولاً';
      opt.disabled = true;
      ui.listeningRepeatSelect.appendChild(opt);
      return;
    }
    
    checkedBoxes.forEach(cb => {
      const id = parseInt(cb.value);
      const sData = surahsData.find(s => s.id === id);
      if (sData) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = sData.name;
        ui.listeningRepeatSelect.appendChild(opt);
      }
    });
  }

  // Populate the surahs checklist inside the modal
  surahsData.forEach(s => {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '8px';
    label.style.cursor = 'pointer';
    label.style.fontSize = '0.9rem';
    
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.value = s.id;
    chk.className = 'listening-surah-chk';
    if (s.id == AppState.current.surah.id) {
      chk.checked = true;
    }
    
    chk.addEventListener('change', updateRepeatDropdown);
    
    label.appendChild(chk);
    label.appendChild(document.createTextNode(s.name));
    ui.listeningSurahsList.appendChild(label);
  });

  updateRepeatDropdown();

  ui.chkRepeatSurah.addEventListener('change', (e) => {
    ui.listeningRepeatContainer.style.display = e.target.checked ? 'block' : 'none';
  });

  const txtSearchSurahs = document.getElementById('txt-search-listening-surahs');
  if (txtSearchSurahs) {
    txtSearchSurahs.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      const labels = ui.listeningSurahsList.querySelectorAll('label');
      labels.forEach(label => {
        const text = label.textContent.toLowerCase();
        if (text.includes(query)) {
          label.style.display = 'flex';
        } else {
          label.style.display = 'none';
        }
      });
    });
  }

  // Listening Mode Trigger Modal
  if (ui.btnListening) {
    ui.btnListening.addEventListener('click', () => {
      if (document.body.classList.contains('theme-listening')) {
        document.body.classList.remove('theme-listening');
        ui.btnListening.style.color = '';
        listeningPlaylist = [];
        repeatSurahId = null;
        AppState.player.isPlaying = false;
        ui.audio.pause();
      } else {
        if (txtSearchSurahs) {
          txtSearchSurahs.value = '';
          const labels = ui.listeningSurahsList.querySelectorAll('label');
          labels.forEach(l => l.style.display = 'flex');
        }
        ui.modalOverlay.style.display = 'block';
        ui.listeningModal.style.display = 'flex';
      }
    });
  }

  if (ui.chkLiveEcho) {
    ui.chkLiveEcho.addEventListener('change', (e) => {
      AppState.speech.liveEchoEnabled = e.target.checked;
      if (e.target.checked) {
        if (ui.btnEcho) ui.btnEcho.style.color = 'var(--accent-primary)';
      } else {
        if (ui.btnEcho) ui.btnEcho.style.color = '';
      }
    });
  }

  // Live Mosque Echo Toggle listener
  if (ui.btnEcho) {
    ui.btnEcho.addEventListener('click', () => {
      AppState.speech.liveEchoEnabled = !AppState.speech.liveEchoEnabled;
      if (ui.chkLiveEcho) {
        ui.chkLiveEcho.checked = AppState.speech.liveEchoEnabled;
      }
      if (AppState.speech.liveEchoEnabled) {
        ui.btnEcho.style.color = 'var(--accent-primary)';
        ui.speechResult.textContent = 'تم تفعيل تأثير صدى المسجد للتسميع.';
        ui.speechResult.classList.add('show');
        setTimeout(() => ui.speechResult.classList.remove('show'), 2500);
      } else {
        ui.btnEcho.style.color = '';
        ui.speechResult.textContent = 'تم إيقاف صدى المسجد للتسميع (صوت طبيعي).';
        ui.speechResult.classList.add('show');
        setTimeout(() => ui.speechResult.classList.remove('show'), 2000);
      }
    });
  }

  if (ui.btnCloseListening) {
    ui.btnCloseListening.addEventListener('click', () => {
      ui.modalOverlay.style.display = 'none';
      ui.listeningModal.style.display = 'none';
    });
  }

  if (ui.btnStartListeningMode) {
    ui.btnStartListeningMode.addEventListener('click', () => {
      const checkedBoxes = document.querySelectorAll('.listening-surah-chk:checked');
      if (checkedBoxes.length === 0) {
        alert("يرجى اختيار سورة واحدة على الأقل للاستماع.");
        return;
      }

      listeningPlaylist = Array.from(checkedBoxes).map(cb => parseInt(cb.value));
      currentPlaylistIndex = 0;

      if (ui.chkRepeatSurah.checked) {
        repeatSurahId = parseInt(ui.listeningRepeatSelect.value);
      } else {
        repeatSurahId = null;
      }

      ui.modalOverlay.style.display = 'none';
      ui.listeningModal.style.display = 'none';

      document.body.classList.add('theme-listening');
      ui.btnListening.style.color = 'var(--accent-primary)';

      loadSurah(listeningPlaylist[0]).then(() => {
        AppState.player.isPlaying = true;
        ui.audio.play().catch(e => {});
      });
    });
  }

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => {
      AppState.player.isPlaying = true;
      ui.audio.play();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      AppState.player.isPlaying = false;
      ui.audio.pause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      const prev = parseInt(AppState.current.ayah.id) - 1;
      if (prev >= 1) {
        isTransitioning = true;
        if (speechEngine.isRecording) {
          transitionToAyahWithRecording(prev);
        } else {
          loadAyah(prev);
        }
      }
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      const next = parseInt(AppState.current.ayah.id) + 1;
      if (next <= AppState.current.surah.ayahCount) {
        isTransitioning = true;
        if (speechEngine.isRecording) {
          transitionToAyahWithRecording(next);
        } else {
          loadAyah(next);
        }
      }
    });
  }

  // PWA Install Logic
  let deferredPrompt;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (!isStandalone) {
    if (ui.btnInstall) {
      ui.btnInstall.style.display = 'inline-flex';
    }
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (ui.btnInstall) {
      ui.btnInstall.style.display = 'inline-flex';
    }
  });

  if (ui.btnInstall) {
    ui.btnInstall.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          ui.btnInstall.style.display = 'none';
        }
        deferredPrompt = null;
      } else {
        alert("تثبيت التطبيق على هاتف الذكي:\n\n• للآيفون (iOS): اضغط على زر مشاركة في متصفح Safari ثم اختر 'إضافة إلى الصفحة الرئيسية' (Add to Home Screen).\n\n• للأندرويد: اضغط على نقاط القائمة الجانبية للمتصفح ثم اختر 'تثبيت التطبيق' (Install App).");
      }
    });
  }

  // Force Update Button - clears all caches and reloads
  if (ui.btnForceUpdate) {
    ui.btnForceUpdate.addEventListener('click', async () => {
      if (confirm('سيتم تفريغ جميع الملفات المؤقتة وإعادة تحميل التطبيق بأحدث نسخة. هل تريد المتابعة؟')) {
        try {
          // 1. Delete all caches
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
          
          // 2. Unregister all service workers
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(reg => reg.unregister()));
          
          // 3. Hard reload
          window.location.reload(true);
        } catch (err) {
          console.error('Force update error:', err);
          window.location.reload(true);
        }
      }
    });
  }

  if (ui.btnDonate) {
    ui.btnDonate.addEventListener('click', () => {
      if (ui.modalOverlay) ui.modalOverlay.style.display = 'block';
      if (ui.modalDonate) ui.modalDonate.style.display = 'flex';
    });
  }

  if (ui.btnCloseDonate) {
    ui.btnCloseDonate.addEventListener('click', () => {
      if (ui.modalOverlay) ui.modalOverlay.style.display = 'none';
      if (ui.modalDonate) ui.modalDonate.style.display = 'none';
    });
  }

  if (ui.btnCopyWallet) {
    ui.btnCopyWallet.addEventListener('click', () => {
      const phoneNumber = '+201143888355';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(phoneNumber).then(showToast).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
      
      function fallbackCopy() {
        const textArea = document.createElement('textarea');
        textArea.value = phoneNumber;
        textArea.style.position = 'fixed';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          showToast();
        } catch (err) {
          console.warn('Fallback copy failed', err);
        }
        document.body.removeChild(textArea);
      }
      
      function showToast() {
        if (ui.donateToast) {
          ui.donateToast.classList.add('show');
          setTimeout(() => {
            ui.donateToast.classList.remove('show');
          }, 2500);
        }
      }
    });
  }

  // Share & QR Modal Event Listeners
  if (ui.btnShare) {
    ui.btnShare.addEventListener('click', () => {
      if (ui.modalOverlay) ui.modalOverlay.style.display = 'block';
      if (ui.modalShare) ui.modalShare.style.display = 'flex';
      
      // Check for Web Share API support dynamically
      if (navigator.share && ui.btnNativeShare) {
        ui.btnNativeShare.style.display = 'flex';
      }
    });
  }

  if (ui.btnCloseShare) {
    ui.btnCloseShare.addEventListener('click', () => {
      if (ui.modalOverlay) ui.modalOverlay.style.display = 'none';
      if (ui.modalShare) ui.modalShare.style.display = 'none';
    });
  }

  if (ui.btnCopyLink) {
    ui.btnCopyLink.addEventListener('click', () => {
      const shareUrl = 'https://islamitech.github.io/quran_memorizer/';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).then(showShareToast).catch(fallbackShareCopy);
      } else {
        fallbackShareCopy();
      }
      
      function fallbackShareCopy() {
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        textArea.style.position = 'fixed';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          showShareToast();
        } catch (err) {
          console.warn('Fallback share copy failed', err);
        }
        document.body.removeChild(textArea);
      }
      
      function showShareToast() {
        if (ui.shareToast) {
          ui.shareToast.classList.add('show');
          setTimeout(() => {
            ui.shareToast.classList.remove('show');
          }, 2500);
        }
      }
    });
  }

  if (ui.btnNativeShare) {
    ui.btnNativeShare.addEventListener('click', () => {
      if (navigator.share) {
        navigator.share({
          title: 'محفّظ القرآن الكريم 📖',
          text: 'رفيقك التفاعلي الذكي لحفظ وتلاوة القرآن الكريم بسهولة ودون إنترنت!',
          url: 'https://islamitech.github.io/quran_memorizer/'
        }).catch(err => console.log('Share canceled or failed', err));
      }
    });
  }

  checkOfflineStatusAndAlert();
  loadSurah(AppState.current.surah.id);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}