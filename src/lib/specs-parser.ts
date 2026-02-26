
import * as XLSX from 'xlsx';
import { normalizeSku } from './utils';

/**
 * Precision Grid-Matrix Parser (v9.0)
 * Optimized for Cabinetry Price Books where:
 * - Row 1 (Index 0): Collection Names (B1, C1, D1...)
 * - Row 2 (Index 1): Door Style Names (B2, C2, D2...)
 * - Row 3 (Index 2): Header Row (including "SKU" in Col A)
 * - Row 4+ (Index 3+): Cabinet Data
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    
    if (rawData.length < 4) continue;

    // STEP 1: Find the SKU column to establish our grid boundaries
    let skuColIdx = -1;
    let headerRowIdx = -1;

    for (let r = 0; r < 10; r++) {
      const row = rawData[r];
      if (!row) continue;
      const idx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim();
        return val === "SKU" || val === "MODEL" || val === "ITEM";
      });
      if (idx !== -1) {
        skuColIdx = idx;
        headerRowIdx = r;
        break;
      }
    }

    if (skuColIdx === -1) continue;

    // STEP 2: Map the headers according to user specification
    // B1-G1 (Index 0) = Collections
    // B2-G2 (Index 1) = Door Styles
    const collectionHeaders = rawData[0] || [];
    const doorStyleHeaders = rawData[1] || [];
    const dataRows = rawData.slice(headerRowIdx + 1);

    // STEP 3: Process every data row
    for (const row of dataRows) {
      const rawSku = row[skuColIdx];
      if (!rawSku || String(rawSku).trim() === "") continue;

      // Skip non-data rows that might be sub-headers in the data grid
      const skuStr = String(rawSku).toUpperCase();
      if (skuStr.includes("SKU") || skuStr.includes("PRICE") || (skuStr.includes("DOOR") && row.length < 3)) continue;

      // STEP 4: Iterate through all columns to the right of SKU
      for (let c = skuColIdx + 1; c < row.length; c++) {
        // Find Door Style (Row 2)
        const doorStyle = String(doorStyleHeaders[c] || "").trim();
        if (!doorStyle) continue;

        // Find Collection (Row 1) with fill-forward logic for merged cells
        let collection = "";
        for (let i = c; i >= skuColIdx + 1; i--) {
          const val = String(collectionHeaders[i] || "").trim();
          if (val) {
            collection = val;
            break;
          }
        }
        
        // If no collection found in Row 1, fallback to sheet name
        const finalCollection = collection || sheetName;

        const rawPrice = row[c];
        const priceStr = String(rawPrice || "").replace(/[^0-9.]/g, "");
        const price = parseFloat(priceStr);

        if (!isNaN(price) && price > 0) {
          pricing.push({
            manufacturer_id: manufacturerId,
            collection_name: finalCollection,
            door_style: doorStyle,
            sku: String(rawSku).trim(),
            price: price,
            raw_source_file_id: fileId,
            created_at: new Date().toISOString()
          });
        }
      }
    }
  }

  console.log(`[Specs Parser] Extracted ${pricing.length} grid-matrix records from ${workbook.SheetNames.length} sheets.`);
  return pricing;
}
