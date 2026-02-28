import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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
 * SKU NORMALIZATION (v36.0)
 * Standard normalization for matching.
 * Preserves words but ensures consistent casing and trimming.
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  // Convert to upper and trim. We keep spaces to allow "SB36 BUTT" exact matches.
  return String(sku).toUpperCase().trim();
}

/**
 * CABINET CLASSIFICATION
 * Updated with expanded prefix list for architectural sets.
 */
export function isPrimaryCabinet(sku: string): boolean {
  const s = normalizeSku(sku);
  if (!s) return false;

  const primaryPrefixes = [
    'W', 'B', 'SB', 'VSB', 'UF', 'RR', 'OVD', 'TP', 'PANTRY', 
    'OVEN', 'REF', 'DW', 'MICRO', 'DRW', 'TALL', 'UTIL', 'WALL', 'BASE', 'V'
  ];
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
