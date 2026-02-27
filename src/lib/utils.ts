import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import stringSimilarity from 'string-similarity';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * ENTERPRISE SKU NORMALIZATION (v22.0)
 * 1. Convert to uppercase
 * 2. Remove noise tokens: {L}, {R}, X [number] DP
 * 3. Remove all non-alphanumeric characters
 */
export function normalizeSku(sku: string | any): string {
  if (!sku) return '';
  let s = String(sku).toUpperCase();
  
  // Remove noise tokens
  s = s.replace(/\{L\}|\{R\}/g, '');
  s = s.replace(/X\s*\d+\s*DP/g, '');
  s = s.replace(/BUTT|BASE|WALL|DP/g, '');
  
  // Remove all non-alphanumeric
  return s.replace(/[^A-Z0-9]/g, '').trim();
}

/**
 * STRIPPED MODEL EXTRACTION
 * For "Structure" matching fallbacks
 */
export function extractBaseModel(sku: string): string {
  const norm = normalizeSku(sku);
  return norm.replace(/[0-9]+$/g, ''); // Remove trailing numbers for base type
}

/**
 * LEVENSHTEIN DISTANCE
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
  return stringSimilarity.compareTwoStrings(s1, s2);
}

export function detectCategory(sku: string, context?: string): string {
  const s = normalizeSku(sku);
  if (s.startsWith('W')) return 'WALL';
  if (s.startsWith('SB')) return 'SINK_BASE';
  if (s.startsWith('B')) return 'BASE';
  if (s.startsWith('V')) return 'VANITY';
  if (s.startsWith('T')) return 'TALL';
  return 'OTHER';
}
