
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import stringSimilarity from 'string-similarity';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * ENTERPRISE SKU NORMALIZATION
 * 1. Convert to uppercase
 * 2. Remove noise words (BUTT, BASE, WALL, DP)
 * 3. Remove all non-alphanumeric characters
 * 4. Trim whitespace
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  return String(sku)
    .toUpperCase()
    .replace(/BUTT|BASE|WALL|DP|CABINET/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

/**
 * TOKEN-BASED DIMENSION EXTRACTION
 * Splits W3624X24 into [36, 24, 24]
 */
export function tokenizeSku(sku: string): string[] {
  const norm = normalizeSku(sku);
  return norm.match(/[0-9]+/g) || [];
}

/**
 * CATEGORY DETECTION LOGIC
 * Identifies the cabinet class based on SKU prefix or sheet context.
 */
export function detectCategory(sku: string, context?: string): string {
  const s = normalizeSku(sku);
  const c = String(context || "").toUpperCase();

  if (c.includes('ACCESSORY') || s.startsWith('UF')) return 'ACCESSORY';
  if (s.startsWith('SB') || s.startsWith('VSB')) return 'SINK_BASE';
  if (s.startsWith('W')) return 'WALL';
  if (s.startsWith('B')) return 'BASE';
  if (s.startsWith('V')) return 'VANITY';
  if (s.startsWith('T')) return 'TALL';
  if (s.startsWith('H')) return 'HARDWARE';
  
  return 'OTHER';
}

/**
 * SMART SIMILARITY SCORING
 * Uses string-similarity (Sorensen-Dice) and boosts for matching dimensions.
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
    if (matchingTokens.length === tokens1.length) {
      score += 0.05; // Significant boost for exact dimensions
    }
  }

  return Math.min(score, 1.0);
}

export function isNumeric(val: any): boolean {
  return !isNaN(parseFloat(val)) && isFinite(val);
}
