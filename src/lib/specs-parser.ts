import * as XLSX from 'xlsx';
import { normalizeSku } from './utils';

/**
 * Advanced cabinetry specification parser (v2.0).
 * Implements Step 1, 3, and 5 of the requested pricing logic.
 * Scans all sheets and dynamically detects SKU/Price columns.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const specs: any[] = [];
  
  // STEP 1 - READ COMPLETE EXCEL FILE (ALL SHEETS)
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    // Use header: 1 to get raw rows for manual column detection
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    if (rows.length < 2) return;

    console.log(`[Parser] Processing sheet: ${sheetName} (${rows.length} rows)`);

    let skuCol = -1;
    let priceCol = -1;
    let doorStyleCol = -1;
    let headerRowIndex = -1;

    // STEP 3 - DYNAMIC COLUMN DETECTION
    // Scan the first 100 rows to find headers
    for (let r = 0; r < Math.min(rows.length, 100); r++) {
      const row = rows[r];
      if (!row) continue;
      
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim().toUpperCase();
        
        // SKU Column Keywords
        if (skuCol === -1 && ['SKU', 'CODE', 'MODEL', 'ITEM', 'CATALOG', 'PART', 'PRODUCT'].some(k => val.includes(k))) {
          skuCol = c;
        }
        
        // Price Column Keywords
        if (priceCol === -1 && ['PRICE', 'LIST', 'MSRP', 'COST', 'AMOUNT', 'NET'].some(k => val.includes(k))) {
          priceCol = c;
        }

        // Door Style Keywords
        if (doorStyleCol === -1 && ['DOOR', 'STYLE', 'FINISH'].some(k => val.includes(k))) {
          doorStyleCol = c;
        }
      }

      if (skuCol !== -1 && priceCol !== -1) {
        headerRowIndex = r;
        console.log(`[Parser] Headers found at row ${r}: SKU[Col ${skuCol}], Price[Col ${priceCol}]`);
        break;
      }
    }

    // Fallback detection if no headers matched
    if (skuCol === -1) skuCol = 0; 
    if (priceCol === -1) {
      // Find first numeric column after SKU
      const sampleRow = rows[Math.min(rows.length - 1, (headerRowIndex === -1 ? 0 : headerRowIndex) + 5)];
      for (let j = skuCol + 1; j < (sampleRow?.length || 0); j++) {
        if (typeof sampleRow[j] === 'number') { priceCol = j; break; }
      }
    }

    if (priceCol === -1) priceCol = skuCol + 1;

    // STEP 2 & 6 - NORMALIZE AND PREPARE OBJECTS
    const startRow = (headerRowIndex === -1 ? 0 : headerRowIndex + 1);
    for (let r = startRow; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row[skuCol]) continue;

      const rawSku = String(row[skuCol]).trim();
      const cleanSku = normalizeSku(rawSku);
      
      if (cleanSku.length < 2) continue;

      const rawPrice = row[priceCol];
      let price = 0;
      if (typeof rawPrice === 'number') {
        price = rawPrice;
      } else if (typeof rawPrice === 'string') {
        price = parseFloat(rawPrice.replace(/[^0-9.]/g, ''));
      }

      const doorStyle = doorStyleCol !== -1 ? String(row[doorStyleCol] || '').trim() : 'Standard';

      if (price > 0) {
        specs.push({
          manufacturer_id: manufacturerId,
          collection_name: sheetName, // Use Sheet Name as Collection as per Step 1 logic
          door_style: doorStyle,
          sku: cleanSku,
          price: price,
          raw_source_file_id: fileId,
          created_at: new Date().toISOString()
        });
      }
    }
  });

  console.log(`[Parser] Extracted ${specs.length} specifications across all sheets.`);
  return specs;
}
