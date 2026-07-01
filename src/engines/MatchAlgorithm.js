import { TextNormalizer } from './TextNormalizer.js';

export class MatchAlgorithm {
  constructor() {
    this.similarityThreshold = 0.8;
    this.wordWeight = 1.0;
    this.phraseWeight = 0.7;
    this.sequenceWeight = 1.2;
    this.normalizer = new TextNormalizer();
  }
  
  calculateMatchScore(spoken, reference) {
    const spokenClean = this.normalizer.normalize(spoken, {
      removeDiacritics: true,
      unifyLetters: true
    });
    const refClean = this.normalizer.normalize(reference, {
      removeDiacritics: true,
      unifyLetters: true
    });
    
    const spokenWords = spokenClean.split(' ');
    const refWords = refClean.split(' ');
    
    const scores = {
      wordOverlap: this.calculateWordOverlap(spokenWords, refWords),
      sequenceMatch: this.calculateSequenceMatch(spokenWords, refWords),
      lengthRatio: this.calculateLengthRatio(spokenWords, refWords),
      phoneticSimilarity: this.calculatePhoneticSimilarity(spokenClean, refClean)
    };
    
    const totalScore = 
      scores.wordOverlap * this.wordWeight +
      scores.sequenceMatch * this.sequenceWeight +
      scores.lengthRatio * 0.3 +
      scores.phoneticSimilarity * 0.5;
    
    const finalScore = totalScore / (this.wordWeight + this.sequenceWeight + 0.3 + 0.5);
    
    return Math.min(Math.max(finalScore, 0), 1);
  }
  
  calculateWordOverlap(spokenWords, refWords) {
    if (spokenWords.length === 0 || refWords.length === 0) return 0;
    
    const spokenSet = new Set(spokenWords);
    const refSet = new Set(refWords);
    
    let intersection = 0;
    for (const word of spokenSet) {
      if (refSet.has(word)) intersection++;
    }
    
    const union = spokenSet.size + refSet.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
  
  calculateSequenceMatch(spokenWords, refWords) {
    const lcs = this.longestCommonSubsequence(spokenWords, refWords);
    const maxLength = Math.max(spokenWords.length, refWords.length);
    return maxLength > 0 ? lcs.length / maxLength : 0;
  }
  
  longestCommonSubsequence(arr1, arr2) {
    const dp = Array(arr1.length + 1).fill(null).map(() => 
      Array(arr2.length + 1).fill(0)
    );
    
    for (let i = 1; i <= arr1.length; i++) {
      for (let j = 1; j <= arr2.length; j++) {
        if (arr1[i-1] === arr2[j-1]) {
          dp[i][j] = dp[i-1][j-1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
        }
      }
    }
    
    const result = [];
    let i = arr1.length, j = arr2.length;
    while (i > 0 && j > 0) {
      if (arr1[i-1] === arr2[j-1]) {
        result.unshift(arr1[i-1]);
        i--; j--;
      } else if (dp[i-1][j] > dp[i][j-1]) {
        i--;
      } else {
        j--;
      }
    }
    
    return result;
  }

  calculateLengthRatio(spokenWords, refWords) {
    const min = Math.min(spokenWords.length, refWords.length);
    const max = Math.max(spokenWords.length, refWords.length);
    if(max === 0) return 0;
    return min / max;
  }
  
  calculatePhoneticSimilarity(text1, text2) {
    const phoneticMap = {
      'ت': 'ت', 'ث': 'ت',
      'ح': 'ح', 'خ': 'ح',
      'ذ': 'ز', 'ظ': 'ز',
      'ص': 'س', 'ض': 'س',
      'ط': 'ت', 'ظ': 'ز',
      'ع': 'ع', 'غ': 'ع'
    };
    
    const phonetize = (text) => {
      let result = '';
      for (const char of text) {
        result += phoneticMap[char] || char;
      }
      return result;
    };
    
    const phon1 = phonetize(text1);
    const phon2 = phonetize(text2);
    
    const set1 = new Set(phon1);
    const set2 = new Set(phon2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    
    const maxLen = Math.max(set1.size, set2.size);
    if(maxLen === 0) return 0;
    return intersection.size / maxLen;
  }
}
