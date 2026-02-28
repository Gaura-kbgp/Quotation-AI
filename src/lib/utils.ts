import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import stringSimilarity from 'string-similarity';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * SKU CLEANING FOR DISPLAY
 * Minimal cleaning for the final invoice.
 */
export function cleanSkuForDisplay(sku: string | any): string {
  if (!sku) return '';
  let s = String(sku).toUpperCase();
  s = s.replace(/\s\s+/g, ' ');
  return s.trim();
}

/**
 * STRICT SKU NORMALIZATION (v30.0)
 * Adheres to "Do NOT modify SKU" rule.
 * ONLY performs uppercase and trim.
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  return String(sku).toUpperCase().trim();
}

/**
 * BASE SKU EXTRACTION
 * Kept for classification logic.
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
