import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * STRONG NORMALIZATION (v3.0)
 * Strips everything except letters and numbers.
 * Example: "V S B - 5434 H {R}" -> "VSB5434H"
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  return sku
    ?.toString()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

/**
 * Intelligent Base SKU identification.
 */
export function getBaseSku(sku: string): string {
  return normalizeSku(sku);
}
