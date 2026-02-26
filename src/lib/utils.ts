import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * PRODUCTION-GRADE CABINETRY SKU NORMALIZATION
 * Standardizes SKU strings across the entire KABS platform.
 * Ensures that takeoff codes match price book entries regardless of formatting.
 */
export function normalizeSku(sku: string): string {
  if (!sku) return '';
  return String(sku)
    .toUpperCase()
    // 1. Remove architectural notes in brackets or parens
    .replace(/\{.*?\}/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    // 2. Remove common cabinetry takeoff suffixes preceded by space
    .replace(/\s+(BUTT|LEFT|RIGHT|DOOR|HINGE|REVERSE|REV|BLD|LD|RD|L|R|W|D|H)\b/g, '')
    // 3. Strip all non-alphanumeric characters for a clean comparison
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

/**
 * Intelligent Base SKU identification.
 * Strips common hinging and note markers that are often added by estimators 
 * but are not present in the manufacturer's base price book.
 */
export function getBaseSku(sku: string): string {
  const normalized = normalizeSku(sku);
  // Strip common trailing handedness/height markers
  return normalized.replace(/(LD|RD|REV|L|R|BLD|BUTT|H|W|D)$/, '');
}
