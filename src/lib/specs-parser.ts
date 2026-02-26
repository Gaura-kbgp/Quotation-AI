
import * as XLSX from 'xlsx';
import { normalizeSku } from './utils';

/**
 * Precision Grid-Matrix Parser (v11.0)
 * Optimized for Cabinetry Price Books with relative header detection.
 * Logic:
 * 1. Find the "SKU" header row.
 * 2. Door Styles are almost always in the row immediately ABOVE the SKU header.
 * 3. Collections are almost always in the row ABOVE the Door Styles.
 * 4. Merged cells are handled via fill-forward scanning.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // Use raw data to maintain grid structure
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    
    if (rawData.length < 2) continue;

    // STEP 1: Find the SKU column to establish our grid boundaries
    let skuColIdx = -1;
    let headerRowIdx = -1;

    // Search first 20 rows for the anchor
    for (let r = 0; r < Math.min(rawData.length, 20); r++) {
      const row = rawData[r];
      if (!row) continue;
      const idx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim();
        return val === "SKU" || val === "MODEL" || val === "ITEM" || val === "PART #";
      });
      if (idx !== -1) {
        skuColIdx = idx;
        headerRowIdx = r;
        break;
      }
    }

    if (skuColIdx === -1) {
      console.log(`[Parser] Skipped sheet "${sheetName}": No SKU anchor found.`);
      continue;
    }

    // STEP 2: Map the headers RELATIVE to the SKU row
    // Door Styles = Row immediately above SKU
    // Collections = Row above Door Styles
    const doorStyleRowIdx = headerRowIdx - 1;
    const collectionRowIdx = headerRowIdx - 2;

    const collectionRow = collectionRowIdx >= 0 ? rawData[collectionRowIdx] : [];
    const doorStyleRow = doorStyleRowIdx >= 0 ? rawData[doorStyleRowIdx] : [];

    const dataRows = rawData.slice(headerRowIdx + 1);

    // Helper to check if a string is a title row (too long or contains generic pricing text)
    const isTitleRow = (str: string) => {
      const s = str.toUpperCase();
      return s.includes("PRICING") || s.includes("CATALOG") || s.includes("EFFECTIVE") || s.includes("GUIDE") || s.length > 60;
    };

    // STEP 3: Process every data row
    for (const row of dataRows) {
      const rawSku = row[skuColIdx];
      if (!rawSku || String(rawSku).trim() === "") continue;

      // Skip sub-headers or empty data
      const skuStr = String(rawSku).trim();
      if (skuStr.toUpperCase() === "SKU" || skuStr.length < 2) continue;

      // STEP 4: Iterate through all columns to the right of SKU
      for (let c = skuColIdx + 1; c < row.length; c++) {
        // Find Door Style with fill-forward for merged cells
        let doorStyle = "";
        for (let i = c; i >= skuColIdx + 1; i--) {
          const val = String(doorStyleRow[i] || "").trim();
          if (val && !isTitleRow(val)) {
            doorStyle = val;
            break;
          }
        }
        
        // If no door style found in the header row, it's not a pricing column
        if (!doorStyle) continue;

        // Find Collection with fill-forward
        let collection = "";
        for (let i = c; i >= skuColIdx + 1; i--) {
          const val = String(collectionRow[i] || "").trim();
          if (val && !isTitleRow(val)) {
            collection = val;
            break;
          }
        }
        
        // Fallback to sheet name if collection is missing or invalid
        const finalCollection = collection || sheetName;

        const rawPrice = row[c];
        const priceStr = String(rawPrice || "").replace(/[^0-9.]/g, "");
        const price = parseFloat(priceStr);

        if (!isNaN(price) && price > 0) {
          pricing.push({
            manufacturer_id: manufacturerId,
            collection_name: finalCollection,
            door_style: doorStyle,
            sku: skuStr,
            price: price,
            raw_source_file_id: fileId,
            created_at: new Date().toISOString()
          });
        }
      }
    }
  }

  console.log(`[Specs Parser] Success: Extracted ${pricing.length} precise records.`);
  return pricing;
}
