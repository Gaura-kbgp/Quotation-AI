import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import stringSimilarity from 'string-similarity';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * ENTERPRISE SKU NORMALIZATION (v21.0)
 * 1. Convert to uppercase
 * 2. Remove all spaces/dashes/special characters
 * 3. Keep only A-Z and 0-9
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  return String(sku).toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

/**
 * STRIPPED MODEL EXTRACTION
 * For "Structure" matching fallbacks (e.g. B24BUTT -> B24)
 */
export function extractBaseModel(sku: string): string {
  const norm = normalizeSku(sku);
  // Remove common suffixes that don't change the base unit code
  return norm.replace(/BUTT|BASE|WALL|DP|CABINET|DOOR|LD|RD|L|R|H|S$/g, '');
}

/**
 * LEVENSHTEIN DISTANCE
 * Measures the edit distance between two strings.
 */
export function getLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * TOKEN-BASED DIMENSION EXTRACTION
 */
export function tokenizeSku(sku: string): string[] {
  const norm = normalizeSku(sku);
  return norm.match(/[0-9]+/g) || [];
}

/**
 * CATEGORY DETECTION LOGIC
 */
export function detectCategory(sku: string, context?: string): string {
  const s = normalizeSku(sku);
  const c = String(context || "").toUpperCase();

  if (c.includes('ACCESSORY') || s.startsWith('UF') || s.startsWith('F')) return 'ACCESSORY';
  if (s.startsWith('SB') || s.startsWith('VSB')) return 'SINK_BASE';
  if (s.startsWith('W')) return 'WALL';
  if (s.startsWith('B')) return 'BASE';
  if (s.startsWith('V')) return 'VANITY';
  if (s.startsWith('T')) return 'TALL';
  if (s.startsWith('H')) return 'HARDWARE';
  
  return 'OTHER';
}

/**
 * SMART SIMILARITY SCORING (v21.0)
 */
export function calculateSimilarity(input: string, database: string): number {
  const s1 = normalizeSku(input);
  const s2 = normalizeSku(database);

  if (s1 === s2) return 1.0;
  
  let score = stringSimilarity.compareTwoStrings(s1, s2);

  // Dimension-Aware Boost
  const tokens1 = tokenizeSku(input);
  const tokens2 = tokenizeSku(database);
  
  if (tokens1.length > 0 && tokens2.length > 0) {
    const matchingTokens = tokens1.filter(t => tokens2.includes(t));
    if (matchingTokens.length >= Math.min(tokens1.length, 2)) {
      score += 0.15;
    }
  }

  return Math.min(score, 1.0);
}

export function isNumeric(val: any): boolean {
  return !isNaN(parseFloat(val)) && isFinite(val);
}
