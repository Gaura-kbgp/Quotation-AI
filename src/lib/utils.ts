import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * SKU CLEANING FOR DISPLAY
 * Preserves alphanumeric integrity while removing trailing noise.
 */
export function cleanSkuForDisplay(sku: string | any): string {
  if (!sku) return '';
  let s = String(sku).toUpperCase();
  s = s.replace(/\s\s+/g, ' ');
  return s.trim();
}

/**
 * SKU NORMALIZATION (v53.0)
 * Standardizes for strict matching by stripping excessive whitespace and common noise.
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  return String(sku).toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

/**
 * COMPRESSED SKU FOR FUZZY MATCHING
 * Removes ALL non-alphanumeric characters for the "Universal Matcher".
 * Ensures 'UF 342' matches 'UF342' and 'UF-342' perfectly.
 */
export function compressSku(sku: string | any): string {
  if (!sku) return '';
  return String(sku).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * CABINET CLASSIFICATION
 * Detects if a code belongs to the primary cabinet list or accessories.
 */
export function isPrimaryCabinet(sku: string): boolean {
  const s = String(sku || "").toUpperCase().trim();
  if (!s) return false;

  const primaryPrefixes = [
    'W', 'B', 'SB', 'VSB', 'UF', 'RR', 'OVD', 'TP', 'PANTRY', 
    'OVEN', 'REF', 'DW', 'MICRO', 'DRW', 'TALL', 'UTIL', 'WALL', 'BASE', 'V', 'SV', 'VB'
  ];
  return primaryPrefixes.some(p => s.startsWith(p));
}

/**
 * INTELLIGENT PREFIX MAPPING (v53.0)
 * Expanded for high-precision category fallbacks.
 */
export function detectCategory(sku: string): string {
  if (!sku) return 'Accessories';
  const s = String(sku || "").toUpperCase().trim();
  
  if (s.startsWith('W')) return 'Wall Cabinets';
  if (s.startsWith('SB') || s.startsWith('B') || s.startsWith('VSB')) return 'Base Cabinets';
  if (s.startsWith('V')) return 'Vanity Cabinets';
  if (s.startsWith('T') || s.startsWith('P') || s.startsWith('O') || s.startsWith('UTIL')) return 'Tall Cabinets';
  if (s.startsWith('UF')) return 'Fillers';
  if (s.startsWith('RR') || s.startsWith('CM') || s.startsWith('M')) return 'Molding';
  if (s.startsWith('HW')) return 'Hardware';
  
  return 'Accessories';
}
