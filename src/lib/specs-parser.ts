import * as XLSX from 'xlsx';
import { normalizeSku } from './utils';

/**
 * Production-Grade Cabinetry Specification Parser (v4.0).
 * Implements Heuristic Grid Detection to handle complex multi-column price guides.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellNF: false, cellText: false });
  const specs: any[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // header: 1 returns a 2D array [row][col] which is best for structural scanning
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    
    if (rows.length < 2) continue;

    console.log(`[Parser] Analyzing sheet: "${sheetName}" (${rows.length} rows)`);

    let headerRowIdx = -1;
    let skuColIdx = -1;
    let priceColumns: { idx: number, name: string }[] = [];

    // 1. DYNAMIC HEADER & GRID DETECTION
    // Scan the first 100 rows to find the most likely header row
    for (let r = 0; r < Math.min(rows.length, 100); r++) {
      const row = rows[r];
      if (!row || row.length < 2) continue;
      
      let tempSkuIdx = -1;
      const SKU_KEYWORDS = ['SKU', 'CODE', 'MODEL', 'ITEM', 'CATALOG', 'PART', 'PRODUCT', 'DESCRIPTION', 'CABINET'];
      
      // Step A: Find SKU Column
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim().toUpperCase();
        if (SKU_KEYWORDS.some(k => val === k || (val.length > 2 && val.includes(k)))) {
          tempSkuIdx = c;
          break;
        }
      }

      if (tempSkuIdx !== -1) {
        // Step B: Verify this is a header row by looking for prices in the same row or rows below
        const potentialPriceCols: { idx: number, name: string }[] = [];
        const PRICE_KEYWORDS = ['PRICE', 'MSRP', 'LIST', 'COST', 'GROUP', 'STYLE', 'FINISH'];
        
        for (let c = 0; c < row.length; c++) {
          if (c === tempSkuIdx) continue;
          
          const val = String(row[c] || '').trim().toUpperCase();
          const isPriceHeader = PRICE_KEYWORDS.some(k => val.includes(k));
          
          // Sample rows below to see if they are numeric
          let numericCount = 0;
          const sampleSize = 10;
          for (let s = r + 1; s < Math.min(rows.length, r + 1 + sampleSize); s++) {
            const cellVal = rows[s][c];
            if (isNumeric(cellVal)) numericCount++;
          }

          if (isPriceHeader || numericCount > (sampleSize * 0.4)) {
            potentialPriceCols.push({ 
              idx: c, 
              name: String(row[c] || `Price Group ${c}`).trim() 
            });
          }
        }

        if (potentialPriceCols.length > 0) {
          headerRowIdx = r;
          skuColIdx = tempSkuIdx;
          priceColumns = potentialPriceCols;
          break;
        }
      }
    }

    // 2. HEURISTIC FALLBACK
    // If no headers found, find the column with the highest alphanumeric density (SKUs)
    // and the columns with highest numeric density (Prices)
    if (skuColIdx === -1 || priceColumns.length === 0) {
      console.log(`[Parser] Standard headers not found in "${sheetName}". Using heuristic search...`);
      const colStats = rows.slice(0, 50).reduce((acc: any, row) => {
        row.forEach((cell, idx) => {
          if (!acc[idx]) acc[idx] = { numeric: 0, text: 0, filled: 0 };
          if (cell !== "") {
            acc[idx].filled++;
            if (isNumeric(cell)) acc[idx].numeric++;
            else acc[idx].text++;
          }
        });
        return acc;
      }, {});

      // Pick SKU column: High fill, high text/alphanumeric
      let bestSkuIdx = 0;
      let maxScore = -1;
      Object.entries(colStats).forEach(([idx, stat]: [any, any]) => {
        const score = stat.filled + (stat.text * 2);
        if (score > maxScore) {
          maxScore = score;
          bestSkuIdx = parseInt(idx);
        }
      });

      skuColIdx = bestSkuIdx;
      headerRowIdx = 0; // Assume start
      
      // Pick Price columns: High numeric count
      priceColumns = Object.entries(colStats)
        .filter(([idx, stat]: [any, any]) => parseInt(idx) !== skuColIdx && stat.numeric > 5)
        .map(([idx, _]) => ({ idx: parseInt(idx), name: `Price Col ${idx}` }));
    }

    // 3. DATA EXTRACTION
    const startRow = headerRowIdx + 1;
    for (let r = startRow; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row[skuColIdx]) continue;

      const rawSku = String(row[skuColIdx]).trim();
      if (rawSku.length < 2) continue;
      
      // Skip common header-like text that might appear in data rows
      if (['TOTAL', 'SUBTOTAL', 'PAGE', 'SKU', 'MODEL'].some(k => rawSku.toUpperCase().includes(k))) continue;

      const cleanSku = normalizeSku(rawSku);
      if (!cleanSku) continue;

      for (const col of priceColumns) {
        const rawPrice = row[col.idx];
        const price = parsePrice(rawPrice);

        if (price > 0) {
          specs.push({
            manufacturer_id: manufacturerId,
            collection_name: sheetName, // Default to sheet name for context
            door_style: col.name,
            sku: cleanSku,
            price: price,
            raw_source_file_id: fileId,
            created_at: new Date().toISOString()
          });
        }
      }
    }
  }

  console.log(`[Parser] SUCCESS: Extracted ${specs.length} records across ${workbook.SheetNames.length} sheets.`);
  return specs;
}

/**
 * Checks if a value is numeric or currency-formatted.
 */
function isNumeric(val: any): boolean {
  if (typeof val === 'number') return true;
  if (typeof val !== 'string') return false;
  const clean = val.replace(/[^0-9.-]/g, '');
  return clean !== '' && !isNaN(parseFloat(clean));
}

/**
 * Safely parses a price value from various Excel formats.
 */
function parsePrice(val: any): number {
  if (typeof val === 'number') return val;
  if (typeof val !== 'string') return 0;
  const clean = val.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}
