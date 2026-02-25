
import * as XLSX from 'xlsx';

/**
 * Advanced cabinetry specification parser.
 * Detects collection headers, door styles, and maps them to SKUs and pricing.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const specs: any[] = [];
  
  // Regex for SKU validation: Alpha-numeric codes (relaxed to allow spaces/hyphens for raw extraction)
  const skuRegex = /^[A-Z0-9 -.]+$/i;

  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    // Use header: 1 to get a raw array of arrays
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    // Ignore small or empty sheets
    if (data.length < 5) return;

    // STEP 1 & 2: Detect Collection Headers and Door Styles
    const collections: { name: string, colIndex: number }[] = [];
    const doorStyles: { [colIndex: number]: string } = {};

    // Scan top 5 rows for Collection Labels (be more aggressive)
    // We look for cells that are usually merged headers
    for (let r = 0; r <= 4; r++) {
      const row = data[r];
      if (!row) continue;
      for (let c = 1; c < row.length; c++) {
        const val = String(row[c] || '').trim();
        // Skip common UI/utility labels
        if (val && val.length > 1 && !['SKU', 'CODE', 'PRICE', 'QTY'].includes(val.toUpperCase())) {
          // Check if this column already has a collection (avoid duplicates from multi-line headers)
          if (!collections.some(coll => coll.colIndex === c)) {
            collections.push({ name: val, colIndex: c });
          }
        }
      }
    }

    // PRODUCTION VALIDATION
    if (collections.length === 0) {
      console.warn(`[Parser] No collections detected in sheet: ${sheetName}`);
    }
    
    if (collections.length > 100) {
      throw new Error(`[Parser] Incorrect header detection: Found ${collections.length} potential collections. Ensure column A contains SKUs and header rows are cleaned.`);
    }

    // Scan for Door Styles (usually located in a specific row below collections, or repeating)
    // We'll search for the row that contains the most non-empty cells which isn't the SKU row
    let maxStyles = 0;
    let styleRowIdx = -1;
    for (let r = 1; r < 10; r++) {
      const row = data[r];
      if (!row) continue;
      const count = row.filter(cell => String(cell || '').trim().length > 0).length;
      if (count > maxStyles) {
        maxStyles = count;
        styleRowIdx = r;
      }
    }

    if (styleRowIdx !== -1) {
      const styleRow = data[styleRowIdx];
      for (let c = 1; c < styleRow.length; c++) {
        const val = String(styleRow[c] || '').trim();
        if (val) doorStyles[c] = val;
      }
    }

    // STEP 3: Detect SKU Data Starting Point
    let skuStartRow = -1;
    const markers = ['STANDARD WALL CABINETS', 'SKU', 'CODE', 'MODEL', 'CABINET CODE'];
    for (let i = 0; i < data.length; i++) {
      const firstCell = String(data[i][0] || '').toUpperCase();
      if (markers.some(m => firstCell.includes(m))) {
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
      
      // Filter valid SKU codes - ignore headers/labels that made it into column A
      if (!skuRegex.test(rawSku) || rawSku.length < 2 || rawSku.length > 30) continue;
      if (markers.includes(rawSku.toUpperCase())) continue;
      
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
            sku: rawSku.toUpperCase().replace(/\s/g, ''), // Normalize SKU for matching
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
