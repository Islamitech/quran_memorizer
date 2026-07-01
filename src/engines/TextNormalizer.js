export class TextNormalizer {
  constructor() {
    this.arabicMap = {
      'أ': 'ا', 'إ': 'ا', 'آ': 'ا',
      'ة': 'ه',
      'ؤ': 'و', 'ئ': 'ي',
      'ى': 'ي'
    };
    
    this.diacritics = /[\u0617-\u061A\u064B-\u0652\u06D6-\u06ED]/g;
    this.specialChars = /[ًٌٍَُِّْٰٖٜٟٗ٘ٙٚٛٝٞ]/g;
    this.spaceNormalizer = /\s+/g;
  }
  
  normalize(text, options = {}) {
    let result = text;
    
    if (options.removeDiacritics !== false) {
      result = result.replace(this.diacritics, '');
      result = result.replace(this.specialChars, '');
    }
    
    if (options.unifyLetters !== false) {
      result = result.replace(/[أإآ]/g, 'ا');
      result = result.replace(/ة/g, 'ه');
      result = result.replace(/ؤ/g, 'و');
      result = result.replace(/ئ/g, 'ي');
      result = result.replace(/ى/g, 'ي');
    }
    
    if (options.removePunctuation !== false) {
      result = result.replace(/[،؛؟!.،:ۖۗۘۙۚۛ]/g, '');
    }
    
    if (options.normalizeSpaces !== false) {
      result = result.replace(this.spaceNormalizer, ' ');
      result = result.trim();
    }
    
    if (options.removeRepeatedChars !== false) {
      result = result.replace(/(.)\1{2,}/g, '$1');
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
