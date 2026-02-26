import * as XLSX from 'xlsx';
import { normalizeSku } from './utils';

/**
 * Adaptive Grid-Matrix Parser (v11.0)
 * Specifically designed for cabinetry price books with repeating header blocks.
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
        return val === "SKU" || val === "MODEL" || val === "ITEM" || val === "PART #" || val === "CODE";
      });
    };

    const isTitleRow = (str: string) => {
      const s = String(str || "").toUpperCase();
      // Only filter out very long title rows, keep actual names
      return s.length > 120;
    };

    for (let r = 0; r < rawData.length; r++) {
      const row = rawData[r];
      const anchorIdx = isHeaderAnchor(row);

      // If we find a new header anchor, update our mapping context
      if (anchorIdx !== -1) {
        currentSkuColIdx = anchorIdx;
        // Search Row-1 and Row-2 relative to where SKU was found
        currentDoorStyleRow = r > 0 ? rawData[r - 1] : [];
        currentCollectionRow = r > 1 ? rawData[r - 2] : [];
        console.log(`[Parser] Found SKU anchor at Row ${r + 1}, searching Row ${r} for Styles and Row ${r-1} for Collections.`);
        continue;
      }

      if (currentSkuColIdx === -1) continue;

      const rawSku = row[currentSkuColIdx];
      const skuStr = String(rawSku || "").trim();

      if (!skuStr || isHeaderAnchor(row) !== -1 || skuStr.length < 1) continue;

      // Scan all columns to the right of the SKU
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

  console.log(`[Specs Parser] Success: Extracted ${pricing.length} pricing records.`);
  return pricing;
}
