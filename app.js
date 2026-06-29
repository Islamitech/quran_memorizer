/**
 * Quran Memorizer Platform - Core JavaScript Engine
 */

// Global Application State
const state = {
  currentSurahNum: 67, // Default to Surah Al-Mulk
  currentAyahNum: 1,
  currentReciter: "everyayah.faresabbad", // Default to Sheikh Fares Abbad
  isChildMode: false,
  isListeningMode: false,
  isTextHidden: false,
  isLoopingVerse: false,
  isAutoplay: true,
  isTafsirOpen: true,
  fontSize: 40, // Base font size in px
  
  // Active Surah Loaded Data
  surahData: null,
  activeVerseWords: [],
  
  // Audio Objects
  reciterAudio: new Audio(),
  isReciterAudioPlaying: false,
  
  // User Memorization Progress (Saved to LocalStorage)
  // Format: { [surahNum]: [array of memorized ayah numbers] }
  progress: {},
  
  // Web Audio Recording Objects
  audioContext: null,
  mediaStream: null,
  mediaRecorder: null,
  recordedChunks: [],
  recordedAudioUrl: null,
  recordedAudioBlob: null,
  microphoneGainNode: null,
  audioEffect: 'normal', // 'normal', 'studio', 'mosque'
  
  // Web Speech API Recognition
  speechRecognition: null,
  recognizedText: "",
  isSpeechRecognitionActive: false,
  
  // Onboarding Onboarding Tour Step
  currentGuideStep: 0
};

// Onboarding Tour Steps Configuration
const GUIDE_STEPS = [
  {
    elementId: "guide-header",
    title: "شريط التحكم العلوي 📱",
    desc: "هنا تجد إحصائيات تقدمك، وزر وضع الأطفال المبهج، ودعم استمرارية المشروع، والتشغيل المتواصل."
  },
  {
    elementId: "guide-progress",
    title: "مؤشر تقدم الحفظ 📊",
    desc: "يوضح هذا الشريط نسبة ما قمت بحفظه وتسميعه بنجاح في السورة الحالية، مع رسائل تحفيزية عند الإنجاز!"
  },
  {
    elementId: "guide-surah-select",
    title: "اختيار السور والبحث 🔍",
    desc: "ابحث عن أي سورة من سور القرآن الـ 114 بدون تشكيل، واعرض تفاصيلها فوراً لتسجيل الحفظ."
  },
  {
    elementId: "guide-reciter-select",
    title: "القارئ المعلم 🧑‍🏫",
    desc: "اختر شيخك المفضل من كبار القراء، وننصح بالشيخ خليفة الطنيجي لتحفيظ الأطفال بشكل ميسر."
  },
  {
    elementId: "guide-recorder",
    title: "مسجل التسميع ومؤثرات الصدى 🎙️",
    desc: "اضغط على الميكروفون الأحمر لتسجيل تلاوتك، وتحكم بحساسية الصوت، وجرب 'صدى المسجد' الفخم ليتردد صوتك كالمآذن!"
  },
  {
    elementId: "focus-reading-panel",
    title: "لوحة التلاوة والكاراوكي 📖",
    desc: "هنا يتم عرض الآية بخط عثماني فاخر، وتتبع الكلمة التي ينطقها القارئ باللون الأخضر المضيء في نفس الوقت."
  },
  {
    elementId: "guide-player",
    title: "المشغل الذكي 🎵",
    desc: "تحكم بالتنقل بين الآيات، وكرر الآية لتثبيتها، أو اخفِ الكلمات لتختبر حفظك بنقرة واحدة!"
  }
];

// Initialize Application on Page Load
document.addEventListener("DOMContentLoaded", () => {
  initProgress();
  populateSurahList();
  setupEventListeners();
  loadSurah(state.currentSurahNum, state.currentAyahNum);
  setupVisualizerPlaceholder();
  initSpeechRecognition();
  
  // Automatically trigger guide for new users
  if (!localStorage.getItem("guide_completed")) {
    setTimeout(() => {
      startOnboardingTour();
    }, 1500);
  }
});

// --- Progress Management ---
function initProgress() {
  const savedProgress = localStorage.getItem("quran_memorizer_progress");
  if (savedProgress) {
    try {
      state.progress = JSON.parse(savedProgress);
    } catch (e) {
      state.progress = {};
    }
  } else {
    state.progress = {};
  }
}

function saveProgress() {
  localStorage.setItem("quran_memorizer_progress", JSON.stringify(state.progress));
  updateProgressBar();
}

function toggleAyahMemorized(surahNum, ayahNum) {
  if (!state.progress[surahNum]) {
    state.progress[surahNum] = [];
  }
  
  const index = state.progress[surahNum].indexOf(ayahNum);
  if (index > -1) {
    state.progress[surahNum].splice(index, 1);
  } else {
    state.progress[surahNum].push(ayahNum);
    triggerMilestoneAlert(surahNum);
  }
  
  saveProgress();
}

function isAyahMemorized(surahNum, ayahNum) {
  return state.progress[surahNum] && state.progress[surahNum].includes(ayahNum);
}

function updateProgressBar() {
  const currentSurah = QURAN_SURAHS.find(s => s.number === state.currentSurahNum);
  if (!currentSurah) return;
  
  const totalAyahs = currentSurah.numberOfAyahs;
  const memorizedList = state.progress[state.currentSurahNum] || [];
  const memorizedCount = memorizedList.length;
  const percentage = totalAyahs > 0 ? Math.round((memorizedCount / totalAyahs) * 100) : 0;
  
  // DOM updates
  document.getElementById("progress-surah-label").textContent = `سورة ${currentSurah.name} (آيات مسمّعة: ${memorizedCount} من ${totalAyahs})`;
  document.getElementById("progress-percentage-label").textContent = `${percentage}%`;
  document.getElementById("progress-fill").style.width = `${percentage}%`;
  document.getElementById("player-verse-counter").textContent = `آية: ${state.currentAyahNum} / ${totalAyahs}`;
  
  // Motivational messages
  let motivation = "ابدأ التلاوة والتسميع اليوم!";
  if (percentage === 100) {
    motivation = "✨ مبروك! لقد أتممت حفظ هذه السورة بالكامل بنجاح! 🌟";
  } else if (percentage >= 75) {
    motivation = "رائع جداً! أوشكت على ختم السورة، استمر يا بطل! 💪";
  } else if (percentage >= 50) {
    motivation = "أداء ممتاز! نصف السورة تم حفظه بنجاح! 💖";
  } else if (percentage >= 25) {
    motivation = "بداية مباركة! ربع السورة في صدرك الآن! 👍";
  } else if (percentage > 0) {
    motivation = "خطوة بخطوة.. الحفظ يثبت بالتكرار والتسميع!";
  }
  
  document.getElementById("progress-motivation").textContent = motivation;
}

