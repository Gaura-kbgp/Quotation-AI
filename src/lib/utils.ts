import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * UNIFIED SKU NORMALIZATION (v10.0)
 * strictly following estimator rules:
 * 1. Convert to uppercase
 * 2. Remove text inside parentheses (e.g. "FL48 (VOIDS)" -> "FL48")
 * 3. Remove leading architectural quantity callouts (e.g. "1-QM8" -> "QM8")
 * 4. Strip ALL special characters (dots, dashes, slashes, spaces)
 * 5. PRESERVE "BUTT" - it is a critical alphanumeric pricing marker.
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  let s = sku.toString().toUpperCase();
  
  // 1. Remove content within parentheses (notes/options)
  s = s.replace(/\([^)]*\)/g, '');
  
  // 2. Remove leading "Number-" callouts common in architectural sets (e.g. "1-QM8" -> "QM8")
  s = s.replace(/^\d+[\s\-]+/, '');

  // 3. Strip special characters and whitespace
  // BUTT survives because it is A-Z.
  s = s.replace(/[^A-Z0-9]/g, '');
  
  return s.trim();
}

/**
 * Intelligent Base SKU identification.
 */
export function getBaseSku(sku: string): string {
  return normalizeSku(sku);
}
