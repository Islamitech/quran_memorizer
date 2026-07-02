import { TextNormalizer } from './TextNormalizer.js';

export class MatchAlgorithm {
  constructor() {
    this.normalizer = new TextNormalizer();
  }
  
  calculateMatchScore(spoken, reference) {
    const normalizeOpts = { removeDiacritics: true, unifyLetters: true };
    
    const spokenClean = this.normalizer.normalize(spoken, normalizeOpts);
    const refClean = this.normalizer.normalize(reference, normalizeOpts);
    
    const spokenWords = spokenClean.split(' ').filter(w => w.length > 0);
    const refWords = refClean.split(' ').filter(w => w.length > 0);
    
    if (refWords.length === 0) return 0;
    if (spokenWords.length === 0) return 0;
    
    // حساب الكلمات المتطابقة في الترتيب بناءً على الفحص المرن الجديد
    const lcsLength = this.lcsCount(spokenWords, refWords);
    
    // Primary score: what fraction of reference words were spoken in order
    const orderScore = lcsLength / refWords.length;
    
    // Secondary score: استخدام الفحص المرن لتجنب مشاكل بتر نهاية الكلمات
    const refSet = new Set(refWords);
    const spokenSet = new Set(spokenWords);
    let presentCount = 0;
    
    for (const refWord of refSet) {
      for (const spokenWord of spokenSet) {
        if (this.isWordMatch(spokenWord, refWord)) {
          presentCount++;
          break;
        }
      }
    }
    const presenceScore = presentCount / refSet.size;
    
    // Completeness penalty: if spoken text is much shorter than reference
    const completeness = Math.min(spokenWords.length / refWords.length, 1.0);
    
    // Final score: weighted combination
    const finalScore = (orderScore * 0.6) + (presenceScore * 0.3) + (completeness * 0.1);
    
    return Math.min(Math.max(finalScore, 0), 1);
  }
  
  /**
   * دالة مطابقة ذكية تحل مشكلة بتر الحروف الأخيرة والأخطاء الإملائية البسيطة
   */
  isWordMatch(spoken, ref) {
    if (spoken === ref) return true;
    
    // حل مشكلة بتر نهاية الكلمة (مثل قبول "للمت" كجزء صح من "للمتقين")
    if (ref.startsWith(spoken) && spoken.length >= 3) return true;
    if (spoken.startsWith(ref) && ref.length >= 3) return true;
    
    // فحص الأخطاء الإملائية الخفيفة (فرق حرف واحد فقط في الكلمات الطويلة)
    if (this.getLevenshteinDistance(spoken, ref) <= 1 && ref.length > 3) return true;
    
    return false;
  }

  /**
   * خوارزمية حساب مسافة الاختلاف الحرفي بين كلمتين
   */
  getLevenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // استبدال
            matrix[i][j - 1] + 1,     // إضافة
            matrix[i - 1][j] + 1      // حذف
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }
  
  /**
   * تعديل حساب الترتيب ليعتمد على الدالة المرنة الجديدة
   */
  lcsCount(arr1, arr2) {
    const m = arr1.length;
    const n = arr2.length;
    
    let prev = new Array(n + 1).fill(0);
    let curr = new Array(n + 1).fill(0);
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (this.isWordMatch(arr1[i - 1], arr2[j - 1])) {
          curr[j] = prev[j - 1] + 1;
        } else {
          curr[j] = Math.max(prev[j], curr[j - 1]);
        }
      }
      [prev, curr] = [curr, prev];
      curr.fill(0);
    }
    
    return prev[n];
  }
}