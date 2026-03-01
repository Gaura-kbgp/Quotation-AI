import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function cleanSkuForDisplay(sku: string | any): string {
  if (!sku) return '';
  return String(sku).toUpperCase().trim();
}

export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  return String(sku).toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

export function compressSku(sku: string | any): string {
  if (!sku) return '';
  return String(sku).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isPrimaryCabinet(sku: string): boolean {
  const s = String(sku || "").toUpperCase().trim();
  if (!s) return false;
  const primaryPrefixes = ['W', 'B', 'SB', 'VSB', 'UF', 'RR', 'OVD', 'TP', 'PANTRY', 'OVEN', 'REF', 'DW', 'MICRO', 'V', 'SV', 'VB'];
  return primaryPrefixes.some(p => s.startsWith(p));
}

export function detectCategory(sku: string): string {
  if (!sku) return 'Accessories';
  const s = String(sku || "").toUpperCase().trim();
  if (s.startsWith('W')) return 'Wall Cabinets';
  if (s.startsWith('SB') || s.startsWith('B') || s.startsWith('VSB')) return 'Base Cabinets';
  if (s.startsWith('V')) return 'Vanity Cabinets';
  if (s.startsWith('T') || s.startsWith('P') || s.startsWith('O') || s.startsWith('UTIL')) return 'Tall Cabinets';
  if (s.startsWith('UF')) return 'Fillers';
  if (s.startsWith('RR') || s.startsWith('CM') || s.startsWith('M')) return 'Molding';
  if (s.startsWith('HW')) return 'Hardware';
  return 'Accessories';
}
