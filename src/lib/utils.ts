
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * UNIFIED SKU NORMALIZATION (v9.0)
 * strictly following estimator rules:
 * 1. Convert to uppercase
 * 2. Remove text inside parentheses (e.g. "FL48 (VOIDS)" -> "FL48")
 * 3. Remove leading architectural quantity callouts (e.g. "1-QM8" -> "QM8")
 * 4. Remove cabinetry takeoff suffixes (BUTT, LD, RD, BLD, REV, HNG)
 * 5. Strip ALL special characters (dots, dashes, slashes, spaces)
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  let s = sku.toString().toUpperCase();
  
  // 1. Remove content within parentheses
  s = s.replace(/\([^)]*\)/g, '');
  
  // 2. Remove leading "Number-" callouts (e.g. "1-QM8" -> "QM8", "4-BTK8" -> "BTK8")
  s = s.replace(/^\d+[\s\-]+/, '');

  // 3. Remove common cabinetry takeoff markers/suffixes
  const markers = ['BUTT', 'LD', 'RD', 'BLD', 'REV', 'HNG', 'VOIDS'];
  markers.forEach(m => {
    const regex = new RegExp(m, 'g');
    s = s.replace(regex, '');
  });

  // 4. Strip all special characters and whitespace to get base alphanumeric string
  s = s.replace(/[^A-Z0-9]/g, '');
  
  return s.trim();
}

/**
 * Intelligent Base SKU identification.
 */
export function getBaseSku(sku: string): string {
  return normalizeSku(sku);
}
