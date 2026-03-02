import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function cleanSkuForDisplay(sku: string | any): string {
  if (!sku) return '';
  return String(sku).toUpperCase().trim();
}

export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  // Keep spaces to preserve suffixes like "BUTT" for normalization
  return String(sku).toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
}

export function compressSku(sku: string | any): string {
  if (!sku) return '';
  return String(sku).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Determines if an item is a primary cabinet box.
 * Suffixes like "BUTT" are ignored for the classification check.
 */
export function isPrimaryCabinet(sku: string): boolean {
  const s = String(sku || "").toUpperCase().trim();
  if (!s) return false;
  
  // Box prefixes common in architectural layouts
  const primaryPrefixes = ['W', 'B', 'SB', 'VSB', 'OVD', 'TP', 'PANTRY', 'OVEN', 'REF', 'DW', 'MICRO', 'V', 'SV', 'VB'];
  
  // Check if it starts with a primary prefix followed by a number (typical of cabinet boxes)
  return primaryPrefixes.some(p => {
    const regex = new RegExp(`^${p}\\d+`, 'i');
    return regex.test(s);
  });
}

/**
 * Architectural Categorization Logic.
 * Groups items into sections for the Estimator Review page.
 */
export function detectCategory(sku: string): string {
  if (!sku) return 'Accessories';
  const s = String(sku || "").toUpperCase().trim();
  
  if (s.startsWith('W')) return 'Wall Cabinets';
  if (s.startsWith('SB') || s.startsWith('B') || s.startsWith('VSB')) return 'Base Cabinets';
  if (s.startsWith('V') && !s.startsWith('VSB')) return 'Vanity Cabinets';
  if (s.startsWith('T') || s.startsWith('P') || s.startsWith('O') || s.startsWith('UTIL')) return 'Tall Cabinets';
  if (s.startsWith('UF')) return 'Fillers';
  if (s.startsWith('RR') || s.startsWith('CM') || s.startsWith('M')) return 'Molding';
  if (s.startsWith('HW')) return 'Hardware';
  
  return 'Accessories';
}