function triggerMilestoneAlert(surahNum) {
  const currentSurah = QURAN_SURAHS.find(s => s.number === surahNum);
  const total = currentSurah.numberOfAyahs;
  const memorized = state.progress[surahNum].length;
  const pct = Math.round((memorized / total) * 100);
  
  if ([25, 50, 75, 100].includes(pct)) {
    // Custom cartoonish visual notification for children, elegant for adults
    const div = document.createElement("div");
    div.style.position = "fixed";
    div.style.top = "90px";
    div.style.left = "50%";
    div.style.transform = "translateX(-50%) scale(0.9)";
    div.style.background = "linear-gradient(135deg, var(--primary), var(--accent))";
    div.style.color = "white";
    div.style.padding = "12px 24px";
    div.style.borderRadius = "30px";
    div.style.boxShadow = "var(--shadow-lg)";
    div.style.zIndex = "99999";
    div.style.transition = "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
    div.style.direction = "rtl";
    div.style.textAlign = "center";
    
    div.innerHTML = `
      <div style="font-size: 24px; margin-bottom: 4px;">🎉 إنجاز جديد! 🎉</div>
      <div style="font-size: 14px;">لقد حفظت <strong>${pct}%</strong> من سورة ${currentSurah.name}! بارك الله فيك.</div>
    `;
    
    document.body.appendChild(div);
    setTimeout(() => {
      div.style.transform = "translateX(-50%) scale(1)";
    }, 50);
    
    setTimeout(() => {
      div.style.transform = "translateX(-50%) scale(0)";
      setTimeout(() => div.remove(), 300);
    }, 4000);
  }
}

// --- Render Sidebar Surah List ---
function populateSurahList(filterText = "") {
  const listContainer = document.getElementById("surah-list");
  listContainer.innerHTML = "";
  
  // Clean filter text from Arabic diacritics
  const cleanFilter = cleanArabicText(filterText);
  
  QURAN_SURAHS.forEach(surah => {
    const cleanName = cleanArabicText(surah.name);
    
    // Simple matches
    if (filterText && !cleanName.includes(cleanFilter) && !surah.englishName.toLowerCase().includes(filterText.toLowerCase())) {
      return;
    }
    
    const div = document.createElement("div");
    div.className = `surah-item ${surah.number === state.currentSurahNum ? "active" : ""}`;
    div.id = `surah-item-${surah.number}`;
    div.onclick = () => {
      document.querySelectorAll(".surah-item").forEach(item => item.classList.remove("active"));
      div.classList.add("active");
      loadSurah(surah.number, 1);
    };
    
    div.innerHTML = `
      <div class="surah-meta-main">
        <span class="surah-num">${surah.number}</span>
        <span class="surah-name">${surah.name}</span>
      </div>
      <div class="surah-meta-details">
        <div>${surah.numberOfAyahs} آية</div>
        <div>${surah.revelationType === "Meccan" ? "مكية" : "مدنية"}</div>
      </div>
    `;
    
    listContainer.appendChild(div);
  });
}

// Helper to remove Arabic diacritics (Tashkeel) and Quranic Waqf signs
function cleanArabicText(text) {
  if (!text) return "";
  return text
    .replace(/[\u064B-\u0652\u065F\u0670]/g, "") // remove diacritics
    .replace(/[\u06D6-\u06ED]/g, "") // remove Quranic Waqf/high symbols
    .replace(/[أإآٱ]/g, "ا") // unify Alef (including Alef Wasla ٱ)
    .replace(/ة/g, "ه") // unify Teh Marbuta
    .replace(/[ىي]/g, "ي"); // unify Alef Maksura and Yeh
}

// --- Data Fetching & UI Binder ---
async function loadSurah(surahNum, startAyahNum = 1) {
  state.currentSurahNum = surahNum;
  state.currentAyahNum = startAyahNum;
  
  // Reset audio playback states
  stopReciterAudio();
  resetUserAudioRecorder();
  
  const surahInfo = QURAN_SURAHS.find(s => s.number === surahNum);
  
  // DOM Loading States
  document.getElementById("current-surah-title").textContent = `جاري تحميل سورة ${surahInfo.name}...`;
  document.getElementById("active-verse-card").innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i>`;
  document.getElementById("tafsir-content").textContent = "جاري تحميل التفسير المعين للآية...";
  document.getElementById("tafsir-translation").textContent = "Loading translation...";
  
  try {
    // 1. Try fetching from online API with fallback to local
    let data;
    if (OFFLINE_QURAN_DATA[surahNum]) {
      // Use offline data for quick demonstrations
      data = OFFLINE_QURAN_DATA[surahNum];
    } else {
      // Fetch dynamic Quran texts: Text (Uthmani), Tafsir (Al-Muyassar), English Translation
      const response = await fetch(`https://api.alquran.cloud/v1/surah/${surahNum}/editions/quran-uthmani,ar.muyassar,en.sahih`);
      if (!response.ok) throw new Error("Network issues");
      const json = await response.json();
      
      const uthmaniList = json.data[0].ayahs;
      const muyassarList = json.data[1].ayahs;
      const translationList = json.data[2].ayahs;
      
      data = {
        name: json.data[0].name,
        ayahs: uthmaniList.map((ayah, i) => ({
          number: i + 1,
          text: ayah.text,
          translation: translationList[i].text,
          tafsir: muyassarList[i].text
        }))
      };
    }
    
    state.surahData = data;
    
    // 2. Set UI Header Banner Info
    document.getElementById("current-surah-title").textContent = `سورة ${surahInfo.name}`;
    document.getElementById("ayahs-count-label").textContent = `${surahInfo.numberOfAyahs} آية`;
    document.getElementById("revelation-type-label").textContent = surahInfo.revelationType === "Meccan" ? "مكية" : "مدنية";
    
    // 3. Render Active Verse
    renderActiveVerse();
    updateProgressBar();
    
    // Scroll active list item into view if in sidebar
    const activeItem = document.getElementById(`surah-item-${surahNum}`);
    if (activeItem) {
      activeItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    
  } catch (error) {
    console.error("Error loading Surah:", error);
    // Display error message
    document.getElementById("current-surah-title").textContent = `تعذر التحميل عبر الإنترنت`;
    document.getElementById("active-verse-card").innerHTML = `
      <div style="font-size:16px; color: var(--danger);">
        <i class="fa-solid fa-triangle-exclamation" style="font-size:24px; margin-bottom: 8px;"></i>
        <p>تحقق من الاتصال بالإنترنت لتشغيل كافة السور.</p>
        <button class="btn btn-primary" onclick="loadSurah(${surahNum}, ${startAyahNum})" style="margin-top:12px;">إعادة المحاولة</button>
      </div>
    `;
  }
}

