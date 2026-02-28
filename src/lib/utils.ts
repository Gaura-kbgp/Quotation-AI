import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import stringSimilarity from 'string-similarity';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * DETERMINISTIC SKU NORMALIZATION (v26.0)
 * 1. Convert to uppercase
 * 2. Remove tokens: {L}, {R}, X 24 DP, X 12 DP
 * 3. Remove duplicate spaces
 * 4. Trim
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  let s = String(sku).toUpperCase();
  
  // Remove noise tokens
  s = s.replace(/\{L\}|\{R\}/g, '');
  s = s.replace(/X\s*24\s*DP/g, '');
  s = s.replace(/X\s*12\s*DP/g, '');
  
  // Remove duplicate spaces
  s = s.replace(/\s+/g, ' ');
  
  return s.trim();
}

/**
 * STRICT CABINET PATTERN VALIDATION
 * Checks if a string matches valid cabinet SKU patterns
 */
export function isValidCabinetSku(sku: string): boolean {
  const s = normalizeSku(sku);
  if (!s) return false;

  // Patterns from requirements
  const wallPattern = /^W\d+/;
  const basePattern = /^(B|SB|DB)\d+/;
  const vanityPattern = /^V(SB|S)?\d+/;
  const tallPattern = /^(TP|PANTRY|OVEN|OVD|P|T|OC)\d+/;
  const accessoryPattern = /^(RR|UF|BTK|SM|F)/;

  return (
    wallPattern.test(s) || 
    basePattern.test(s) || 
    vanityPattern.test(s) || 
    tallPattern.test(s) || 
    accessoryPattern.test(s)
  );
}

/**
 * EXCLUSION KEYWORD CHECK
 */
export function isExcludedItem(text: string): boolean {
  const s = String(text).toUpperCase();
  const exclusions = [
    'HOOD', 'RANGE', 'MICRO', 'FRIDGE', 'DISH', 'SINK', 
    'LIGHT', 'ELECTRICAL', 'PRICING', 'MARCH', 'SHEET', 
    'ACCESSORY PRICING', 'DIMENSIONS'
  ];
  return exclusions.some(kw => s.includes(kw));
}

/**
 * INTELLIGENT PREFIX MAPPING for PDF Categorization
 */
export function detectCategory(sku: string): string {
  if (!sku) return 'Accessories';
  const s = String(sku).toUpperCase();
  
  if (s.startsWith('W')) return 'Wall Cabinets';
  if (s.startsWith('SB') || s.startsWith('B') || s.startsWith('DB')) return 'Base Cabinets';
  if (s.startsWith('V')) return 'Vanity Cabinets';
  if (s.startsWith('T') || s.startsWith('P') || s.startsWith('OC')) return 'Tall Cabinets';
  if (s.includes('HINGE') || s.includes('PULL') || s.startsWith('F')) return 'Hardware';
  
  return 'Accessories';
}

/**
 * SMART SIMILARITY SCORING
 */
export function calculateSimilarity(input: string, database: string): number {
  const s1 = normalizeSku(input);
  const s2 = normalizeSku(database);
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  return stringSimilarity.compareTwoStrings(s1, s2);
}
