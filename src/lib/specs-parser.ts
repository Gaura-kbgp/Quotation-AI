
import * as XLSX from 'xlsx';

/**
 * High-Precision Matrix Extraction Engine (v15.0)
 * Optimized for cabinetry price books where:
 * - Row 1 = Collections (Merged cells)
 * - Row 2 = Door Style Groups (Multiple styles per cell, separated by newlines)
 * - Row 3 = SKU Headers
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // Use header: 1 to get raw grid
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    
    if (rawData.length < 3) {
      console.log(`[Parser] Skipping sheet ${sheetName}: Insufficient rows.`);
      continue;
    }

    // 1. Locate the SKU Anchor Row
    let skuRowIdx = -1;
    let skuColIdx = -1;

    for (let r = 0; r < Math.min(rawData.length, 20); r++) {
      const row = rawData[r];
      const foundIdx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim();
        return val === "SKU" || val === "MODEL" || val === "ITEM" || val === "CODE";
      });
      if (foundIdx !== -1) {
        skuRowIdx = r;
        skuColIdx = foundIdx;
        break;
      }
    }

    if (skuRowIdx === -1) {
      console.log(`[Parser] SKU header not found in sheet ${sheetName}.`);
      continue;
    }

    // 2. Identify Header Rows (Relative to SKU Anchor)
    const doorStyleRow = skuRowIdx > 0 ? rawData[skuRowIdx - 1] : [];
    const collectionRow = skuRowIdx > 1 ? rawData[skuRowIdx - 2] : [];

    console.log(`[Parser] Processing sheet: ${sheetName} | Anchor: Row ${skuRowIdx + 1}, Col ${skuColIdx + 1}`);

    // 3. Process Data Rows
    for (let r = skuRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      const rawSku = row[skuColIdx];
      const skuStr = String(rawSku || "").trim();

      // Skip category headers or empty rows
      if (!skuStr || skuStr.length < 1 || skuStr.toUpperCase() === "SKU") continue;

      // Scan all columns to the right of the SKU for prices
      for (let c = skuColIdx + 1; c < row.length; c++) {
        const rawPrice = row[c];
        if (rawPrice === null || rawPrice === undefined || rawPrice === "") continue;

        const priceNum = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ""));
        if (isNaN(priceNum) || priceNum <= 0) continue;

        // Find Collection (Fill-Forward for merged cells)
        let collection = "";
        for (let i = c; i >= skuColIdx + 1; i--) {
          const val = String(collectionRow[i] || "").trim();
          if (val && val.length > 2 && !val.includes("PRICING")) {
            collection = val;
            break;
          }
        }
        if (!collection) collection = sheetName;

        // Find Door Style Group and SPLIT it (v15.0 logic)
        const styleGroupStr = String(doorStyleRow[c] || "").trim();
        if (!styleGroupStr) continue;

        // Split by newlines, commas, or semicolons to handle Price Groups
        const individualStyles = styleGroupStr
          .split(/[\n\r,;]+/)
          .map(s => s.trim())
          .filter(s => s.length > 1);

        for (const style of individualStyles) {
          pricing.push({
            manufacturer_id: manufacturerId,
            collection_name: collection.toUpperCase().replace(/\s+/g, ' '),
            door_style: style.toUpperCase().replace(/\s+/g, ' '),
            sku: skuStr.toUpperCase(),
            price: priceNum,
            raw_source_file_id: fileId,
            created_at: new Date().toISOString()
          });
        }
      }
    }
  }

  console.log(`[Specs Parser] Final Extraction Count: ${pricing.length} pricing points across all sheets.`);
  return pricing;
}
