import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * UNIFIED SKU NORMALIZATION (v11.0)
 * Optimized for architectural cabinet takeoffs vs price book entries.
 * 1. Convert to uppercase.
 * 2. Remove text inside parentheses (e.g. "FL48 (VOIDS)" -> "FL48").
 * 3. Remove text inside curly braces (e.g. "DWR3 {L}" -> "DWR3").
 * 4. Remove leading architectural quantity callouts (e.g. "1-QM8" -> "QM8").
 * 5. Strip ALL special characters (dots, dashes, slashes, spaces).
 * 6. PRESERVE alphanumeric strings like "BUTT", "LD", "RD".
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  let s = sku.toString().toUpperCase();
  
  // Remove content within parentheses e.g. "B24 (BUTT)" -> "B24"
  s = s.replace(/\([^)]*\)/g, '');
  
  // Remove content within curly braces e.g. "DWR3 {L}" -> "DWR3"
  s = s.replace(/\{[^}]*\}/g, '');
  
  // Remove leading "Qty-" callouts common in architectural sets (e.g. "1-QM8" -> "QM8")
  s = s.replace(/^\d+[\s\-]+/, '');

  // Strip special characters except A-Z and 0-9
  s = s.replace(/[^A-Z0-9]/g, '');
  
  return s.trim();
}

/**
 * Helper to identify if a value is purely numeric (price/qty).
 */
export function isNumeric(val: any): boolean {
  return !isNaN(parseFloat(val)) && isFinite(val);
}
