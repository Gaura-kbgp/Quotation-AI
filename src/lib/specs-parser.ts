
import * as XLSX from 'xlsx';
import { normalizeSku } from './utils';

/**
 * Adaptive Grid-Matrix Parser (v12.0)
 * Specifically designed for cabinetry price books with repeating header blocks.
 * Logic:
 * 1. Scans rows sequentially.
 * 2. If a row contains "SKU", "MODEL", or "ITEM", it treats it as a NEW header anchor.
 * 3. Updates the active Door Style and Collection mapping based on the rows immediately above the new anchor.
 * 4. Processes data rows until the next anchor or end of sheet.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    
    if (rawData.length < 2) continue;

    let currentSkuColIdx = -1;
    let currentDoorStyleRow: any[] = [];
    let currentCollectionRow: any[] = [];

    const isHeaderAnchor = (row: any[]) => {
      if (!row || !Array.isArray(row)) return -1;
      return row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim();
        return val === "SKU" || val === "MODEL" || val === "ITEM" || val === "PART #";
      });
    };

    const isTitleRow = (str: string) => {
      const s = String(str || "").toUpperCase();
      return s.includes("PRICING") || s.includes("CATALOG") || s.includes("EFFECTIVE") || s.includes("GUIDE") || s.length > 80;
    };

    for (let r = 0; r < rawData.length; r++) {
      const row = rawData[r];
      const anchorIdx = isHeaderAnchor(row);

      // If we find a new header anchor, update our mapping context
      if (anchorIdx !== -1) {
        currentSkuColIdx = anchorIdx;
        currentDoorStyleRow = r > 0 ? rawData[r - 1] : [];
        currentCollectionRow = r > 1 ? rawData[r - 2] : [];
        console.log(`[Parser] Found header anchor at sheet "${sheetName}" row ${r + 1}`);
        continue; // Skip the header row itself
      }

      // If no anchor found yet, skip
      if (currentSkuColIdx === -1) continue;

      const rawSku = row[currentSkuColIdx];
      const skuStr = String(rawSku || "").trim();

      // Skip empty SKU rows or repeated headers
      if (!skuStr || skuStr.toUpperCase() === "SKU" || skuStr.length < 2) continue;

      // Process columns to the right of the SKU
      for (let c = currentSkuColIdx + 1; c < row.length; c++) {
        // Find Door Style (Fill-Forward)
        let doorStyle = "";
        for (let i = c; i >= currentSkuColIdx + 1; i--) {
          const val = String(currentDoorStyleRow[i] || "").trim();
          if (val && !isTitleRow(val)) {
            doorStyle = val;
            break;
          }
        }
        
        if (!doorStyle) continue;

        // Find Collection (Fill-Forward)
        let collection = "";
        for (let i = c; i >= currentSkuColIdx + 1; i--) {
          const val = String(currentCollectionRow[i] || "").trim();
          if (val && !isTitleRow(val)) {
            collection = val;
            break;
          }
        }
        
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
