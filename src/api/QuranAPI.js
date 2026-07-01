export class QuranAPIManager {
  constructor() {
    this.cache = new Map();
    this.pendingRequests = new Map();
    this.baseURLs = {
      quran: 'https://api.alquran.cloud/v1',
      audio: 'https://everyayah.com/data',
      tafsir: 'https://api.alquran.cloud/v1/tafsir'
    };
  }

  async fetchSurahWithTranslations(surahId) {
    const cacheKey = `surah_${surahId}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }
    
    const promise = Promise.all([
      this.fetchSurahData(surahId)
    ]).then(([data]) => {
      const result = {
        arabic: this.processArabicText(data),
        metadata: this.extractMetadata(data[0]) // Uthmani is at index 0
      };
      
      this.cache.set(cacheKey, result);
      this.pendingRequests.delete(cacheKey);
      
      return result;
    }).catch(error => {
      this.pendingRequests.delete(cacheKey);
      throw new Error(`Failed to fetch surah ${surahId}: ${error.message}`);
    });
    
    this.pendingRequests.set(cacheKey, promise);
    return promise;
  }
  
  async fetchSurahData(surahId) {
    const res = await fetch(`${this.baseURLs.quran}/surah/${surahId}/editions/quran-uthmani,ar.muyassar,en.sahih`);
    if (!res.ok) throw new Error('Network response was not ok');
    const json = await res.json();
    return json.data; // Array of 3 editions
  }

  processArabicText(data) {
    const uthmani = data[0];
    const muyassar = data[1];
    const sahih = data[2];

    return uthmani.ayahs.map((ayah, index) => {
      let text = ayah.text;
      // API prepends Basmalah to the first Ayah of all Surahs (except 1 and 9)
      if (ayah.numberInSurah === 1 && uthmani.number !== 1 && uthmani.number !== 9) {
        text = text.replace('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ', '');
        text = text.replace('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ', ''); // Fallback
        // Fallback for any other diacritics
        if (text.startsWith('بِسْمِ')) {
          text = text.split(' ').slice(4).join(' ');
        }
      }
      return {
        id: ayah.numberInSurah,
        text: text,
        textUthmani: text,
        tafsir: muyassar.ayahs[index].text,
        translation: sahih.ayahs[index].text,
        words: this.segmentIntoWords(text),
        audioUrl: this.generateAudioUrl(uthmani.number, ayah.numberInSurah)
      };
    });
  }
  
  segmentIntoWords(text) {
    return text.split(' ');
  }

  extractMetadata(data) {
    return {
      id: data.number,
      name: data.name,
      englishName: data.englishName,
      ayahCount: data.numberOfAyahs,
      revelationType: data.revelationType
    };
  }

  generateAudioUrl(surah, ayah, reciter = 'mishary') {
    const surahPadded = String(surah).padStart(3, '0');
    const ayahPadded = String(ayah).padStart(3, '0');
    
    const reciters = {
      'fares': 'Fares_Abbad_64kbps',
      'minshawi_muallim': 'Minshawy_Teacher_128kbps',
      'mishary': 'Alafasy_128kbps',
      'husary': 'Husary_128kbps',
      'maher': 'MaherAlMuaiqly128kbps',
      'sudais': 'Abdurrahmaan_As-Sudais_192kbps',
      'abdulbasit': 'Abdul_Basit_Mujawwad_128kbps',
      'ayman': 'Ayman_Sowaid_64kbps'
    };
    
    const reciterPath = reciters[reciter] || reciters['mishary'];
    return `${this.baseURLs.audio}/${reciterPath}/${surahPadded}${ayahPadded}.mp3`;
  }
}
