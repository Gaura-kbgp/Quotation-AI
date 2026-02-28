import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import stringSimilarity from 'string-similarity';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * SKU CLEANING FOR DISPLAY
 * Removes tokens like {L}, {R}, but keeps "BUTT" and sizes for the final invoice.
 */
export function cleanSkuForDisplay(sku: string | any): string {
  if (!sku) return '';
  let s = String(sku).toUpperCase();
  s = s.replace(/\{L\}|\{R\}/g, '');
  s = s.replace(/X\s*24\s*DP/g, '');
  s = s.replace(/X\s*12\s*DP/g, '');
  s = s.replace(/\s\s+/g, ' ');
  return s.trim();
}

/**
 * DETERMINISTIC SKU NORMALIZATION FOR MATCHING (v28.0)
 * Used for database lookups and pricing engine matching.
 * 1. Convert to uppercase
 * 2. Remove tokens: {L}, {R}, X 24 DP, BUTT
 * 3. Remove all internal spaces
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  let s = String(sku).toUpperCase();
  
  // Remove noise tokens
  s = s.replace(/\{L\}|\{R\}/g, '');
  s = s.replace(/X\s*24\s*DP/g, '');
  s = s.replace(/X\s*12\s*DP/g, '');
  s = s.replace(/\s*BUTT\b/g, ''); 
  
  // Remove all internal spaces for a stable key
  s = s.replace(/\s+/g, '');
  
  return s.trim();
}

/**
 * BASE SKU EXTRACTION
 * Removes trailing characters to find the core model number.
 * Example: UF342H -> UF342
 */
export function getBaseSku(sku: string): string {
  const norm = normalizeSku(sku);
  // Match prefix and digits, ignore trailing letters often used for variants
  const match = norm.match(/^([A-Z]+[0-9]+)/);
  return match ? match[1] : norm;
}

/**
 * STRICT CABINET CLASSIFICATION
 * Primary Cabinets must start with specific prefixes.
 */
export function isPrimaryCabinet(sku: string): boolean {
  const s = normalizeSku(sku);
  if (!s) return false;

  const primaryPrefixes = ['W', 'B', 'SB', 'VSB', 'UF', 'RR', 'OVD', 'TP', 'PANTRY', 'OVEN'];
  return primaryPrefixes.some(p => s.startsWith(p));
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
