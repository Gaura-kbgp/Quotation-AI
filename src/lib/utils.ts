import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import stringSimilarity from 'string-similarity';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * ENTERPRISE SKU NORMALIZATION (v21.0)
 * 1. Convert to uppercase
 * 2. Remove noise tokens: {L}, {R}, X [number] DP
 * 3. Remove spaces, dashes, and special characters
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  let s = String(sku).toUpperCase();
  
  // Remove noise patterns
  s = s.replace(/\{L\}|\{R\}/g, '');
  s = s.replace(/X\s*\d+\s*DP/g, '');
  s = s.replace(/BUTT|BASE|WALL|DP/g, ''); 
  
  // Keep only alphanumeric
  return s.replace(/[^A-Z0-9]/g, '').trim();
}

/**
 * INTELLIGENT PREFIX MAPPING for PDF Categorization
 * Maps specific prefixes to generalized production categories
 */
export function detectCategory(sku: string): string {
  if (!sku) return 'Accessories';
  const s = String(sku).toUpperCase();
  
  if (s.startsWith('W')) return 'Wall Cabinets';
  if (s.startsWith('SB') || s.startsWith('B') || s.startsWith('DB')) return 'Base Cabinets';
  if (s.startsWith('V')) return 'Vanity Cabinets';
  if (s.startsWith('T') || s.startsWith('P') || s.startsWith('OC')) return 'Tall Cabinets';
  if (s.includes('HINGE') || s.includes('PULL') || s.startsWith('F')) return 'Hinges & Hardware';
  
  return 'Accessories';
}

/**
 * STRIPPED MODEL EXTRACTION
 * Removes trailing numbers to find the base family
 */
export function extractBaseModel(sku: string): string {
  const norm = normalizeSku(sku);
  return norm.replace(/[0-9]+$/g, ''); 
}

/**
 * LEVENSHTEIN DISTANCE for similarity fallback
 */
export function getLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
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
