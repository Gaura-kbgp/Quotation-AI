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
 * STRICT SKU NORMALIZATION (v29.0)
 * Adheres to "Do NOT modify SKU" rule.
 * 1. Convert to uppercase
 * 2. Trim whitespace
 * 3. Preserve tokens like BUTT, H, etc.
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  // Return exact uppercase trimmed string
  return String(sku).toUpperCase().trim();
}

/**
 * BASE SKU EXTRACTION (Kept for classification logic, but not used for strict matching)
 */
export function getBaseSku(sku: string): string {
  const norm = normalizeSku(sku);
  const match = norm.match(/^([A-Z]+[0-9]+)/);
  return match ? match[1] : norm;
}

/**
 * STRICT CABINET CLASSIFICATION
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
 * SMART SIMILARITY SCORING (Deprecated for Pricing, kept for General AI tasks)
 */
export function calculateSimilarity(input: string, database: string): number {
  const s1 = normalizeSku(input);
  const s2 = normalizeSku(database);
  if (s1 === s2) return 1.0;
  return stringSimilarity.compareTwoStrings(s1, s2);
}
