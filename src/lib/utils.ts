import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * SKU CLEANING FOR DISPLAY
 * Minimal cleaning for the final invoice.
 * Preserves suffixes like BUTT for professional documentation.
 */
export function cleanSkuForDisplay(sku: string | any): string {
  if (!sku) return '';
  let s = String(sku).toUpperCase();
  s = s.replace(/\s\s+/g, ' ');
  return s.trim();
}

/**
 * SKU NORMALIZATION (v34.0)
 * Aggressive normalization that removes ALL internal spaces.
 * This ensures "UF 342" matches "UF342".
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  return String(sku).toUpperCase().replace(/\s+/g, '');
}

/**
 * BASE SKU EXTRACTION
 * Strips known suffixes for classification.
 */
export function getBaseSku(sku: string): string {
  const norm = normalizeSku(sku);
  // Remove common suffixes for categorization purposes
  let base = norm.replace("BUTT", "").replace(/[LRH]$/, "");
  return base.trim();
}

/**
 * CABINET CLASSIFICATION
 * Uses standard industry prefixes.
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
