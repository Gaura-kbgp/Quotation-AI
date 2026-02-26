
import * as XLSX from 'xlsx';

/**
 * Aggressive SKU normalization to ensure drawing codes match price matrix.
 * Removes spaces, dashes, dots, and other separators.
 */
function normalizeSku(sku: string): string {
  return String(sku || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
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
    // Use header: 1 to get a raw array of arrays
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    // Ignore small or empty sheets
    if (data.length < 5) return;

    console.log(`[Parser] Processing sheet: ${sheetName} with ${data.length} rows.`);

    // STEP 1 & 2: Detect Collection Headers and Door Styles
    const collections: { name: string, colIndex: number }[] = [];
    const doorStyles: { [colIndex: number]: string } = {};

    // Scan top 10 rows for Collection Labels
    for (let r = 0; r <= 10; r++) {
      const row = data[r];
      if (!row) continue;
      for (let c = 1; c < row.length; c++) {
        const val = String(row[c] || '').trim();
        // Skip common UI/utility labels
        if (val && val.length > 1 && !['SKU', 'CODE', 'PRICE', 'QTY', 'MODEL'].includes(val.toUpperCase())) {
          if (!collections.some(coll => coll.colIndex === c)) {
            collections.push({ name: val, colIndex: c });
          }
        }
      }
    }

    // Scan for Door Styles (search rows 1-15 for the row with most labels)
    let maxStyles = 0;
    let styleRowIdx = -1;
    for (let r = 1; r < 15; r++) {
      const row = data[r];
      if (!row) continue;
      const count = row.filter(cell => String(cell || '').trim().length > 1).length;
      if (count > maxStyles) {
        maxStyles = count;
        styleRowIdx = r;
      }
    }

    if (styleRowIdx !== -1) {
      const styleRow = data[styleRowIdx];
      for (let c = 1; c < styleRow.length; c++) {
        const val = String(styleRow[c] || '').trim();
        if (val && val.length > 1) doorStyles[c] = val;
      }
    }

    // STEP 3: Detect SKU Data Starting Point
    let skuStartRow = -1;
    const markers = ['STANDARD WALL', 'SKU', 'CODE', 'MODEL', 'CABINET', 'B24', 'W30'];
    for (let i = 0; i < Math.min(data.length, 50); i++) {
      const firstCell = String(data[i][0] || '').toUpperCase();
      if (markers.some(m => firstCell.includes(m))) {
        skuStartRow = i + 1;
        break;
      }
    }

    // Fallback if marker not found
    if (skuStartRow === -1) skuStartRow = 5;

    console.log(`[Parser] Detected ${collections.length} collections. Data starts at row ${skuStartRow}`);

    // STEP 4: Extract SKU x Collection Matrix
    for (let i = skuStartRow; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[0]) continue;

      const rawSku = String(row[0]).trim();
      
      // Filter valid SKU codes
      if (rawSku.length < 2 || rawSku.length > 40) continue;
      
      // Aggressive normalization - ensures match regardless of format
      const cleanSku = normalizeSku(rawSku);
      
      // Map valid SKU to each detected collection column
      collections.forEach(coll => {
        const rawPrice = row[coll.colIndex];
        const price = typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice || '').replace(/[^0-9.]/g, ''));
        
        // Only save if pricing data exists
        if (!isNaN(price) && price > 0) {
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

  console.log(`[Parser] Successfully extracted ${specs.length} line items for Manufacturer: ${manufacturerId}`);
  return specs;
}
