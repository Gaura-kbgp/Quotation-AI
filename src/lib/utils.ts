import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import stringSimilarity from 'string-similarity';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * ENTERPRISE SKU NORMALIZATION (v21.0)
 * 
 * Level 1: "Identity" - Preserves suffixes for exact technical matching.
 * Level 2: "Model" - Strips suffixes for base-unit matching.
 */
export function normalizeSku(sku: string | any, stripSuffixes = false): string {
  if (!sku) return '';
  let s = String(sku).toUpperCase().trim();
  
  // Remove architectural noise (quantity markers like "1-", "4-")
  s = s.replace(/^[0-9]+-/, '');
  
  if (stripSuffixes) {
    // Noise words that don't change the physical price in most catalogs
    s = s.replace(/BUTT|BASE|WALL|DP|CABINET|DOOR|S/g, '');
  }
  
  // Final clean: remove non-alphanumeric
  return s.replace(/[^A-Z0-9]/g, '').trim();
}

/**
 * TOKEN-BASED DIMENSION EXTRACTION
 * Splits W3624X24 into [36, 24, 24]
 */
export function tokenizeSku(sku: string): string[] {
  const norm = normalizeSku(sku, true);
  return norm.match(/[0-9]+/g) || [];
}

/**
 * CATEGORY DETECTION LOGIC (v21.0)
 * Expanded to handle architectural cabinetry prefixes properly.
 */
export function detectCategory(sku: string, context?: string): string {
  const s = normalizeSku(sku, true);
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
 * Uses string-similarity (Sorensen-Dice) and boosts for matching dimensions.
 */
export function calculateSimilarity(input: string, database: string): number {
  const s1 = normalizeSku(input, true);
  const s2 = normalizeSku(database, true);

  if (s1 === s2) return 1.0;
  
  let score = stringSimilarity.compareTwoStrings(s1, s2);

  // Dimension-Aware Boost
  const tokens1 = tokenizeSku(input);
  const tokens2 = tokenizeSku(database);
  
  if (tokens1.length > 0 && tokens2.length > 0) {
    // Check if the primary numbers (width/height) match exactly
    const matchingTokens = tokens1.filter(t => tokens2.includes(t));
    if (matchingTokens.length >= Math.min(tokens1.length, 2)) {
      score += 0.15; // Heavy boost for matching cabinetry dimensions
    }
  }

  // Prefix Match Boost (e.g. B24 matching B24-RD)
  if (s2.startsWith(s1) || s1.startsWith(s2)) {
    score += 0.1;
  }

  return Math.min(score, 1.0);
}

export function isNumeric(val: any): boolean {
  return !isNaN(parseFloat(val)) && isFinite(val);
}
