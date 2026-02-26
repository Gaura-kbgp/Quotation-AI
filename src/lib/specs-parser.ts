import * as XLSX from 'xlsx';

/**
 * PRODUCTION-GRADE SKU NORMALIZATION
 * Strips common cabinetry suffixes and estimator notes to find the core part number.
 */
function normalizeSku(sku: string): string {
  if (!sku) return '';
  return String(sku)
    .toUpperCase()
    // 1. Remove anything in {}, [], () which are often estimator notes
    .replace(/\{.*?\}/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    // 2. Remove common cabinetry suffixes preceded by space
    .replace(/\s+(BUTT|LEFT|RIGHT|DOOR|HINGE|REVERSE|REV|BLD|LD|RD|L|R)\b/g, '')
    // 3. Final alphanumeric strip for matching
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

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

    // 1. Find SKU Column
    for (let r = 0; r < Math.min(data.length, 50); r++) {
      const row = data[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim().toUpperCase();
        if (['SKU', 'CODE', 'MODEL', 'ITEM', 'CATALOG #', 'PART', 'PRODUCT', 'NAME'].includes(val)) {
          skuCol = c;
          break;
        }
      }
      if (skuCol !== -1) break;
    }

    // Fallback SKU detection
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
    for (let r = 0; r < Math.min(data.length, 30); r++) {
      const row = data[r];
      if (!row) continue;
      for (let c = skuCol + 1; c < row.length; c++) {
        const val = String(row[c] || '').trim();
        const upperVal = val.toUpperCase();
        if (val.length > 1 && !['PRICE', 'QTY', 'UOM', 'DESC', 'SKU', 'CODE', 'NOTE'].includes(upperVal)) {
          if (!collections.some(coll => coll.colIndex === c)) {
            collections.push({ name: val, colIndex: c });
            doorStyles[c] = val;
          }
        }
      }
    }

    // 3. Extraction
    let startRow = 0;
    const cabinetMarkers = ['B', 'W', 'S', 'V', 'T', 'U', 'F', 'R', 'L', 'A', 'P', 'C', 'O'];
    for (let r = 0; r < Math.min(data.length, 100); r++) {
      const cell = String(data[r]?.[skuCol] || '').toUpperCase().trim();
      if (cabinetMarkers.some(m => cell.startsWith(m)) && /\d+/.test(cell)) {
        startRow = r;
        break;
      }
    }

    // Determine target columns (fallback to first numeric col if no collection headers)
    let targets = collections;
    if (targets.length === 0) {
      for (let c = skuCol + 1; c < (data[startRow]?.length || 10); c++) {
        const val = data[startRow]?.[c];
        if (typeof val === 'number') {
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

  console.log(`[Parser] Successfully extracted ${specs.length} records.`);
  return specs;
}
