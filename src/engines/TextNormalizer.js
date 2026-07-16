export class TextNormalizer {
  constructor() {
    // Extended diacritics regex covering ALL Arabic/Uthmani marks
    this.diacritics = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]/g;
    this.spaceNormalizer = /\s+/g;

    // خريطة الحروف المقطعة لتوسيعها إلى النطق اللفظي المسموع
    this.muqattaahMap = {
      'الم': 'الف لام ميم',
      'المص': 'الف لام ميم صاد',
      'الر': 'الف لام را',
      'المر': 'الف لام ميم را',
      'كهيعص': 'كاف ها يا عين صاد',
      'طه': 'طا ها',
      'طسم': 'طا سين ميم',
      'طس': 'طا سين',
      'يس': 'يا سين',
      'ص': 'صاد',
      'حم': 'حا ميم',
      'عسق': 'عين سين قاف',
      'ق': 'قاف',
      'ن': 'نون'
    };
    this.uthmaniToStandardMap = {
      'الصلوة': 'الصلاة',
      'الصلوت': 'الصلوات',
      'الزكوة': 'الزكاة',
      'السموت': 'السماوات',
      'السموٰت': 'السماوات',
      'ملك': 'مالك',
      'الكتٰب': 'الكتاب',
      'الكتب': 'الكتاب',
      'سليمن': 'سليمان',
      'إسحق': 'إسحاق',
      'إسمعيل': 'إسماعيل',
      'إبرهيم': 'إبراهيم',
      'لقمن': 'لقمان',
      'بينت': 'بينات',
      'الظلمين': 'الظالمين',
      'الظلمون': 'الظالمون',
      'الكفرين': 'الكافرين',
      'الكفرون': 'الكافرون',
      'صبرين': 'صابرين',
      'علمين': 'عالمين',
      'العلمين': 'العالمين',
      'عبدون': 'عابدون',
      'عبدت': 'عبدتم',
      'عبدن': 'عابدين',
      'ذلك': 'ذالك',
      'بذلك': 'بذالك',
      'كذلك': 'كذالك',
      'لكن': 'لاكن',
      'رحمن': 'رحمان',
      'الرحمن': 'الرحمان',
      'اله': 'الاه',
      'الاله': 'الالاه'
    };
  }
  
  normalize(text, options = {}) {
    let result = text;
    
    // Replace superscript/dagger alef with normal alef to preserve the 'aa' sound in Uthmani spelling
    result = result.replace(/\u0670/g, 'ا');
    
    if (options.removeDiacritics !== false) {
      // Remove all Arabic diacritics, tashkeel, Uthmani marks, and tatweel
      result = result.replace(this.diacritics, '');
    }
    
    if (options.removePunctuation !== false) {
      // Remove Quran stop marks and punctuation
      result = result.replace(/[،؛؟!.,:ۖۗۘۙۚۛۜ۞۩﴾﴿⌐¤]/g, '');
      // Remove ayah number markers (circled digits etc.)
      result = result.replace(/[\u06DD]/g, '');
    }

    // فحص وتوسيع الحروف المقطعة المقروءة بناءً على الخريطة اللفظية
    let words = result.split(' ');
    words = words.map(word => this.muqattaahMap[word] || word);
    result = words.join(' ');
    
    if (options.unifyLetters !== false) {
      // Unify all alef variants including alef wasla (ٱ U+0671)
      result = result.replace(/[أإآٱ]/g, 'ا');
      result = result.replace(/ة/g, 'ه');
      result = result.replace(/ؤ/g, 'و');
      result = result.replace(/ئ/g, 'ي');
      result = result.replace(/ى/g, 'ي');
      
      // Unify spelling of disconnected letter phonemes (muqatta'ah)
      result = result.replace(/راء/g, 'را');
      result = result.replace(/هاء/g, 'ها');
      result = result.replace(/ياء/g, 'يا');
      result = result.replace(/طاء/g, 'طا');
      result = result.replace(/حاء/g, 'حا');
    }

    // Normalize Uthmani spelling variants to standard spoken spellings
    let finalWords = result.split(' ');
    finalWords = finalWords.map(word => this.uthmaniToStandardMap[word] || word);
    result = finalWords.join(' ');
    
    if (options.normalizeSpaces !== false) {
      result = result.replace(this.spaceNormalizer, ' ');
      result = result.trim();
    }
    
    return result;
  }
  
  segmentWords(text) {
    const words = text.split(' ');
    const segments = [];
    let currentSegment = '';
    
    for (const word of words) {
      if (word.startsWith('و') || word.startsWith('ف') || word.startsWith('ل')) {
        currentSegment += (currentSegment ? ' ' : '') + word;
      } else if (currentSegment) {
        segments.push(currentSegment);
        currentSegment = word;
      } else {
        currentSegment = word;
      }
    }
    
    if (currentSegment) {
      segments.push(currentSegment);
    }
    
    return segments;
  }
}