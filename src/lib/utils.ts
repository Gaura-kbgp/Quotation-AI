import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * PRODUCTION-GRADE CABINETRY SKU NORMALIZATION
 * Standardizes SKU strings across the entire KABS platform.
 * Strips spaces, dashes, and architectural notes for precise matching.
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  return String(sku)
    .toUpperCase()
    // 1. Remove architectural notes in brackets, parens, or curly braces
    .replace(/\{.*?\}/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    // 2. Remove spaces and dashes as per Step 2
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    // 3. Remove common cabinetry takeoff suffixes that follow a pattern
    .replace(/(BUTT|LEFT|RIGHT|DOOR|HINGE|REVERSE|REV|BLD|LD|RD|L|R|W|D|H)$/, '')
    .trim();
}

/**
 * Intelligent Base SKU identification.
 * Strips common hand/note markers that are often added by estimators 
 * but are not present in the manufacturer's base price book.
 */
export function getBaseSku(sku: string): string {
  const normalized = normalizeSku(sku);
  // Strip common trailing handedness/height markers
  return normalized.replace(/(LD|RD|REV|L|R|BLD|BUTT|H|W|D)$/, '');
}
