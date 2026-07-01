import { AppState, observer } from './core/State.js';
import { StorageManager } from './utils/StorageManager.js';
import { MemoryManager } from './utils/MemoryManager.js';
import { QuranAPIManager } from './api/QuranAPI.js';
import { KaraokeEngine } from './engines/KaraokeEngine.js';
import { SpeechEngine } from './engines/SpeechEngine.js';
import { InteractiveTour } from './components/InteractiveTour.js';

// Init core utils
window.storageManager = new StorageManager();
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
  }

  const ui = {
    audio: document.getElementById('audio-player'),
    playBtn: document.getElementById('btn-play-pause'),
    btnRepeat: document.getElementById('btn-repeat'),
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
    surahDatalist: document.getElementById('surah-list'),
    statMastered: document.getElementById('stat-mastered'),
    btnChildMode: document.getElementById('btn-child-mode'),
    btnEcho: document.getElementById('btn-echo'),
    btnListening: document.getElementById('btn-listening'),
    btnInstall: document.getElementById('btn-install'),
    tafsirDisplay: document.getElementById('tafsir-display'),
    translationDisplay: document.getElementById('translation-display'),
    btnViewQuran: document.getElementById('btn-view-quran'),
    btnViewTafsir: document.getElementById('btn-view-tafsir'),
    btnViewTranslation: document.getElementById('btn-view-translation')
  };

  karaokeEngine.init(ui.audio, ui.quranDisplay);

  const surahsData = [
    {id:1,name:'الفاتحة'},{id:2,name:'البقرة'},{id:3,name:'آل عمران'},{id:4,name:'النساء'},{id:5,name:'المائدة'},{id:6,name:'الأنعام'},{id:7,name:'الأعراف'},{id:8,name:'الأنفال'},{id:9,name:'التوبة'},{id:10,name:'يونس'},{id:11,name:'هود'},{id:12,name:'يوسف'},{id:13,name:'الرعد'},{id:14,name:'إبراهيم'},{id:15,name:'الحجر'},{id:16,name:'النحل'},{id:17,name:'الإسراء'},{id:18,name:'الكهف'},{id:19,name:'مريم'},{id:20,name:'طه'},{id:21,name:'الأنبياء'},{id:22,name:'الحج'},{id:23,name:'المؤمنون'},{id:24,name:'النور'},{id:25,name:'الفرقان'},{id:26,name:'الشعراء'},{id:27,name:'النمل'},{id:28,name:'القصص'},{id:29,name:'العنكبوت'},{id:30,name:'الروم'},{id:31,name:'لقمان'},{id:32,name:'السجدة'},{id:33,name:'الأحزاب'},{id:34,name:'سبأ'},{id:35,name:'فاطر'},{id:36,name:'يس'},{id:37,name:'الصافات'},{id:38,name:'ص'},{id:39,name:'الزمر'},{id:40,name:'غافر'},{id:41,name:'فصلت'},{id:42,name:'الشورى'},{id:43,name:'الزخرف'},{id:44,name:'الدخان'},{id:45,name:'الجاثية'},{id:46,name:'الأحقاف'},{id:47,name:'محمد'},{id:48,name:'الفتح'},{id:49,name:'الحجرات'},{id:50,name:'ق'},{id:51,name:'الذاريات'},{id:52,name:'الطور'},{id:53,name:'النجم'},{id:54,name:'القمر'},{id:55,name:'الرحمن'},{id:56,name:'الواقعة'},{id:57,name:'الحديد'},{id:58,name:'المجادلة'},{id:59,name:'الحشر'},{id:60,name:'الممتحنة'},{id:61,name:'الصف'},{id:62,name:'الجمعة'},{id:63,name:'المنافقون'},{id:64,name:'التغابن'},{id:65,name:'الطلاق'},{id:66,name:'التحريم'},{id:67,name:'الملك'},{id:68,name:'القلم'},{id:69,name:'الحاقة'},{id:70,name:'المعارج'},{id:71,name:'نوح'},{id:72,name:'الجن'},{id:73,name:'المزمل'},{id:74,name:'المدثر'},{id:75,name:'القيامة'},{id:76,name:'الإنسان'},{id:77,name:'المرسلات'},{id:78,name:'النبأ'},{id:79,name:'النازعات'},{id:80,name:'عبس'},{id:81,name:'التكوير'},{id:82,name:'الانفطار'},{id:83,name:'المطففين'},{id:84,name:'الانشقاق'},{id:85,name:'البروج'},{id:86,name:'الطارق'},{id:87,name:'الأعلى'},{id:88,name:'الغاشية'},{id:89,name:'الفجر'},{id:90,name:'البلد'},{id:91,name:'الشمس'},{id:92,name:'الليل'},{id:93,name:'الضحى'},{id:94,name:'الشرح'},{id:95,name:'التين'},{id:96,name:'العلق'},{id:97,name:'القدر'},{id:98,name:'البينة'},{id:99,name:'الزلزلة'},{id:100,name:'العاديات'},{id:101,name:'القارعة'},{id:102,name:'التكاثر'},{id:103,name:'العصر'},{id:104,name:'الهمزة'},{id:105,name:'الفيل'},{id:106,name:'قريش'},{id:107,name:'الماعون'},{id:108,name:'الكوثر'},{id:109,name:'الكافرون'},{id:110,name:'النصر'},{id:111,name:'المسد'},{id:112,name:'الإخلاص'},{id:113,name:'الفلق'},{id:114,name:'الناس'}
  ];

  surahsData.forEach(s => {
    const opt = document.createElement('option');
    opt.value = `سورة ${s.name}`;
    ui.surahDatalist.appendChild(opt);
  });
  
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
  ui.reciterSelect.value = AppState.settings.reciter || 'mishary';

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
    
    // Update Tafsir and Translation content
    ui.tafsirDisplay.innerHTML = `<strong>التفسير الميسر:</strong><br>${ayahData.tafsir || 'جاري التحميل...'}`;
    ui.translationDisplay.innerHTML = `<strong>Sahih International:</strong><br>${ayahData.translation || 'Loading...'}`;
    
    // Basmalah logic
    if (ayahNumber == 1 && AppState.current.surah.id != 1 && AppState.current.surah.id != 9) {
      ui.basmalah.style.display = 'block';
    } else {
      ui.basmalah.style.display = 'none';
    }

    // Display words
    ui.quranDisplay.innerHTML = '';
    ayahData.words.forEach(word => {
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = word;
      ui.quranDisplay.appendChild(span);
    });

    // Update Audio
    const reciter = AppState.settings.reciter || 'mishary';
    ui.audio.src = quranAPI.generateAudioUrl(AppState.current.surah.id, ayahNumber, reciter);
    ui.audio.volume = 1.0;
    ui.audio.muted = false;
    
    karaokeEngine.setWords(ayahData.text, ui.quranDisplay);
    
    // Play automatically if playing
    if(AppState.player.isPlaying) {
      if (AppState.speech.isListening) speechEngine.stop(); // Prevent overlap
      ui.audio.play().catch(e => { AppState.player.isPlaying = false; });
    }
  }

  observer.subscribe('isPlaying', (val) => {
    if(val) {
      if (AppState.speech.isListening) speechEngine.stop(); // Stop mic if audio plays
      ui.iconPlay.style.display = 'none';
      ui.iconPause.style.display = 'block';
    } else {
      ui.iconPlay.style.display = 'block';
      ui.iconPause.style.display = 'none';
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

  // Audio events
  ui.audio.addEventListener('play', () => AppState.player.isPlaying = true);
  ui.audio.addEventListener('pause', () => AppState.player.isPlaying = false);
  ui.audio.addEventListener('ended', () => {
    if (AppState.player.repeatAyah) {
      ui.audio.currentTime = 0;
      ui.audio.play();
    } else {
      // Next ayah
      const next = parseInt(AppState.current.ayah.id) + 1;
      if(next <= AppState.current.surah.ayahCount) {
          loadAyah(next);
          ui.audio.play();
      } else {
          AppState.player.isPlaying = false;
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
      if (AppState.speech.isListening) speechEngine.stop();
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
    });
  }

  ui.nextBtn.addEventListener('click', () => {
    const next = parseInt(AppState.current.ayah.id) + 1;
    if(next <= AppState.current.surah.ayahCount) loadAyah(next);
  });

  ui.prevBtn.addEventListener('click', () => {
    const prev = parseInt(AppState.current.ayah.id) - 1;
    if(prev > 0) loadAyah(prev);
  });

  ui.surahInput.addEventListener('change', (e) => {
    const val = e.target.value.replace('سورة ', '').trim();
    const found = surahsData.find(s => s.name === val || `سورة ${s.name}` === e.target.value);
    if(found) {
      loadSurah(found.id);
    }
  });

  ui.surahInput.addEventListener('focus', (e) => {
    e.target.value = ''; // clear to allow easy searching
  });

  ui.surahInput.addEventListener('blur', (e) => {
    if(!e.target.value) {
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

  // Speech listeners
  ui.micBtn.addEventListener('click', () => {
    if(AppState.speech.isListening) {
      speechEngine.stop();
    } else {
      if (AppState.player.isPlaying) AppState.player.isPlaying = false; // Stop reciter audio
      speechEngine.start();
    }
  });

  window.addEventListener('speechresult', (e) => {
    const { text, matchScore } = e.detail;
    ui.speechResult.textContent = `النتيجة: ${text} | التطابق: ${Math.round(matchScore*100)}%`;
    ui.speechResult.classList.add('show');
    AppState.speech.latestScore = matchScore; // Save score for reporting
  });
  
  window.addEventListener('ayahmatched', (e) => {
    ui.speechResult.style.color = 'var(--accent-success)';
    ui.btnSendTeacher.style.display = 'inline-flex';
    
    // Update Mastered Progress
    const surahId = AppState.current.surah.id;
    const ayahId = AppState.current.ayah.id;
    if (!AppState.memorization.mastered[surahId]) {
      AppState.memorization.mastered[surahId] = [];
    }
    if (!AppState.memorization.mastered[surahId].includes(ayahId)) {
      AppState.memorization.mastered[surahId].push(ayahId);
      const totalAyahs = AppState.current.surah.ayahCount;
      const masteredCount = AppState.memorization.mastered[surahId].length;
      AppState.memorization.progress = Math.round((masteredCount / totalAyahs) * 100);
    }

    setTimeout(() => {
        ui.speechResult.style.color = '';
        ui.speechResult.textContent = 'أحسنت! آية صحيحة.';
        // Do not auto-next here to allow user to share.
        // ui.nextBtn.click();
        setTimeout(() => ui.speechResult.classList.remove('show'), 3000);
    }, 1500);
  });
  
  window.addEventListener('ayahmismatched', (e) => {
    ui.speechResult.style.color = 'var(--accent-primary)';
    ui.btnSendTeacher.style.display = 'inline-flex';
    ui.speechResult.textContent = `التلاوة غير مطابقة للآية بشكل كافٍ (${Math.round(e.detail.score * 100)}%). حاول مجدداً أو أرسل لمعلمك.`;
  });

  window.addEventListener('speechend', (e) => {
      // If user stopped listening, show share button if there's a score
      if (AppState.speech.detectedText) {
          ui.btnSendTeacher.style.display = 'inline-flex';
      }
  });

  // Tour setup
  tour.defineSteps([
    { target: '.selectors-card', title: 'اختيار السورة والآية', description: 'من هنا يمكنك اختيار السورة والآية التي تود العمل عليها' },
    { target: '#quran-container', title: 'عرض الآيات', description: 'هنا يتم عرض الآيات بوضوح لتتمكن من قراءتها' },
    { target: '#player-container', title: 'مشغل التلاوة', description: 'يتحكم هذا المشغل في الصوت والتظليل المتزامن للكلمات (كاريوكي)' },
    { target: '#btn-mic', title: 'اختبار الحفظ', description: 'انقر هنا للبدء بتسميع الآية وسيقوم التطبيق بتقييم حفظك باستخدام التعرف الصوتي' }
  ]);

  ui.btnTour.addEventListener('click', () => {
    tour.start();
  });

  // --- Teacher System Logic ---
  
  function renderTeacherReports() {
    ui.teacherReportsList.innerHTML = '';
    const reports = AppState.reports;
    if (reports.length === 0) {
      ui.teacherReportsList.innerHTML = '<p>لا توجد تسميعات بعد.</p>';
      return;
    }
    
    // Sort latest first
    const sorted = [...reports].reverse();
    
    sorted.forEach(report => {
      const card = document.createElement('div');
      card.className = 'report-card';
      
      const audioHtml = report.audioBase64 ? `<div class="report-audio"><audio src="${report.audioBase64}" controls></audio></div>` : '<p>لا يوجد تسجيل صوتي.</p>';
      
      card.innerHTML = `
        <div class="report-header">
          <span>${report.surahName} - آية ${report.ayahNumber}</span>
          <span class="report-score">تطابق: ${Math.round(report.score * 100)}%</span>
        </div>
        <div class="report-text">${report.text}</div>
        ${audioHtml}
        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 8px;">
          التاريخ: ${new Date(report.timestamp).toLocaleString()}
        </div>
      `;
      ui.teacherReportsList.appendChild(card);
    });
  }

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
  
  ui.btnSendTeacher.addEventListener('click', () => {
    const report = {
      id: Date.now(),
      timestamp: Date.now(),
      surahName: AppState.current.surah.name,
      ayahNumber: AppState.current.ayah.id,
      text: AppState.speech.detectedText || 'لم يتم قراءة النص',
      score: AppState.speech.latestScore || 0,
      audioBase64: AppState.speech.audioBlobBase64
    };
    
    // Push new report
    const updatedReports = [...AppState.reports, report];
    AppState.reports = updatedReports;
    
    ui.btnSendTeacher.style.display = 'none';
    ui.speechResult.textContent = 'تم إرسال التسميع للمعلم بنجاح! ✔️';
    ui.speechResult.classList.add('show');
    
    setTimeout(() => ui.speechResult.classList.remove('show'), 3000);
  });

  // Interactive Tour
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


  // Listening Mode Toggle
  if (ui.btnListening) {
    ui.btnListening.addEventListener('click', () => {
      document.body.classList.toggle('theme-listening');
      const isListeningMode = document.body.classList.contains('theme-listening');
      if (isListeningMode) {
        ui.btnListening.style.color = 'var(--accent-primary)';
      } else {
        ui.btnListening.style.color = '';
      }
    });
  }

  // PWA Install Logic
  let deferredPrompt;
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
      }
    });
  }

  // Initial load
  loadSurah(AppState.current.surah.id);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
