import * as XLSX from 'xlsx';

/**
 * Aggressive SKU normalization to ensure drawing codes match price matrix.
 * Removes spaces, dashes, dots, and common cabinetry suffix delimiters like {}, (), [].
 */
function normalizeSku(sku: string): string {
  if (!sku) return '';
  // Convert to string, uppercase, remove anything in brackets/braces/parens, then strip non-alphanumeric
  return String(sku)
    .toUpperCase()
    .replace(/\{.*?\}/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
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
    // Use header: 1 to get a raw array of arrays for structural analysis
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    if (data.length < 5) return;

    console.log(`[Parser] Processing sheet: ${sheetName} with ${data.length} rows.`);

    // 1. Structural Analysis: Find columns that likely contain SKUs and Prices
    let skuCol = 0;
    const collections: { name: string, colIndex: number }[] = [];
    const doorStyles: { [colIndex: number]: string } = {};

    // Scan top rows for markers
    for (let r = 0; r < Math.min(data.length, 20); r++) {
      const row = data[r];
      if (!row) continue;

      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim();
        const upperVal = val.toUpperCase();

        // Detect SKU column
        if (['SKU', 'CODE', 'MODEL', 'ITEM', 'CATALOG #'].includes(upperVal)) {
          skuCol = c;
        }

        // Detect potential Collection/Price columns
        // Typically these are headers like "Elite", "Premium", or actual Door Style names
        if (c > skuCol && val.length > 1 && !['PRICE', 'QTY', 'UOM', 'DESC'].includes(upperVal)) {
          if (!collections.some(coll => coll.colIndex === c)) {
            collections.push({ name: val, colIndex: c });
            doorStyles[c] = val; // Default door style to the column name
          }
        }
      }
    }

    // 2. Data Extraction
    // Determine where actual SKU data starts (look for B24, W30, etc.)
    let startRow = 0;
    for (let r = 0; r < Math.min(data.length, 100); r++) {
      const cell = String(data[r][skuCol] || '').toUpperCase();
      if (cell.startsWith('B') || cell.startsWith('W') || cell.startsWith('S') || cell.startsWith('V')) {
        startRow = r;
        break;
      }
    }

    for (let r = startRow; r < data.length; r++) {
      const row = data[r];
      if (!row || !row[skuCol]) continue;

      const rawSku = String(row[skuCol]).trim();
      const cleanSku = normalizeSku(rawSku);

      if (cleanSku.length < 2) continue;

      collections.forEach(coll => {
        const rawPrice = row[coll.colIndex];
        let price = 0;

        if (typeof rawPrice === 'number') {
          price = rawPrice;
        } else if (typeof rawPrice === 'string') {
          price = parseFloat(rawPrice.replace(/[^0-9.]/g, ''));
        }

        if (price > 0) {
          specs.push({
            manufacturer_id: manufacturerId,
            collection_name: coll.name,
            door_style: doorStyles[coll.colIndex] || 'Standard',
            sku: cleanSku, // Store normalized SKU for matching
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
