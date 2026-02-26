import * as XLSX from 'xlsx';
import { normalizeSku } from './utils';

/**
 * Advanced cabinetry specification parser.
 * Detects collection headers, door styles, and maps them to SKUs and pricing.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const specs: any[] = [];
  
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    if (data.length < 2) return;

    console.log(`[Parser] Processing sheet: ${sheetName} with ${data.length} rows.`);

    let skuCol = -1;
    const collections: { name: string, colIndex: number }[] = [];
    const doorStyles: { [colIndex: number]: string } = {};

    // 1. Find SKU Column - Scan first 100 rows for common headers
    for (let r = 0; r < Math.min(data.length, 100); r++) {
      const row = data[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim().toUpperCase();
        if (['SKU', 'CODE', 'MODEL', 'ITEM', 'CATALOG #', 'PART', 'PRODUCT', 'NAME', 'CABINET', 'UNIT'].includes(val)) {
          skuCol = c;
          break;
        }
      }
      if (skuCol !== -1) break;
    }

    // Fallback SKU detection by scanning for patterns
    if (skuCol === -1) {
      for (let c = 0; c < 5; c++) {
        for (let r = 0; r < Math.min(data.length, 50); r++) {
          const val = String(data[r]?.[c] || '').toUpperCase();
          if (/^[A-Z]{1,3}\d+/.test(val)) {
            skuCol = c;
            break;
          }
        }
        if (skuCol !== -1) break;
      }
    }

    if (skuCol === -1) skuCol = 0;

    // 2. Identify Collection Columns
    for (let r = 0; r < Math.min(data.length, 50); r++) {
      const row = data[r];
      if (!row) continue;
      for (let c = skuCol + 1; c < row.length; c++) {
        const val = String(row[c] || '').trim();
        const upperVal = val.toUpperCase();
        if (val.length > 2 && !['PRICE', 'QTY', 'UOM', 'DESC', 'SKU', 'CODE', 'NOTE', 'EXT', 'UNIT', 'MSRP'].includes(upperVal)) {
          if (!collections.some(coll => coll.colIndex === c)) {
            collections.push({ name: val, colIndex: c });
            doorStyles[c] = val;
          }
        }
      }
    }

    // 3. Find Start Row
    let startRow = 0;
    const cabinetMarkers = ['B', 'W', 'S', 'V', 'T', 'U', 'F', 'R', 'L', 'A', 'P', 'C', 'O', 'M', 'K'];
    for (let r = 0; r < Math.min(data.length, 200); r++) {
      const cell = String(data[r]?.[skuCol] || '').toUpperCase().trim();
      if (cabinetMarkers.some(m => cell.startsWith(m))) {
        startRow = r;
        break;
      }
    }

    // Determine target columns (fallback if no collection headers found)
    let targets = collections;
    if (targets.length === 0) {
      // Look for the first column with numeric data after the SKU column
      for (let c = skuCol + 1; c < (data[startRow]?.length || 20); c++) {
        const val = data[startRow]?.[c];
        if (typeof val === 'number' || (typeof val === 'string' && /^\$?[0-9,.]+$/.test(val))) {
          targets = [{ name: 'Standard', colIndex: c }];
          break;
        }
      }
    }

    for (let r = startRow; r < data.length; r++) {
      const row = data[r];
      if (!row || !row[skuCol]) continue;

      const rawSku = String(row[skuCol]).trim();
      const cleanSku = normalizeSku(rawSku);

      if (cleanSku.length < 2) continue;

      targets.forEach(coll => {
        const rawPrice = row[coll.colIndex];
        let price = 0;
        if (typeof rawPrice === 'number') price = rawPrice;
        else if (typeof rawPrice === 'string') price = parseFloat(rawPrice.replace(/[^0-9.]/g, ''));

        if (price > 0) {
          specs.push({
            manufacturer_id: manufacturerId,
            collection_name: coll.name,
            door_style: doorStyles[coll.colIndex] || 'Standard',
            sku: cleanSku,
            price: price,
            raw_source_file_id: fileId,
            created_at: new Date().toISOString()
          });
        }
      });
    }
  });

  console.log(`[Parser] Successfully extracted ${specs.length} records from all sheets.`);
  return specs;
}
