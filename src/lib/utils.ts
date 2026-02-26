
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * UNIFIED SKU NORMALIZATION (v5.0)
 * 1. Convert to uppercase
 * 2. Remove text inside parentheses (e.g. "FL48 (VOIDS)" -> "FL48")
 * 3. Remove spaces, periods, dashes, slashes
 * 4. Trim extra characters
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  let s = sku.toString().toUpperCase();
  
  // Remove content within parentheses
  s = s.replace(/\([^)]*\)/g, '');
  
  // Remove spaces, dots, dashes, slashes
  s = s.replace(/[\s.\-\/]/g, '');
  
  return s.trim();
}

/**
 * Intelligent Base SKU identification.
 */
export function getBaseSku(sku: string): string {
  return normalizeSku(sku);
}
