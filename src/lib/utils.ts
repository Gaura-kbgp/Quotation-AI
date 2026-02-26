import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * STRONG NORMALIZATION (v4.0)
 * Strips EVERYTHING except letters and numbers.
 * Essential for matching architectural takeoffs to price books.
 * Example: "HOOD CKT.30" -> "HOODCKT30"
 * Example: "V S B - 5434 H {R}" -> "VSB5434H"
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  return sku
    ?.toString()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "") // Strips spaces, dots, dashes, and special characters
    .trim();
}

/**
 * Intelligent Base SKU identification.
 */
export function getBaseSku(sku: string): string {
  return normalizeSku(sku);
}