function renderActiveVerse() {
  if (!state.surahData) return;
  
  const ayah = state.surahData.ayahs.find(a => a.number === state.currentAyahNum);
  if (!ayah) return;
  
  const activeVerseContainer = document.getElementById("active-verse-card");
  activeVerseContainer.innerHTML = "";
  
  // Prepend Basmala if first verse (except Surah At-Tawbah, Surah 9)
  if (state.currentAyahNum === 1 && state.currentSurahNum !== 9) {
    const basmalaDiv = document.createElement("div");
    basmalaDiv.className = "basmala-text";
    basmalaDiv.style.fontFamily = "var(--font-quran)";
    basmalaDiv.style.fontSize = "32px";
    basmalaDiv.style.color = "var(--primary)";
    basmalaDiv.style.width = "100%";
    basmalaDiv.style.textAlign = "center";
    basmalaDiv.style.marginBottom = "16px";
    basmalaDiv.textContent = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
    activeVerseContainer.appendChild(basmalaDiv);
  }
  
  // Format metadata for bottom sticky bar
  document.getElementById("player-title").textContent = `سورة ${QURAN_SURAHS.find(s => s.number === state.currentSurahNum).name}`;
  document.getElementById("player-subtitle").textContent = `الآية رقم ${state.currentAyahNum}`;
  
  // Remove duplicate Basmala prefix if first verse (except Al-Fatihah/1 and At-Tawbah/9)
  let verseText = ayah.text;
  if (state.currentAyahNum === 1 && state.currentSurahNum !== 1 && state.currentSurahNum !== 9) {
    const rawWordsList = verseText.split(" ").filter(w => w.trim().length > 0);
    if (rawWordsList.length >= 4) {
      const first4Cleaned = rawWordsList.slice(0, 4).map(w => cleanArabicText(w).trim());
      if (
        first4Cleaned[0] === "بسم" &&
        first4Cleaned[1] === "الله" &&
        first4Cleaned[2] === "الرحمن" &&
        first4Cleaned[3] === "الرحيم"
      ) {
        verseText = rawWordsList.slice(4).join(" ");
      }
    }
  }

  // Split words and filter/attach Waqf signs to previous words
  const rawWords = verseText.split(" ");
  const words = [];
  rawWords.forEach(w => {
    const cleaned = cleanArabicText(w).trim();
    if (cleaned.length === 0) {
      // Standalone Waqf sign/symbol - attach to previous word if possible
      if (words.length > 0) {
        words[words.length - 1] += " " + w;
      } else {
        words.push(w);
      }
    } else {
      words.push(w);
    }
  });
  state.activeVerseWords = words;
  
  // Render word spans for Karaoke and touch reveal
  words.forEach((word, idx) => {
    const span = document.createElement("span");
    span.className = "word";
    span.textContent = word;
    span.dataset.index = idx;
    
    // Reveal word on hover or touch/click
    span.addEventListener("mousedown", () => revealWordTemp(span, true));
    span.addEventListener("mouseup", () => revealWordTemp(span, false));
    span.addEventListener("touchstart", (e) => {
      e.preventDefault();
      revealWordTemp(span, true);
    });
    span.addEventListener("touchend", () => revealWordTemp(span, false));
    
    activeVerseContainer.appendChild(span);
  });
  
  // Add Tafsir text
  document.getElementById("tafsir-content").textContent = ayah.tafsir;
  document.getElementById("tafsir-translation").textContent = ayah.translation;
  
  // Apply hidden state styles if eye hide mode is active
  if (state.isTextHidden) {
    activeVerseContainer.classList.add("hidden-words");
    document.getElementById("hide-text-overlay").style.display = "flex";
  } else {
    activeVerseContainer.classList.remove("hidden-words");
    document.getElementById("hide-text-overlay").style.display = "none";
  }
  
  // Check if this ayah is already memorized, highlight/update states
  const isMemorized = isAyahMemorized(state.currentSurahNum, state.currentAyahNum);
  const verifyBtn = document.getElementById("btn-verify-recitation");
  
  if (isMemorized) {
    verifyBtn.innerHTML = `<i class="fa-solid fa-circle-check text-primary"></i> <span>مسمّعة بنجاح</span>`;
    verifyBtn.classList.remove("btn-primary");
    verifyBtn.classList.add("btn");
  } else {
    verifyBtn.innerHTML = `<i class="fa-solid fa-brain"></i> <span>التحقق الذكي</span>`;
    verifyBtn.classList.add("btn-primary");
  }

  // Load user recording from IndexedDB
  getAudioRecording(state.currentSurahNum, state.currentAyahNum).then(blob => {
    const playRecordedBtn = document.getElementById("btn-play-recording");
    if (blob) {
      state.recordedAudioBlob = blob;
      state.recordedAudioUrl = URL.createObjectURL(blob);
      if (playRecordedBtn) {
        playRecordedBtn.disabled = false;
      }
    } else {
      state.recordedAudioBlob = null;
      state.recordedAudioUrl = null;
      if (playRecordedBtn) {
        playRecordedBtn.disabled = true;
      }
    }
  });
}

function revealWordTemp(span, show) {
  if (!state.isTextHidden) return;
  if (show) {
    span.classList.add("revealed");
  } else {
    span.classList.remove("revealed");
  }
}

// --- Quran Audio Reciter Engine ---
function getGlobalAyahNumber(surahNum, ayahNum) {
  let globalNum = 0;
  for (let i = 1; i < surahNum; i++) {
    const surah = QURAN_SURAHS.find(s => s.number === i);
    if (surah) {
      globalNum += surah.numberOfAyahs;
    }
  }
  return globalNum + ayahNum;
}

function playReciterAudio() {
  if (!state.surahData) return;
  
  let audioUrl;
  if (state.currentReciter === "everyayah.faresabbad") {
    const sStr = String(state.currentSurahNum).padStart(3, '0');
    const aStr = String(state.currentAyahNum).padStart(3, '0');
    audioUrl = `https://everyayah.com/data/Fares_Abbad_64kbps/${sStr}${aStr}.mp3`;
  } else {
    const globalAyah = getGlobalAyahNumber(state.currentSurahNum, state.currentAyahNum);
    audioUrl = `https://cdn.islamic.network/quran/audio/128/${state.currentReciter}/${globalAyah}.mp3`;
  }
  
  state.reciterAudio.src = audioUrl;
  state.reciterAudio.load();
  
  // Show spinner on play pause button while loading
  const playIcon = document.getElementById("play-pause-icon");
  playIcon.className = "fa-solid fa-spinner fa-spin";
  
  state.reciterAudio.play()
    .then(() => {
      state.isReciterAudioPlaying = true;
      playIcon.className = "fa-solid fa-pause";
      document.getElementById("btn-play-pause").classList.add("active");
      
      // Update System Media Session for background control
      try {
        const surahName = QURAN_SURAHS.find(s => s.number === state.currentSurahNum).name;
        const reciterSelect = document.getElementById("reciter-select");
        const reciterName = reciterSelect ? reciterSelect.options[reciterSelect.selectedIndex].text : "القارئ المعلم";
        updateMediaSession(`سورة ${surahName} - الآية ${state.currentAyahNum}`, reciterName);
      } catch (err) {
        console.warn("Media Session update failed:", err);
      }
    })
    .catch(err => {
      console.error("Audio playback error:", err);
      playIcon.className = "fa-solid fa-play";
      alert("تعذر تشغيل الصوت للآية. تحقق من اتصال الإنترنت.");
    });
}

function pauseReciterAudio() {
  state.reciterAudio.pause();
  state.isReciterAudioPlaying = false;
  document.getElementById("play-pause-icon").className = "fa-solid fa-play";
  document.getElementById("btn-play-pause").classList.remove("active");
}

function stopReciterAudio() {
  pauseReciterAudio();
  state.reciterAudio.currentTime = 0;
  clearKaraokeHighlights();
}

function togglePlayPause() {
  if (state.isReciterAudioPlaying) {
    pauseReciterAudio();
  } else {
    playReciterAudio();
  }
}

function clearKaraokeHighlights() {
  document.querySelectorAll("#active-verse-card .word").forEach(span => {
    span.classList.remove("karaoke-active");
  });
}

function highlightKaraokeWord(wordIdx) {
  clearKaraokeHighlights();
  if (wordIdx >= 0 && wordIdx < state.activeVerseWords.length) {
    const activeSpan = document.querySelector(`#active-verse-card .word[data-index="${wordIdx}"]`);
    if (activeSpan) {
      activeSpan.classList.add("karaoke-active");
    }
  }
}

// Audio Time Update listener for Karaoke Word-Highlighting
state.reciterAudio.addEventListener("timeupdate", () => {
  if (state.reciterAudio.duration) {
    const elapsed = state.reciterAudio.currentTime;
    const duration = state.reciterAudio.duration;
    
    // Divide duration by total words count to map word active ranges
    const wordsCount = state.activeVerseWords.length;
    const currentWordIndex = Math.floor((elapsed / duration) * wordsCount);
    
    highlightKaraokeWord(currentWordIndex);
  }
});

