
import * as XLSX from 'xlsx';

/**
 * Advanced cabinetry specification parser.
 * Detects collection headers, door styles, and maps them to SKUs and pricing.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const specs: any[] = [];
  
  // Regex for SKU validation: Alpha-numeric codes
  const skuRegex = /^[A-Z0-9 -]+$/i;

  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    // Ignore small or empty sheets
    if (data.length < 5) return;

    // STEP 1 & 2: Detect Collection Headers and Door Styles
    // Heuristic: Search rows 0-2 for Collection Names (horizontal)
    const collections: { name: string, colIndex: number }[] = [];
    const doorStyles: { [colIndex: number]: string } = {};

    // Scan top 3 rows for Collection Labels
    for (let r = 0; r <= 2; r++) {
      const row = data[r];
      if (!row) continue;
      for (let c = 1; c < row.length; c++) {
        const val = String(row[c] || '').trim();
        if (val && val.length > 2) {
          collections.push({ name: val, colIndex: c });
        }
      }
    }

    // PRODUCTION VALIDATION: If we find zero or too many, something is wrong
    if (collections.length === 0) {
      console.warn(`No collections detected in sheet: ${sheetName}`);
    }
    if (collections.length > 50) {
      throw new Error(`Incorrect header detection: Found ${collections.length} potential collections. Please check file format.`);
    }

    // Scan row 3 (Index 3) for Door Styles (often rotated headers)
    const doorStyleRow = data[3] || [];
    for (let c = 1; c < doorStyleRow.length; c++) {
      const val = String(doorStyleRow[c] || '').trim();
      if (val) {
        doorStyles[c] = val;
      }
    }

    // STEP 3: Detect SKU Data Starting Point
    let skuStartRow = -1;
    for (let i = 0; i < data.length; i++) {
      const firstCell = String(data[i][0] || '').toUpperCase();
      // Look for common headers or markers
      if (firstCell.includes('STANDARD WALL CABINETS') || firstCell.includes('SKU') || firstCell.includes('CODE')) {
        skuStartRow = i + 1;
        break;
      }
    }

    // Fallback if marker not found
    if (skuStartRow === -1) skuStartRow = 5;

    // STEP 4: Extract SKU x Collection Matrix
    for (let i = skuStartRow; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[0]) continue;

      const rawSku = String(row[0]).trim();
      
      // Filter valid SKU codes
      if (!skuRegex.test(rawSku) || rawSku.length < 2 || rawSku.length > 25) continue;
      
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
            sku: rawSku,
            price: price,
            raw_source_file_id: fileId,
            created_at: new Date().toISOString()
          });
        }
      });
    }
  });

  console.log(`Parsed ${specs.length} specification records for Manufacturer: ${manufacturerId}`);
  return specs;
}
