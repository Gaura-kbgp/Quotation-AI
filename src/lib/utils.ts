import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * HIGH ACCURACY SKU NORMALIZATION (v18.0)
 * 1. Convert to uppercase
 * 2. Remove noise words (BUTT, BASE, WALL, DP)
 * 3. Handle prefix mapping (SB -> B, etc.)
 * 4. Strip non-alphanumeric characters
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  let s = sku.toString().toUpperCase().trim();
  
  // Remove content within any brackets
  s = s.replace(/\([^)]*\)/g, '');
  s = s.replace(/\{[^}]*\}/g, '');
  s = s.replace(/\[[^\]]*\]/g, '');
  
  // Remove specific noise words as requested
  const noiseWords = ['BUTT', 'BASE', 'WALL', 'DP', 'CABINET'];
  noiseWords.forEach(word => {
    const reg = new RegExp(`\\b${word}\\b`, 'g');
    s = s.replace(reg, '');
  });

  // Intelligent Prefix Mapping
  if (s.startsWith('SB')) s = 'B' + s.substring(2); // Sink Base is a Base
  
  // Strip all non-alphanumeric characters
  s = s.replace(/[^A-Z0-9]/g, '');
  
  return s.trim();
}

/**
 * TOKEN-BASED DIMENSION EXTRACTION
 * Splits W3624X24DP into [W, 36, 24, 24]
 */
export function tokenizeSku(sku: string): string[] {
  const norm = normalizeSku(sku);
  return norm.match(/[A-Z]+|[0-9]+/g) || [];
}

/**
 * LEVENSHTEIN FUZZY SIMILARITY
 * Returns a score between 0 and 1
 */
export function calculateSimilarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  
  const editDistance = (a: string, b: string): number => {
    const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[a.length][b.length];
  };

  return (longerLength - editDistance(longer, shorter)) / longerLength;
}

/**
 * Helper to identify if a value is purely numeric (price/qty).
 */
export function isNumeric(val: any): boolean {
  return !isNaN(parseFloat(val)) && isFinite(val);
}