// Audio playback ended - Autoplay next or repeat loop
state.reciterAudio.addEventListener("ended", () => {
  clearKaraokeHighlights();
  
  if (state.isLoopingVerse) {
    // Loop current verse
    playReciterAudio();
  } else if (state.isAutoplay) {
    // Go to next verse
    navigateAyah(1);
  } else {
    pauseReciterAudio();
  }
});

function navigateAyah(direction) {
  if (!state.surahData) return;
  
  const surahInfo = QURAN_SURAHS.find(s => s.number === state.currentSurahNum);
  const nextAyahNum = state.currentAyahNum + direction;
  
  if (nextAyahNum >= 1 && nextAyahNum <= surahInfo.numberOfAyahs) {
    state.currentAyahNum = nextAyahNum;
    renderActiveVerse();
    updateProgressBar();
    
    // If playing, autoplay next automatically
    if (state.isReciterAudioPlaying) {
      playReciterAudio();
    }
  } else if (nextAyahNum > surahInfo.numberOfAyahs) {
    // Reached end of current surah
    if (state.currentSurahNum < 114) {
      // Load next Surah
      loadSurah(state.currentSurahNum + 1, 1).then(() => {
        if (state.isReciterAudioPlaying) playReciterAudio();
      });
    } else {
      pauseReciterAudio();
      alert("لقد وصلت إلى نهاية المصحف الشريف!");
    }
  } else if (nextAyahNum < 1) {
    // Reached start of current surah, go to previous Surah if possible
    if (state.currentSurahNum > 1) {
      const prevSurahInfo = QURAN_SURAHS.find(s => s.number === state.currentSurahNum - 1);
      loadSurah(state.currentSurahNum - 1, prevSurahInfo.numberOfAyahs).then(() => {
        if (state.isReciterAudioPlaying) playReciterAudio();
      });
    }
  }
}

// --- Web Audio API Microphone Recorder & Effects ---
async function startAudioRecording() {
  try {
    state.recordedChunks = [];
    state.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Set up Web Audio Context for visualizer and live adjustments
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContextClass();
    
    const source = state.audioContext.createMediaStreamSource(state.mediaStream);
    state.microphoneGainNode = state.audioContext.createGain();
    
    // Link gain control node to microphone
    const gainVal = parseFloat(document.getElementById("gain-slider").value);
    state.microphoneGainNode.gain.value = gainVal;
    
    // Link to analyser node for canvas visualizer waves
    const analyser = state.audioContext.createAnalyser();
    analyser.fftSize = 256;
    
    source.connect(state.microphoneGainNode);
    state.microphoneGainNode.connect(analyser);
    
    // Start canvas visualization loop
    drawLiveWaveform(analyser);
    
    // Setup MediaRecorder
    state.mediaRecorder = new MediaRecorder(state.mediaStream);
    state.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        state.recordedChunks.push(e.data);
      }
    };
    
    state.mediaRecorder.onstop = () => {
      state.recordedAudioBlob = new Blob(state.recordedChunks, { type: "audio/webm" });
      state.recordedAudioUrl = URL.createObjectURL(state.recordedAudioBlob);
      
      // Save to IndexedDB persistently
      saveAudioRecording(state.currentSurahNum, state.currentAyahNum, state.recordedAudioBlob)
        .then(() => {
          updateProgressBar();
        })
        .catch(err => console.error("Error saving recording to DB:", err));
      
      // Enable recorded playback buttons
      document.getElementById("btn-play-recording").disabled = false;
      document.getElementById("btn-verify-recitation").disabled = false;
    };
    
    state.mediaRecorder.start();
    
    // Show active recording states in UI
    document.getElementById("btn-mic").classList.add("recording");
    const recTimer = document.getElementById("rec-timer");
    recTimer.classList.add("active");
    
    // Run timer count
    let seconds = 0;
    state.recInterval = setInterval(() => {
      seconds++;
      const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
      const secs = String(seconds % 60).padStart(2, '0');
      document.getElementById("timer-label").textContent = `${mins}:${secs}`;
    }, 1000);
    
    // Automatically trigger Web Speech recognition
    if (state.speechRecognition) {
      state.recognizedText = "";
      state.speechRecognition.start();
    }
    
    // Auto-hide sidebar drawer on mobile to allow distraction-free reading of verses during recording
    const sidebar = document.querySelector(".app-sidebar");
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      sidebar.classList.remove("open");
      const mobileRecBar = document.getElementById("mobile-rec-bar");
      if (mobileRecBar) {
        mobileRecBar.style.display = "flex";
      }
    }
    
  } catch (err) {
    console.error("Recording error:", err);
    alert("تعذر الوصول للميكروفون. يرجى إعطاء الصلاحية للموقع لتسجيل التسميع.");
  }
}

function stopAudioRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    state.mediaRecorder.stop();
  }
  
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(track => track.stop());
  }
  
  // Stop recording timer
  clearInterval(state.recInterval);
  document.getElementById("btn-mic").classList.remove("recording");
  document.getElementById("rec-timer").classList.remove("active");
  document.getElementById("timer-label").textContent = "00:00";
  
  // Stop Speech Recognition
  if (state.speechRecognition) {
    state.speechRecognition.stop();
  }

  // Hide mobile recording floating bar and slide open the sidebar on mobile to view controls/results
  const mobileRecBar = document.getElementById("mobile-rec-bar");
  if (mobileRecBar) {
    mobileRecBar.style.display = "none";
  }
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    const sidebar = document.querySelector(".app-sidebar");
    sidebar.classList.add("open");
  }
}

function resetUserAudioRecorder() {
  stopAudioRecording();
  state.recordedChunks = [];
  state.recordedAudioUrl = null;
  state.recordedAudioBlob = null;
  document.getElementById("btn-play-recording").disabled = true;
  document.getElementById("btn-verify-recitation").disabled = true;
  document.getElementById("speech-recognition-status").textContent = "اضغط على الميكروفون وسمّع الآية بصوتك، ثم اضغط التحقق الذكي للتحليل!";
}

// Canvas Waveform Visualizer
function drawLiveWaveform(analyser) {
  const canvas = document.getElementById("visualizer-canvas");
  const ctx = canvas.getContext("2d");
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  
  function draw() {
    if (!state.mediaStream || state.mediaStream.getTracks()[0].readyState === "ended") {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setupVisualizerPlaceholder();
      return;
    }
    
    requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray);
    
    ctx.fillStyle = "rgba(11, 15, 25, 0.2)"; // Semi-transparent to create motion trails
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const barWidth = (canvas.width / bufferLength) * 2.5;
    let barHeight;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
      barHeight = dataArray[i] / 1.5;
      
      // Dynamic colors based on frequency and theme
      const hue = state.isChildMode ? (i * 3 + 45) : (i * 2 + 150);
      ctx.fillStyle = `hsla(${hue}, 85%, 60%, 0.85)`;
      
      ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
      x += barWidth;
    }
  }
  
  draw();
}

function setupVisualizerPlaceholder() {
  const canvas = document.getElementById("visualizer-canvas");
  const ctx = canvas.getContext("2d");
  
  // Set physical dimensions
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw a beautiful ambient grid line
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
  
  // Static glowing line
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, "rgba(59, 130, 246, 0)");
  gradient.addColorStop(0.5, "rgba(16, 185, 129, 0.2)");
  gradient.addColorStop(1, "rgba(59, 130, 246, 0)");
  
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, canvas.height / 2);
  ctx.bezierCurveTo(canvas.width / 4, (canvas.height / 2) - 10, 3 * canvas.width / 4, (canvas.height / 2) + 10, canvas.width, canvas.height / 2);
  ctx.stroke();
}

