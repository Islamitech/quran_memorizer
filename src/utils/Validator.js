export class DataValidator {
  static validateAyah(ayah) {
    const schema = {
      id: (val) => Number.isInteger(val) && val > 0,
      text: (val) => typeof val === 'string' && val.length > 0,
      numberInSurah: (val) => Number.isInteger(val) && val > 0,
      surahId: (val) => Number.isInteger(val) && val >= 1 && val <= 114
    };
    
    return this.validateObject(ayah, schema);
  }
  
  static validateSurah(surah) {
    const schema = {
      id: (val) => Number.isInteger(val) && val >= 1 && val <= 114,
      name: (val) => typeof val === 'string' && val.length > 0,
      nameArabic: (val) => typeof val === 'string' && val.length > 0,
      ayatCount: (val) => Number.isInteger(val) && val > 0,
      type: (val) => ['meccan', 'medinan'].includes(val),
      ayahs: (val) => Array.isArray(val) && val.every(a => this.validateAyah(a))
    };
    
    return this.validateObject(surah, schema);
  }
  
  static validateObject(obj, schema) {
    for (const [key, validator] of Object.entries(schema)) {
      if (!(key in obj)) {
        return false;
      }
      if (!validator(obj[key])) {
        return false;
      }
    }
    return true;
  }
  
  static sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    let sanitized = input.replace(/<[^>]*>/g, '');
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/['"\\]/g, '');
    
    return sanitized.trim();
  }
}
