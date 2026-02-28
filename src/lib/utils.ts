import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import stringSimilarity from 'string-similarity';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * DETERMINISTIC SKU NORMALIZATION (v27.0)
 * 1. Convert to uppercase
 * 2. Remove tokens: {L}, {R}, X 24 DP, X 12 DP
 * 3. Remove internal spaces in the code
 * 4. Trim
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  let s = String(sku).toUpperCase();
  
  // Remove noise tokens
  s = s.replace(/\{L\}|\{R\}/g, '');
  s = s.replace(/X\s*24\s*DP/g, '');
  s = s.replace(/X\s*12\s*DP/g, '');
  
  // Remove spaces inside the code (e.g. "W 30 24" -> "W3024")
  s = s.replace(/\s+/g, '');
  
  return s.trim();
}

/**
 * STRICT CABINET CLASSIFICATION
 * Primary Cabinets must start with specific prefixes.
 */
export function isPrimaryCabinet(sku: string): boolean {
  const s = normalizeSku(sku);
  if (!s) return false;

  const primaryPrefixes = ['W', 'B', 'SB', 'VSB', 'UF', 'RR', 'OVD', 'TP'];
  return primaryPrefixes.some(p => s.startsWith(p));
}

/**
 * OTHER ITEMS KEYWORD CHECK
 */
export function isOtherItem(text: string): boolean {
  const s = String(text).toUpperCase();
  const otherKeywords = [
    'HOOD', 'RANGE', 'MICRO', 'FRIDGE', 'SINK', 'LIGHT', 
    'TRIM', 'CROWN', 'HARDWARE', 'PANEL', 'FILLER', 
    'SM8', 'BTK8', 'PRICING', 'DIMENSIONS', 'SHEET'
  ];
  return otherKeywords.some(kw => s.includes(kw));
}

/**
 * INTELLIGENT PREFIX MAPPING for PDF Categorization
 */
export function detectCategory(sku: string): string {
  if (!sku) return 'Accessories';
  const s = normalizeSku(sku);
  
  if (s.startsWith('W')) return 'Wall Cabinets';
  if (s.startsWith('SB') || s.startsWith('B')) return 'Base Cabinets';
  if (s.startsWith('V')) return 'Vanity Cabinets';
  if (s.startsWith('T') || s.startsWith('P') || s.startsWith('O')) return 'Tall Cabinets';
  
  return 'Accessories';
}

/**
 * SMART SIMILARITY SCORING
 */
export function calculateSimilarity(input: string, database: string): number {
  const s1 = normalizeSku(input);
  const s2 = normalizeSku(database);
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  return stringSimilarity.compareTwoStrings(s1, s2);
}