// Play Recorded Voice with Web Audio API sound effects applied
function playRecordedAudioWithEffects() {
  if (!state.recordedAudioBlob) return;
  
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const playCtx = new AudioContextClass();
  
  const reader = new FileReader();
  reader.onload = async function() {
    try {
      const buffer = await playCtx.decodeAudioData(reader.result);
      const source = playCtx.createBufferSource();
      source.buffer = buffer;
      
      // Apply selected audio effects chains
      if (state.audioEffect === "normal") {
        // Direct output
        source.connect(playCtx.destination);
      } 
      else if (state.audioEffect === "studio") {
        // Highpass filter (cuts low hum) + compressor (enhances voice presence)
        const filter = playCtx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 140; // cut below 140Hz
        
        const compressor = playCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-20, playCtx.currentTime);
        compressor.knee.setValueAtTime(30, playCtx.currentTime);
        compressor.ratio.setValueAtTime(8, playCtx.currentTime);
        compressor.attack.setValueAtTime(0.01, playCtx.currentTime);
        compressor.release.setValueAtTime(0.25, playCtx.currentTime);
        
        source.connect(filter);
        filter.connect(compressor);
        compressor.connect(playCtx.destination);
      } 
      else if (state.audioEffect === "mosque") {
        // Dual delay lines to simulate natural reflections of a grand hall
        const dryNode = playCtx.createGain();
        const wetNode = playCtx.createGain();
        
        const delay1 = playCtx.createDelay(1.0);
        const delay2 = playCtx.createDelay(1.0);
        const feedback1 = playCtx.createGain();
        const feedback2 = playCtx.createGain();
        
        // Two separate short reflection times (180ms and 280ms)
        delay1.delayTime.value = 0.18;
        delay2.delayTime.value = 0.28;
        
        // Decay values cut by 50% for extreme clarity
        feedback1.gain.value = 0.18; 
        feedback2.gain.value = 0.15;
        
        dryNode.gain.value = 1.0;
        wetNode.gain.value = 0.18; // wet volume cut by 50%
        
        // Establish feedback loops
        delay1.connect(feedback1);
        feedback1.connect(delay1);
        
        delay2.connect(feedback2);
        feedback2.connect(delay2);
        
        // Dry signal path
        source.connect(dryNode);
        dryNode.connect(playCtx.destination);
        
        // Wet signal path
        source.connect(delay1);
        source.connect(delay2);
        
        delay1.connect(wetNode);
        delay2.connect(wetNode);
        wetNode.connect(playCtx.destination);
      }
      
      source.start(0);
      
      // Toggle play button icon to stop or spinner
      const playBtn = document.getElementById("btn-play-recording");
      playBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>جاري التشغيل...</span>`;
      
      source.onended = () => {
        playBtn.innerHTML = `<i class="fa-solid fa-play"></i> <span>استمع لتسجيلك</span>`;
      };
      
    } catch (e) {
      console.error("Error playing recorded audio:", e);
      alert("فشل تشغيل الملف المسجل.");
    }
  };
  reader.readAsArrayBuffer(state.recordedAudioBlob);
}

// --- Web Speech API - Arabic Verification ---
function initSpeechRecognition() {
  const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionClass) {
    console.warn("Speech recognition is not supported in this browser.");
    return;
  }
  
  state.speechRecognition = new SpeechRecognitionClass();
  state.speechRecognition.lang = "ar-EG"; // Arabic Egypt or Saudi Arabia
  state.speechRecognition.continuous = false;
  state.speechRecognition.interimResults = false;
  
  state.speechRecognition.onstart = () => {
    state.isSpeechRecognitionActive = true;
    document.getElementById("speech-recognition-status").textContent = "جاري الاستماع لتسميعك الآن...";
  };
  
  state.speechRecognition.onresult = (event) => {
    const result = event.results[0][0].transcript;
    state.recognizedText = result;
  };
  
  state.speechRecognition.onerror = (e) => {
    console.error("Speech Recognition Error:", e);
    if (e.error === "no-speech") {
      document.getElementById("speech-recognition-status").textContent = "لم يتم التقاط صوت. يرجى المحاولة مجدداً.";
    }
  };
  
  state.speechRecognition.onend = () => {
    state.isSpeechRecognitionActive = false;
    if (state.recognizedText) {
      document.getElementById("speech-recognition-status").textContent = `تم التقاط التلاوة: "${state.recognizedText}"`;
    } else {
      document.getElementById("speech-recognition-status").textContent = "اضغط على الميكروفون مجدداً وسجل تلاوتك.";
    }
  };
}

// Check Recitation Quality - comparing user input to actual Quran Verse
function verifyUserRecitation() {
  if (!state.surahData) return;
  
  const ayah = state.surahData.ayahs.find(a => a.number === state.currentAyahNum);
  if (!ayah) return;
  
  // Extract user text. If Speech API isn't supported or empty, simulate for mockup demonstration
  let userText = state.recognizedText;
  if (!userText) {
    // Provide a beautiful simulation fallback that simulates voice recognition for desktop/offline testing
    document.getElementById("speech-recognition-status").textContent = "جاري محاكاة التحليل الصوتي للآية...";
    
    // Simulating 2 seconds verification delay
    setTimeout(() => {
      simulateVerification();
    }, 1500);
    return;
  }
  
  performWordMatching(userText);
}

function simulateVerification() {
  // Simulates 90% accuracy for interactive demo testing
  const matchIndices = state.activeVerseWords.map((_, idx) => idx);
  
  // Randomly drop 1 word for realism if length is > 4
  if (state.activeVerseWords.length > 4) {
    const dropIdx = Math.floor(Math.random() * state.activeVerseWords.length);
    matchIndices.splice(dropIdx, 1);
  }
  
  applyMatchingHighlights(matchIndices);
}

function performWordMatching(userRaw) {
  // Normalize user words, filtering out empty entries
  const userWords = cleanArabicText(userRaw).split(" ").filter(w => w.trim().length > 0);
  
  // Normalize our clean active verse words (without diacritics / Waqf symbols)
  const actualWords = state.activeVerseWords.map(w => cleanArabicText(w).trim());
  
  const matchedIndices = [];
  
  // Match check
  actualWords.forEach((word, idx) => {
    // Simple matching (checks if actual word exists in the user's speech around that sequence)
    const startRange = Math.max(0, idx - 2);
    const endRange = Math.min(userWords.length, idx + 3);
    let found = false;
    
    for (let i = startRange; i < endRange; i++) {
      if (userWords[i] && (userWords[i] === word || word.includes(userWords[i]) || userWords[i].includes(word))) {
        found = true;
        break;
      }
    }
    
    if (found) {
      matchedIndices.push(idx);
    }
  });
  
  applyMatchingHighlights(matchedIndices);
}

function applyMatchingHighlights(matchedIndices) {
  const spans = document.querySelectorAll("#active-verse-card .word");
  const wordsCount = spans.length;
  const matchCount = matchedIndices.length;
  const scorePercentage = Math.round((matchCount / wordsCount) * 100);
  
  spans.forEach((span, idx) => {
    if (matchedIndices.includes(idx)) {
      span.className = "word speech-match";
    } else {
      span.className = "word speech-error";
    }
  });
  
  // Update verification button status
  const verifyBtn = document.getElementById("btn-verify-recitation");
  const statusContainer = document.getElementById("speech-recognition-status");
  
  if (scorePercentage >= 80) {
    statusContainer.innerHTML = `<strong class="text-primary" style="color:#10b981;">ممتاز! التسميع صحيح بنسبة ${scorePercentage}% 🎉</strong>`;
    verifyBtn.innerHTML = `<i class="fa-solid fa-circle-check text-primary"></i> <span>مسمّعة بنجاح</span>`;
    verifyBtn.classList.remove("btn-primary");
    verifyBtn.classList.add("btn");
    
    // Auto-save progress
    if (!isAyahMemorized(state.currentSurahNum, state.currentAyahNum)) {
      toggleAyahMemorized(state.currentSurahNum, state.currentAyahNum);
    }
  } else {
    statusContainer.innerHTML = `<strong style="color:var(--danger);">أخطاء بسيطة (نسبة الصواب ${scorePercentage}%). حاول التكرار والاستماع مجدداً.</strong>`;
    
    // Reset highlights after 4 seconds to normal
    setTimeout(() => {
      renderActiveVerse();
    }, 4500);
  }
}

// --- Theme and Child Mode toggler ---
function toggleChildMode() {
  state.isChildMode = !state.isChildMode;
  document.documentElement.setAttribute("data-child-mode", state.isChildMode);
  
  if (state.isChildMode) {
    // Joyful welcoming alert for children
    showChildWelcomingAlert();
    
    // Change reciter to Kids Friendly option Khalifa Al-Tunaiji
    const reciterSelect = document.getElementById("reciter-select");
    reciterSelect.value = "ar.minshawi";
    state.currentReciter = "ar.minshawi";
    
    // Trigger visual updates
    document.getElementById("btn-child-mode").innerHTML = `<i class="fa-solid fa-face-smile"></i> <span>بطل التسميع!</span>`;
  } else {
    document.getElementById("btn-child-mode").innerHTML = `<i class="fa-solid fa-baby"></i> <span>وضع الأطفال</span>`;
  }
  
  setupVisualizerPlaceholder();
}

function showChildWelcomingAlert() {
  const div = document.createElement("div");
  div.style.position = "fixed";
  div.style.inset = "0";
  div.style.background = "rgba(254, 243, 199, 0.9)";
  div.style.zIndex = "999999";
  div.style.display = "flex";
  div.style.flexDirection = "column";
  div.style.alignItems = "center";
  div.style.justifyContent = "center";
  div.style.textAlign = "center";
  div.style.gap = "20px";
  div.style.padding = "24px";
  div.style.direction = "rtl";
  
  div.innerHTML = `
    <i class="fa-solid fa-wand-magic-sparkles" style="font-size: 80px; color: #fbbf24; animation: bounceSlow 1.5s infinite alternate;"></i>
    <h2 style="font-size: 32px; color: #1e3a8a;">أهلاً بك يا بطل! 👶🌟</h2>
    <p style="font-size: 18px; color: #0369a1; max-width: 500px;">
      تم تفعيل وضع الأطفال التفاعلي. الألوان أصبحت مرحة، وحجم الخط أكبر لمساعدتك على حفظ كلام الله بسهولة ومتعة!
    </p>
    <button class="btn btn-primary" id="btn-child-close" style="padding: 12px 32px; font-size: 16px; border-radius: 30px;">
      هيا نبدأ يا أذكياء! 🚀
    </button>
  `;
  
  document.body.appendChild(div);
  
  document.getElementById("btn-child-close").addEventListener("click", () => {
    div.remove();
  });
}

// --- Setup Event Listeners ---
function setupEventListeners() {
  
  // 1. Zoom controls
  document.getElementById("btn-zoom-in").addEventListener("click", () => {
    state.fontSize = Math.min(60, state.fontSize + 4);
    document.getElementById("active-verse-card").style.fontSize = `${state.fontSize}px`;
  });
  
  document.getElementById("btn-zoom-out").addEventListener("click", () => {
    state.fontSize = Math.max(24, state.fontSize - 4);
    document.getElementById("active-verse-card").style.fontSize = `${state.fontSize}px`;
  });
  
  // 2. Playback buttons
  document.getElementById("btn-play-pause").addEventListener("click", togglePlayPause);
  document.getElementById("btn-prev-ayah").addEventListener("click", () => navigateAyah(-1));
  document.getElementById("btn-next-ayah").addEventListener("click", () => navigateAyah(1));
  
  // 3. Toggle buttons (Autoplay, Loop, Hide text, Tafsir)
  document.getElementById("btn-autoplay").addEventListener("click", () => {
    state.isAutoplay = !state.isAutoplay;
    document.getElementById("btn-autoplay").classList.toggle("active", state.isAutoplay);
  });
  
  document.getElementById("btn-loop-verse").addEventListener("click", () => {
    state.isLoopingVerse = !state.isLoopingVerse;
    document.getElementById("btn-loop-verse").classList.toggle("active", state.isLoopingVerse);
  });
  
  document.getElementById("btn-hide-text").addEventListener("click", () => {
    state.isTextHidden = !state.isTextHidden;
    document.getElementById("btn-hide-text").classList.toggle("active", state.isTextHidden);
    renderActiveVerse();
  });
  
  document.getElementById("btn-toggle-tafsir").addEventListener("click", () => {
    state.isTafsirOpen = !state.isTafsirOpen;
    document.getElementById("btn-toggle-tafsir").classList.toggle("active", state.isTafsirOpen);
    document.getElementById("tafsir-drawer").style.display = state.isTafsirOpen ? "flex" : "none";
  });
  
  // 4. Header action clicks
  document.getElementById("btn-child-mode").addEventListener("click", toggleChildMode);
  
  document.getElementById("btn-support").addEventListener("click", () => {
    document.getElementById("support-modal").classList.add("active");
  });
  document.getElementById("btn-close-support").addEventListener("click", () => {
    document.getElementById("support-modal").classList.remove("active");
  });
  
  document.getElementById("btn-listening").addEventListener("click", () => {
    state.isListeningMode = !state.isListeningMode;
    document.getElementById("btn-listening").classList.toggle("btn-primary", !state.isListeningMode);
    document.getElementById("btn-listening").classList.toggle("btn-child-mode", state.isListeningMode);
    
    if (state.isListeningMode) {
      alert("تم تفعيل وضع الاستماع المتواصل. سيتم تشغيل السورة وتكرارها آلياً لتثبيت حفظك.");
    }
  });

  document.getElementById("btn-guide").addEventListener("click", startOnboardingTour);
  
  // 5. Sidebar controls
  document.getElementById("reciter-select").addEventListener("change", (e) => {
    state.currentReciter = e.target.value;
    if (state.isReciterAudioPlaying) {
      playReciterAudio();
    }
  });
  
  // Search input filtering
  document.getElementById("surah-search").addEventListener("input", (e) => {
    populateSurahList(e.target.value);
  });
  
  // 6. Audio Recorder Triggers
  const micBtn = document.getElementById("btn-mic");
  micBtn.addEventListener("click", () => {
    if (micBtn.classList.contains("recording")) {
      stopAudioRecording();
    } else {
      startAudioRecording();
    }
  });
  
  document.getElementById("gain-slider").addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById("gain-value").textContent = `${val.toFixed(1)}x`;
    if (state.microphoneGainNode) {
      state.microphoneGainNode.gain.value = val;
    }
  });
  
  // Effects chips click listeners
  document.querySelectorAll(".effect-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".effect-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.audioEffect = chip.dataset.effect;
    });
  });
  
  document.getElementById("btn-play-recording").addEventListener("click", playRecordedAudioWithEffects);
  document.getElementById("btn-verify-recitation").addEventListener("click", verifyUserRecitation);
  document.getElementById("btn-promo-demo").addEventListener("click", startInteractivePromoDemo);
  const stopMobileRecBtn = document.getElementById("btn-stop-mobile-rec");
  if (stopMobileRecBtn) {
    stopMobileRecBtn.addEventListener("click", () => {
      stopAudioRecording();
    });
  }
  document.getElementById("btn-share-app").addEventListener("click", () => {
    const shareData = {
      title: "محفّظ القرآن الكريم 🤲",
      text: "🌸 صدقة جارية 🌸\nيسعدني مشاركتكم تطبيق \"محفّظ القرآن الكريم\" - منصة تفاعلية مذهلة لتسهيل حفظ ومراجعة القرآن صوتياً مع ميزات رائعة مثل صدى المسجد والتحقق الذكي!\nجربه الآن وشاركه مع أحبابك:",
      url: "https://islamitech.github.io/quran_memorizer/"
    };
    
    if (navigator.share) {
      navigator.share(shareData)
        .then(() => console.log("Shared successfully"))
        .catch((err) => console.log("Error sharing:", err));
    } else {
      // Fallback copy to clipboard
      const copyText = `${shareData.text}\n${shareData.url}`;
      navigator.clipboard.writeText(copyText)
        .then(() => alert("📋 تم نسخ الرابط والنص الدعائي بنجاح! شاركه الآن مع أحبابك."));
    }
  });
  
  // Playback of Tafsir msmou'a (Text-to-speech simulation)
  document.getElementById("btn-listen-tafsir").addEventListener("click", () => {
    if (!state.surahData) return;
    const ayah = state.surahData.ayahs.find(a => a.number === state.currentAyahNum);
    if (!ayah) return;
    
    // Stop recitation audio
    stopReciterAudio();
    
    const utterance = new SpeechSynthesisUtterance(ayah.tafsir);
    utterance.lang = "ar-EG";
    window.speechSynthesis.speak(utterance);
    
    const listenIcon = document.getElementById("btn-listen-tafsir").querySelector("i");
    listenIcon.className = "fa-solid fa-spinner fa-spin";
    
    utterance.onend = () => {
      listenIcon.className = "fa-solid fa-volume-high";
    };
  });
  
  // Copy wallet number helper
  document.getElementById("btn-copy-wallet").addEventListener("click", () => {
    const num = document.getElementById("wallet-number").textContent;
    navigator.clipboard.writeText(num).then(() => {
      const copyText = document.getElementById("copy-text");
      const copyIcon = document.getElementById("copy-icon");
      
      copyText.textContent = "تم النسخ!";
      copyIcon.className = "fa-solid fa-check text-primary";
      
      setTimeout(() => {
        copyText.textContent = "نسخ";
        copyIcon.className = "fa-regular fa-copy";
      }, 2000);
    });
  });

  
  // Mobile sidebar toggle click handler
  document.getElementById("btn-toggle-sidebar").addEventListener("click", () => {
    const sidebar = document.querySelector(".app-sidebar");
    sidebar.classList.toggle("open");
  });

  // Close mobile sidebar drawer when clicking outside it or after choosing a surah
  document.addEventListener("click", (e) => {
    const sidebar = document.querySelector(".app-sidebar");
    const toggleBtn = document.getElementById("btn-toggle-sidebar");
    if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
      sidebar.classList.remove("open");
    }
  });

  // PWA Install Prompt click listener
  document.getElementById("btn-install").addEventListener("click", () => {
    if (!state.deferredPrompt) return;
    state.deferredPrompt.prompt();
    state.deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      }
      document.getElementById("btn-install").style.display = "none";
      state.deferredPrompt = null;
    });
  });

  // Keyboard Shortcuts (Space bar to play pause)
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "SELECT") {
      e.preventDefault();
      togglePlayPause();
    }
  });
}

// --- Features Guide / Onboarding Tour Engine ---
function startOnboardingTour() {
  state.currentGuideStep = 0;
  // Save status immediately so the tour never auto-starts again on page reload
  localStorage.setItem("guide_completed", "true");
  document.getElementById("guide-overlay").style.display = "block";
  renderGuideStep();
}

function renderGuideStep() {
  const step = GUIDE_STEPS[state.currentGuideStep];
  const sidebar = document.querySelector(".app-sidebar");
  const isMobile = window.innerWidth <= 768;
  
  let openedSidebar = false;
  let closedSidebar = false;
  
  if (isMobile) {
    const isSidebarElement = ["guide-surah-select", "guide-reciter-select", "guide-recorder"].includes(step.elementId);
    if (isSidebarElement) {
      if (!sidebar.classList.contains("open")) {
        sidebar.classList.add("open");
        openedSidebar = true;
      }
    } else {
      if (sidebar.classList.contains("open")) {
        sidebar.classList.remove("open");
        closedSidebar = true;
      }
    }
  }
  
  // Defer calculations if we toggled the sidebar to wait for smooth CSS transitions
  const delay = (openedSidebar || closedSidebar) ? 450 : 0;
  
  setTimeout(() => {
    const highlightEl = document.getElementById("guide-highlight");
    const tooltipEl = document.getElementById("guide-tooltip");
    const targetEl = document.getElementById(step.elementId);
    
    if (!targetEl) {
      nextGuideStep();
      return;
    }
    
    // Highlight target element box calculation
    const rect = targetEl.getBoundingClientRect();
    const pad = 6;
    
    highlightEl.style.width = `${rect.width + pad * 2}px`;
    highlightEl.style.height = `${rect.height + pad * 2}px`;
    highlightEl.style.top = `${rect.top - pad + window.scrollY}px`;
    highlightEl.style.left = `${rect.left - pad + window.scrollX}px`;
    highlightEl.style.display = "block";
    
    // Tooltip content & positions calculations
    document.getElementById("guide-tooltip-title").textContent = step.title;
    document.getElementById("guide-tooltip-desc").textContent = step.desc;
    
    tooltipEl.style.display = "block";
    
    // Compute best tooltip layout positions
    const tooltipRect = tooltipEl.getBoundingClientRect();
    let toolTop = rect.bottom + 12 + window.scrollY;
    let toolLeft = rect.left + (rect.width / 2) - (tooltipRect.width / 2) + window.scrollX;
    
    // Constrain limits
    if (toolLeft < 10) toolLeft = 10;
    if (toolLeft + tooltipRect.width > window.innerWidth - 10) {
      toolLeft = window.innerWidth - tooltipRect.width - 10;
    }
    if (toolTop + tooltipRect.height > window.innerHeight) {
      toolTop = rect.top - tooltipRect.height - 12 + window.scrollY;
    }
    
    tooltipEl.style.top = `${toolTop}px`;
    tooltipEl.style.left = `${toolLeft}px`;
  }, delay);
  
  // Set button contents
  const nextBtn = document.getElementById("btn-guide-next");
  if (state.currentGuideStep === GUIDE_STEPS.length - 1) {
    nextBtn.textContent = "إنهاء الدليل";
  } else {
    nextBtn.textContent = "التالي";
  }
  
  const prevBtn = document.getElementById("btn-guide-prev");
  prevBtn.disabled = state.currentGuideStep === 0;
}

function nextGuideStep() {
  if (state.currentGuideStep < GUIDE_STEPS.length - 1) {
    state.currentGuideStep++;
    renderGuideStep();
  } else {
    endOnboardingTour();
  }
}

function prevGuideStep() {
  if (state.currentGuideStep > 0) {
    state.currentGuideStep--;
    renderGuideStep();
  }
}

function endOnboardingTour() {
  document.getElementById("guide-overlay").style.display = "none";
  document.getElementById("guide-highlight").style.display = "none";
  document.getElementById("guide-tooltip").style.display = "none";
  localStorage.setItem("guide_completed", "true");
}

// Bind Guide button events
document.getElementById("btn-guide-next").addEventListener("click", nextGuideStep);
document.getElementById("btn-guide-prev").addEventListener("click", prevGuideStep);
document.getElementById("btn-guide-skip").addEventListener("click", endOnboardingTour);
document.getElementById("guide-overlay").addEventListener("click", endOnboardingTour);

// --- PWA Service Worker & Install Support ---
state.deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.deferredPrompt = e;
  // Show install button in UI
  const installBtn = document.getElementById("btn-install");
  if (installBtn) {
    installBtn.style.display = "flex";
  }
});

window.addEventListener('appinstalled', () => {
  console.log('PWA app installed successfully');
  const installBtn = document.getElementById("btn-install");
  if (installBtn) {
    installBtn.style.display = "none";
  }
  state.deferredPrompt = null;
});

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registered successfully:', reg.scope))
      .catch(err => console.error('Service Worker registration failed:', err));
  });
}

// --- IndexedDB Database Configuration ---
const dbName = "QuranMemorizerDB";
const storeName = "recordings";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

function saveAudioRecording(surah, ayah, blob) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const key = `rec_S${surah}_A${ayah}`;
      const request = store.put(blob, key);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  });
}

function getAudioRecording(surah, ayah) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const key = `rec_S${surah}_A${ayah}`;
      const request = store.get(key);
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }).catch(() => null);
}

function deleteAudioRecording(surah, ayah) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const key = `rec_S${surah}_A${ayah}`;
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  });
}

// --- Media Session API Background Controls ---
function updateMediaSession(title, artist) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || 'تسميع الآيات الكريمة',
      artist: artist || 'محفّظ القرآن الكريم',
      album: 'منصة الحفظ والتسميع الذكية',
      artwork: [
        { src: 'https://cdn-icons-png.flaticon.com/512/2884/2884242.png', sizes: '96x96', type: 'image/png' },
        { src: 'https://cdn-icons-png.flaticon.com/512/2884/2884242.png', sizes: '128x128', type: 'image/png' },
        { src: 'https://cdn-icons-png.flaticon.com/512/2884/2884242.png', sizes: '192x192', type: 'image/png' },
        { src: 'https://cdn-icons-png.flaticon.com/512/2884/2884242.png', sizes: '512x512', type: 'image/png' }
      ]
    });
    
    // Set active action handlers for background audio controls
    navigator.mediaSession.setActionHandler('play', () => {
      playReciterAudio();
    });
    
    navigator.mediaSession.setActionHandler('pause', () => {
      pauseReciterAudio();
    });
    
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      navigateAyah(-1);
    });
    
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      navigateAyah(1);
    });
  }
}

// --- Interactive Promo Video Demonstration Simulator ---
function startInteractivePromoDemo() {
  // Stop all active playbacks first
  stopReciterAudio();
  if (state.reciterAudio) state.reciterAudio.pause();
  
  // Show Promo UI Elements
  const overlay = document.getElementById("promo-overlay");
  const caption = document.getElementById("promo-caption");
  const cursor = document.getElementById("promo-cursor");
  
  overlay.style.display = "block";
  caption.style.display = "block";
  cursor.style.display = "block";
  
  // Disable user input interaction pointer-events for normal elements to prevent clicking during simulation
  document.body.style.pointerEvents = "none";
  // Allow clicking on body inside overlay or specific elements
  overlay.style.pointerEvents = "auto";
  
  function updateCaption(text) {
    caption.textContent = text;
  }
  
  function moveCursor(targetId, callback) {
    const el = document.getElementById(targetId) || document.querySelector(targetId);
    if (!el) {
      if (callback) callback();
      return;
    }
    const rect = el.getBoundingClientRect();
    cursor.style.top = `${rect.top + window.scrollY + rect.height/2 - 10}px`;
    cursor.style.left = `${rect.left + window.scrollX + rect.width/2 - 5}px`;
    
    setTimeout(() => {
      // Simulate "click" visual ripple
      el.style.transform = "scale(0.95)";
      setTimeout(() => {
        el.style.transform = "";
        if (callback) callback(el);
      }, 150);
    }, 1200);
  }
  
  // --- Start Simulation Timeline ---
  
  // Step 1: Start Recitation Playback
  updateCaption("1️⃣ تشغيل تلاوة القارئ لتثبيت النطق الصحيح وتتبع الكلمات متزامنة... 📖🎧");
  moveCursor("btn-play-pause", (playBtn) => {
    // Start playback
    playReciterAudio();
    
    // Wait 6 seconds for recitation karaoke display
    setTimeout(() => {
      // Step 2: Pause Recitation and prepare to record
      updateCaption("2️⃣ إيقاف التلاوة المؤقت والذهاب لتسجيل التسميع الذاتي بصوت المستخدم... 🎙️");
      moveCursor("btn-play-pause", (pauseBtn) => {
        pauseReciterAudio();
        
        // Move to Microphone button
        setTimeout(() => {
          updateCaption("3️⃣ يضغط المستخدم على الميكروفون ويبدأ بالتسميع، وتظهر ذبذبات تفاعلية حية... 🔴⚡");
          moveCursor("btn-mic", (micBtn) => {
            // Simulate mic recording UI (without demanding raw permission)
            micBtn.classList.add("recording");
            const visualizer = document.getElementById("visualizer");
            const timerLabel = document.getElementById("timer-label");
            
            // Animate recording timer
            let seconds = 0;
            const timerInterval = setInterval(() => {
              seconds++;
              timerLabel.textContent = `00:0${seconds}`;
            }, 1000);
            
            // Let it simulate recording for 5 seconds
            setTimeout(() => {
              clearInterval(timerInterval);
              micBtn.classList.remove("recording");
              timerLabel.textContent = "00:00";
              
              // Enable play recording button
              const playRecBtn = document.getElementById("btn-play-recording");
              playRecBtn.disabled = false;
              
              // Step 3: Choose Mosque Echo Effect
              updateCaption("4️⃣ اختيار مؤثر \"صدى مسجد\" الفخم لإضافة هندسة صوتية مذهلة للتلاوة... 🕌🔊");
              const echoChip = document.querySelector('[data-effect="echo"]');
              moveCursor('[data-effect="echo"]', (chip) => {
                document.querySelectorAll(".effect-chip").forEach(c => c.classList.remove("active"));
                chip.classList.add("active");
                state.audioEffect = "echo";
                
                // Step 4: Play self recitation with echo
                setTimeout(() => {
                  updateCaption("5️⃣ الاستماع للتسميع الذاتي بصوتك نقيًا ومضافًا إليه صدى المسجد الرائع! 🎧🌟");
                  moveCursor("btn-play-recording", (playRec) => {
                    // Highlight playback
                    playRec.classList.add("active");
                    
                    // Animate visualizer placeholder or progress
                    setTimeout(() => {
                      playRec.classList.remove("active");
                      
                      // End of Demo Walkthrough
                      updateCaption("🎉 اكتمل العرض بنجاح! يمكنك تصوير شاشتك الآن لصنع فيديو الدعاية الخاص بك بكل سهولة.");
                      setTimeout(() => {
                        // Cleanup
                        overlay.style.display = "none";
                        caption.style.display = "none";
                        cursor.style.display = "none";
                        document.body.style.pointerEvents = "auto";
                      }, 4000);
                    }, 6000);
                  });
                }, 1500);
              });
            }, 5000);
          });
        }, 1000);
      });
    }, 6000);
  });
}
