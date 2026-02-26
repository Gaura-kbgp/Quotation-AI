import * as XLSX from 'xlsx';
import { normalizeSku } from './utils';

/**
 * Advanced cabinetry specification parser (v3.0).
 * Supports multi-column price grids (one SKU row, multiple door style prices).
 * Scans all sheets and dynamically detects SKU and multiple Price columns.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const specs: any[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // Use header: 1 to get raw rows for manual structural analysis
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    
    if (rows.length < 1) continue;

    console.log(`[Parser] Analyzing sheet: ${sheetName} (${rows.length} rows)`);

    let headerRowIdx = -1;
    let skuColIdx = -1;
    let priceColumns: { idx: number, name: string }[] = [];

    // 1. DYNAMIC STRUCTURE DETECTION
    // Scan the first 50 rows to find the primary SKU header and price grid start
    for (let r = 0; r < Math.min(rows.length, 50); r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;
      
      let tempSkuIdx = -1;
      
      // Identify the SKU/Code column
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim().toUpperCase();
        if (['SKU', 'CODE', 'MODEL', 'ITEM', 'CATALOG', 'PART', 'PRODUCT'].some(k => val === k || val.includes(k))) {
          tempSkuIdx = c;
          break;
        }
      }

      if (tempSkuIdx !== -1) {
        headerRowIdx = r;
        skuColIdx = tempSkuIdx;
        
        // Now identify all columns in this header row that likely contain prices
        // We verify by checking if the columns below contain numeric data
        for (let c = 0; c < row.length; c++) {
          if (c === skuColIdx) continue;
          
          let numericScore = 0;
          const sampleSize = 15;
          for (let checkR = r + 1; checkR < Math.min(rows.length, r + 1 + sampleSize); checkR++) {
            const cell = rows[checkR][c];
            if (typeof cell === 'number' || (typeof cell === 'string' && !isNaN(parseFloat(cell.replace(/[^0-9.]/g, ''))))) {
              numericScore++;
            }
          }

          // If more than 30% of sample rows are numeric, treat as a Price Column (Door Style)
          if (numericScore > (sampleSize * 0.3)) {
            const styleName = String(row[c] || `Style ${c}`).trim();
            priceColumns.push({ idx: c, name: styleName });
          }
        }
        
        if (priceColumns.length > 0) {
          console.log(`[Parser] Found structure at row ${r}: SKU[Col ${skuColIdx}], Prices[${priceColumns.length} styles]`);
          break;
        }
      }
    }

    // 2. FALLBACK DETECTION
    // If no clear headers found, assume first column is SKU and try to find any numeric column
    if (skuColIdx === -1 || priceColumns.length === 0) {
      skuColIdx = 0;
      headerRowIdx = 0;
      for (let c = 1; c < (rows[0]?.length || 0); c++) {
        priceColumns.push({ idx: c, name: `Column ${c}` });
      }
    }

    // 3. DATA EXTRACTION
    const startRow = headerRowIdx + 1;
    for (let r = startRow; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row[skuColIdx]) continue;

      const rawSku = String(row[skuColIdx]).trim();
      if (rawSku.length < 2 || rawSku.toUpperCase() === 'SKU' || rawSku.toUpperCase() === 'MODEL') continue;
      
      const cleanSku = normalizeSku(rawSku);
      if (cleanSku.length < 2) continue;

      // Extract one specification record per detected price column
      for (const col of priceColumns) {
        const rawPrice = row[col.idx];
        let price = 0;
        
        if (typeof rawPrice === 'number') {
          price = rawPrice;
        } else if (typeof rawPrice === 'string') {
          price = parseFloat(rawPrice.replace(/[^0-9.]/g, ''));
        }

        if (price > 0) {
          specs.push({
            manufacturer_id: manufacturerId,
            collection_name: sheetName, // Use sheet name as collection (standard cabinetry practice)
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

  console.log(`[Parser] SUCCESS: Extracted ${specs.length} specifications for manufacturer ${manufacturerId}`);
  return specs;
}
