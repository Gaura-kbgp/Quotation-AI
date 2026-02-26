
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * UNIFIED SKU NORMALIZATION (v7.0)
 * strictly following estimator rules:
 * 1. Convert to uppercase
 * 2. Remove text inside parentheses (e.g. "FL48 (VOIDS)" -> "FL48")
 * 3. Remove spaces, periods, dashes, slashes, quotes
 * 4. Remove leading quantity callouts (e.g. "1-QM8" -> "QM8")
 * 5. Remove common suffixes like "BUTT" to allow base matching
 * 6. Trim extra characters
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  let s = sku.toString().toUpperCase();
  
  // Remove content within parentheses
  s = s.replace(/\([^)]*\)/g, '');
  
  // Specific architectural fix: Remove leading "Number-" callouts common in drawings
  // e.g. "1-QM8" -> "QM8", "4 - LIGHT RAIL" -> "LIGHT RAIL"
  s = s.replace(/^\d+[\s\-]+/, '');

  // Remove common cabinetry takeoff markers that shouldn't affect base pricing
  s = s.replace(/BUTT/g, '');
  s = s.replace(/LD/g, '');
  s = s.replace(/RD/g, '');

  // Remove spaces, dots, dashes, slashes, quotes
  s = s.replace(/[\s.\-\/\"]/g, '');
  
  return s.trim();
}

/**
 * Intelligent Base SKU identification.
 */
export function getBaseSku(sku: string): string {
  return normalizeSku(sku);
}
