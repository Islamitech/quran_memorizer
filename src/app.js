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
    tafsirDisplay: document.getElementById('tafsir-display'),
    translationDisplay: document.getElementById('translation-display'),
    btnViewQuran: document.getElementById('btn-view-quran'),
    btnViewTafsir: document.getElementById('btn-view-tafsir'),
    btnViewTranslation: document.getElementById('btn-view-translation'),
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
    shareToast: document.getElementById('share-toast')
  };

  karaokeEngine.init(ui.audio, ui.quranDisplay);
  let currentRecordedBlob = null;
  let listeningPlaylist = [];
  let currentPlaylistIndex = 0;
  let repeatSurahId = null;
  let currentPlayingRecording = null;
  let isTransitioning = false;

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
    {id:1,name:'الفاتحة'},{id:2,name:'البقرة'},{id:3,name:'آل عمران'},{id:4,name:'النساء'},{id:5,name:'المائدة'},{id:6,name:'الأنعام'},{id:7,name:'الأعراف'},{id:8,name:'الأنفال'},{id:9,name:'التوبة'},{id:10,name:'يونس'},{id:11,name:'هود'},{id:12,name:'يوسف'},{id:13,name:'الرعد'},{id:14,name:'إبراهيم'},{id:15,name:'الحجر'},{id:16,name:'النحل'},{id:17,name:'الإسراء'},{id:18,name:'الكهف'},{id:19,name:'مريم'},{id:20,name:'طه'},{id:21,name:'الأنبياء'},{id:22,name:'الحج'},{id:23,name:'المؤمنون'},{id:24,name:'النور'},{id:25,name:'الفرقان'},{id:26,name:'الشعراء'},{id:27,name:'النمل'},{id:28,name:'القصص'},{id:29,name:'العنكبوت'},{id:30,name:'الروم'},{id:31,name:'لقمان'},{id:32,name:'السجدة'},{id:33,name:'الأحزاب'},{id:34,name:'سبأ'},{id:35,name:'فاطر'},{id:36,name:'يس'},{id:37,name:'الصافات'},{id:38,name:'ص'},{id:39,name:'الزمر'},{id:40,name:'غافر'},{id:41,name:'فصلت'},{id:42,name(--الشورى--)},{id:43,name:'الزخرف'},{id:44,name:'الدخان'},{id:45,name:'الجاثية'},{id:46,name:'الأحقاف'},{id:47,name:'محمد'},{id:48,name:'الفتح'},{id:49,name:'الحجرات'},{id:50,name:'ق'},{id:51,name:'الذاريات'},{id:52,name:'الطور'},{id:53,name:'النجم'},{id:54,name:'القمر'},{id:55,name:'الرحمن'},{id:56,name:'الواقعة'},{id:57,name:'الحديد'},{id:58,name:'المجادلة'},{id:59,name:'الحشر'},{id:60,name:'الممتحنة'},{id:61,name:'الصف'},{id:62,name:'الجمعة'},{id:63,name:'المنافقون'},{id:64,name:'التغابن'},{id:65,name:'الطلاق'},{id:66,name:'التحريم'},{id:67,name:'الملك'},{id:68,name:'القلم'},{id:69,name:'الحاقة'},{id:70,name:'المعارج'},{id:71,name:'نوح'},{id:72,name:'الجن'},{id:73,name:'المزمل'},{id:74,name:'المدثر'},{id:75,name:'القيامة'},{id:76,name:'الإنسان'},{id:77,name:'المرسلات'},{id:78,name:'النبأ'},{id:79,name:'النازعات'},{id:80,name:'عبس'},{id:81,name:'التكوير'},{id:82,name:'Organfatar'},{id:83,name:'المطففين'},{id:84,name:'الانشقاق'},{id:85,name:'البروج'},{id:86,name:'الطارق'},{id:87,name:'الأعلى'},{id:88,name:'الغاشية'},{id:89,name:'الفجر'},{id:90,name:'البلد'},{id:91,name:'الشمس'},{id:92,name:'الليل'},{id:93,name:'الضحى'},{id:94,name:'الشرح'},{id:95,name:'التين'},{id:96,name:'العلق'},{id:97,name:'القدر'},{id:98,name:'البينة'},{id:99,name:'الزلزلة'},{id:100,name:'العاديات'},{id:101,name:'القارعة'},{id:102,name:'التكاثر'},{id:103,name:'العصر'},{id:104,name:'الهمزة'},{id:105,name:'الفيل'},{id:106,name:'قريش'},{id:107,name:'الماعون'},{id:108,name:'الكوثر'},{id:109,name:'الكافرون'},{id:110,name:'النصر'},{id:111,name:'المسد'},{id:112,name:'الإخلاص'},{id:113,name:'الفلق'},{id:114,name:'الناس'}
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

  // View Toggles Logic
  function updateViewMode(mode) {
    ui.btnViewQuran.classList.toggle('active', mode === 'quran');
    ui.btnViewTafsir.classList.toggle('active', mode === 'tafsir');
    ui.btnViewTranslation.classList.toggle('active', mode === 'translation');
    
    if (mode === 'quran') {
      ui.tafsirDisplay.style.display = 'none';
      ui.translationDisplay.style.display = 'none';
    } else if (mode === 'tafsir') {
      ui.tafsirDisplay.style.display = 'block';
      ui.translationDisplay.style.display = 'none';
    } else if (mode === 'translation') {
      ui.tafsirDisplay.style.display = 'block';
      ui.translationDisplay.style.display = 'block';
    }
  }

  ui.btnViewQuran.addEventListener('click', () => updateViewMode('quran'));
  ui.btnViewTafsir.addEventListener('click', () => updateViewMode('tafsir'));
  ui.btnViewTranslation.addEventListener('click', () => updateViewMode('translation'));

  // Speech listeners & testing mode transitions
  let correctTransitionTimeout = null;

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

  window.addEventListener('speechresult', (e) => {
    const { text } = e.detail;
    AppState.speech.detectedText = text;
    
    // Calculate word match score against the current ayah text
    const referenceText = AppState.current.ayah.text || '';
    if (referenceText && text) {
      const score = speechEngine.matchAlgo.calculateMatchScore(text, referenceText);
      AppState.speech.latestScore = score;

      // Handle recitation testing mode (whole Surah recitation mode)
      if (AppState.settings.hideTextMode) {
        // If the score matches correctly (70% or more), reveal the ayah and auto-advance
        if (score >= 0.70 && !correctTransitionTimeout) {
          // 1. Reveal words of current active Ayah
          ui.quranDisplay.classList.add('reveal-words');
          ui.speechResult.innerHTML = '✔️ <strong>تسميع صحيح!</strong> نسبة المطابقة: ' + Math.round(score * 100) + '% - الانتقال للآية التالية...';
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
              ui.speechResult.innerHTML = '🎉 <strong>تهانينا!</strong> لقد أتممت تسميع السورة كاملة بنجاح!';
              ui.speechResult.classList.add('show');
              setTimeout(() => ui.speechResult.classList.remove('show'), 5000);
            }
          }, 1800);
        } 
        // If the user spoke a significant number of words, but match score is still low (Mistake/Block)
        else if (!correctTransitionTimeout) {
          const spokenWordsCount = text.trim().split(/\s+/).length;
          const refWordsCount = referenceText.trim().split(/\s+/).length;
          
          // Block and alert if they spoke a minimum threshold of words but similarity is poor
          if (spokenWordsCount >= Math.max(3, refWordsCount) && score < 0.50) {
            // Stop recording immediately to prevent further recording
            speechEngine.stop(false);
            
            // Show error message
            ui.speechResult.innerHTML = '⚠️ <strong>خطأ في التسميع:</strong> تلاوتك غير مطابقة للآية الحالية. تم إيقاف التسجيل للتصحيح.';
            ui.speechResult.classList.add('show');
            
            // Add shake/error class for visual feedback
            ui.quranDisplay.classList.add('recitation-error');
            setTimeout(() => {
              ui.quranDisplay.classList.remove('recitation-error');
            }, 1000);
          }
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
    // If Hide Text mode is active, and they were reciting, but they didn't match the current ayah
    if (AppState.settings.hideTextMode && !correctTransitionTimeout) {
      const score = AppState.speech.latestScore || 0;
      if (score < 0.70 && AppState.speech.detectedText) {
        ui.speechResult.innerHTML = '⚠️ <strong>تنبيه:</strong> لم يتم مطابقة التلاوة بنسبة كافية. يرجى مراجعة الحفظ وإعادة المحاولة.';
        ui.speechResult.classList.add('show');
        ui.quranDisplay.classList.add('recitation-error');
        setTimeout(() => {
          ui.quranDisplay.classList.remove('recitation-error');
        }, 1000);
      } else {
        ui.speechResult.classList.remove('show');
      }
    } else {
      ui.speechResult.classList.remove('show');
    }
  });

  // Tour setup
  tour.defineSteps([
    { target: '.logo', title: 'مرحباً بك في محفّظ! 📖', description: 'التطبيق الذكي المتكامل لمساعدتك ومساعدة أطفالك على حفظ وتدبر القرآن الكريم بأساليب تفاعلية فريدة.' },
    { target: '.selectors-card', title: 'إعدادات التلاوة والقراء 👤', description: 'اختر قارئك المفضل من بين كبار القراء، وابحث عن السورة والآية المحددة التي تود البدء بحفظها أو الاستماع إليها.' },
    { target: '#quran-container', title: 'لوحة عرض الآيات المصحفية 🕌', description: 'تُعرض الآيات بخط عثماني واضح مع تظليل متزامن للكلمات (كاريوكي) ورقم الآية المصحفي لمساعدتك على ترسيخ الحفظ البصري.' },
    { target: '#player-container', title: 'مشغل التلاوة والتكرار 🔁', description: 'يتحكم في تشغيل الصوت، مع ميزة التكرار المستمر للآية الحالية لتكرار المقطع المقروء وتثبيته دون عناء.' },
    { target: '.mic-control-group', title: 'تسجيل التسميع وصدى المسجد 🎤', description: 'اضغط على الميكروفون للتسميع بصوتك. كما يمكنك تفعيل خيار (صدى) للاستماع لتسجيلك بصدى المسجد الرائع، أو إرساله لمعلمك للتصحيح.' },
    { target: '#btn-listening', title: 'وضع الاستماع وقوائم التشغيل 🎧', description: 'انقر هنا لتحديد سور متعددة للاستماع إليها متتالية، مع ميزة البحث الذكي وتكرار سورة كاملة، مع إخفاء أدوات التسميع لتركيز أفضل.' },
    { target: '#btn-child-mode', title: 'وضع الأطفال والتحفيز 🧒🎈', description: 'يحول التطبيق إلى واجهة ذات ألوان مبهجة وتأثيرات بصرية جذابة مع نجوم متحركة (⭐) لتشجيع الأطفال وتكريمهم على الحفظ.' },
    { target: '.header-controls', title: 'التنزيل والتشغيل دون اتصال 📲', description: 'يمكنك تثبيت التطبيق مباشرة على هاتفك كـ Web App. كما يتم حفظ السور التي استمعت إليها تلقائياً لتتمكن من تشغيلها بالكامل دون اتصال بالإنترنت.' }
  ]);

  ui.btnTour.addEventListener('click', () => {
    tour.start();
  });

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
      ui.modalOverlay.style.display = 'none';
      AppState.userRole = 'student';
    });
  }

  // Tour setup listener
  if (ui.btnTour) {
    ui.btnTour.addEventListener('click', () => {
      tour.start();
    });
  }

  // Child Mode Toggle
  if (ui.btnChildMode) {
    ui.btnChildMode.addEventListener('click', () => {
      document.body.classList.toggle('theme-child');
      
      const isChildMode = document.body.classList.contains('theme-child');
      if (isChildMode) {
        ui.btnChildMode.style.color = 'var(--accent-primary)';
      } else {
        ui.btnChildMode.style.color = '';
      }
    });
  }

  // --- ميزة إخفاء الآيات للتسميع الغيبي ---
  const btnToggleText = document.createElement('button');
  btnToggleText.id = 'btn-toggle-text';
  btnToggleText.setAttribute('title', 'إخفاء نص الآية والاعتماد على السمع ورقم الآية فقط للتسميع الغيبي');
  
  btnToggleText.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 15px auto;
    padding: 10px 20px;
    background-color: var(--bg-card, #fff);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 30px;
    color: var(--text-primary, #1e293b);
    font-family: var(--font-arabic), sans-serif;
    font-size: 0.9rem;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  `;

  if (ui.quranDisplay) {
    ui.quranDisplay.parentElement.after(btnToggleText);
  }

  let isTextHidden = savedState?.settings?.hideTextMode || false;

  const applyTextVisibility = () => {
    let styleTag = document.getElementById('hide-text-style-rule');
    if (isTextHidden) {
      btnToggleText.innerHTML = '👁️ إظهار الآيات';
      btnToggleText.style.backgroundColor = 'var(--accent-primary, #0ea5e9)';
      btnToggleText.style.color = '#fff';
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
      btnToggleText.innerHTML = '👁️ إخفاء الآيات للتسميع';
      btnToggleText.style.backgroundColor = 'var(--bg-card, #fff)';
      btnToggleText.style.color = 'var(--text-primary, #1e293b)';
      if (styleTag) styleTag.remove();
      // Ensure the display is cleared from reveal class
      if (ui.quranDisplay) ui.quranDisplay.classList.remove('reveal-words');
    }
    AppState.settings.hideTextMode = isTextHidden;
    window.storageManager.save('quran_app_state', AppState);
  };

  btnToggleText.addEventListener('click', () => {
    isTextHidden = !isTextHidden;
    applyTextVisibility();
    if (!isTextHidden && correctTransitionTimeout) {
      clearTimeout(correctTransitionTimeout);
      correctTransitionTimeout = null;
    }
  });

  applyTextVisibility();

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