
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * UNIFIED SKU NORMALIZATION (v15.0)
 * Precision mapping for architectural takeoffs.
 * 1. Strips quantity prefixes (1-B24 -> B24).
 * 2. Strips architectural comments in (), {}, or [].
 * 3. Removes all dots, dashes, and spaces.
 * 4. Preserves critical designations like BUTT, LD, RD, SD.
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  let s = sku.toString().toUpperCase().trim();
  
  // Remove content within any brackets e.g. "B24 (BUTT)" -> "B24"
  s = s.replace(/\([^)]*\)/g, '');
  s = s.replace(/\{[^}]*\}/g, '');
  s = s.replace(/\[[^\]]*\]/g, '');
  
  // Remove leading architectural quantity callouts (e.g. "1-QM8" -> "QM8")
  s = s.replace(/^\d+[\s\-]+/, '');

  // Strip all non-alphanumeric characters but keep the rest
  s = s.replace(/[^A-Z0-9]/g, '');
  
  return s.trim();
}

/**
 * Helper to identify if a value is purely numeric (price/qty).
 */
export function isNumeric(val: any): boolean {
  return !isNaN(parseFloat(val)) && isFinite(val);
}
