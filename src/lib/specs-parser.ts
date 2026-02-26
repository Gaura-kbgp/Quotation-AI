
import * as XLSX from 'xlsx';

/**
 * Adaptive Grid-Matrix Parser (v12.0)
 * Optimized for cabinetry price books with Row 1 = Collections, Row 2 = Door Styles.
 * Specifically handles multi-block sheets and merged fill-forward logic.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    
    if (rawData.length < 2) continue;

    let currentSkuColIdx = -1;
    let stickyDoorStyleRow: any[] = [];
    let stickyCollectionRow: any[] = [];

    const isHeaderAnchor = (row: any[]) => {
      if (!row || !Array.isArray(row)) return -1;
      return row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim();
        return val === "SKU" || val === "MODEL" || val === "ITEM" || val === "PART #" || val === "CODE";
      });
    };

    const isTitleRow = (str: string) => {
      const s = String(str || "").toUpperCase();
      // Skip very long descriptive title rows or generic "Pricing" headers
      return s.length > 120 || s.includes("PRICING GUIDE") || s.includes("CABINETRY CATALOG");
    };

    for (let r = 0; r < rawData.length; r++) {
      const row = rawData[r];
      const anchorIdx = isHeaderAnchor(row);

      // If we find a new SKU header anchor, update our mapping context
      if (anchorIdx !== -1) {
        currentSkuColIdx = anchorIdx;
        
        // Dynamic Header Check: Look at Rows 1 and 2 if we are at the top,
        // otherwise look immediately above the detected SKU row.
        const rowAbove1 = r > 0 ? rawData[r - 1] : [];
        const rowAbove2 = r > 1 ? rawData[r - 2] : [];

        // Validate if these rows contain headers
        const hasStyles = rowAbove1.some(c => String(c).trim().length > 0);
        
        if (hasStyles) {
          stickyDoorStyleRow = rowAbove1;
          stickyCollectionRow = rowAbove2;
          console.log(`[Parser] Found SKU anchor at Row ${r + 1}. Mapping Door Styles from Row ${r} and Collections from Row ${r-1}.`);
        } else if (stickyDoorStyleRow.length === 0) {
          // Fallback to absolute Row 1/2 if the immediate rows are empty
          stickyDoorStyleRow = rawData[1] || [];
          stickyCollectionRow = rawData[0] || [];
          console.log(`[Parser] Immediate headers empty at Row ${r+1}. Falling back to absolute Row 1/2.`);
        }
        continue;
      }

      if (currentSkuColIdx === -1) continue;

      const rawSku = row[currentSkuColIdx];
      const skuStr = String(rawSku || "").trim();

      // Skip rows without SKUs or the header row itself
      if (!skuStr || isHeaderAnchor(row) !== -1 || skuStr.length < 1) continue;

      // Scan all columns to the right of the SKU
      for (let c = currentSkuColIdx + 1; c < row.length; c++) {
        // Find Door Style (Fill-Forward for merged cells)
        let doorStyle = "";
        for (let i = c; i >= currentSkuColIdx + 1; i--) {
          const val = String(stickyDoorStyleRow[i] || "").trim();
          if (val && !isTitleRow(val)) {
            doorStyle = val;
            break;
          }
        }
        
        if (!doorStyle) continue;

        // Find Collection (Fill-Forward for merged cells)
        let collection = "";
        for (let i = c; i >= currentSkuColIdx + 1; i--) {
          const val = String(stickyCollectionRow[i] || "").trim();
          if (val && !isTitleRow(val)) {
            collection = val;
            break;
          }
        }
        
        const finalCollection = collection || sheetName;
        const rawPrice = row[c];
        
        // Only process cells with actual numbers
        if (rawPrice !== null && rawPrice !== undefined && rawPrice !== "") {
          const priceStr = String(rawPrice || "").replace(/[^0-9.]/g, "");
          const price = parseFloat(priceStr);

          if (!isNaN(price) && price > 0) {
            pricing.push({
              manufacturer_id: manufacturerId,
              collection_name: finalCollection.trim(),
              door_style: doorStyle.trim(),
              sku: skuStr,
              price: price,
              raw_source_file_id: fileId,
              created_at: new Date().toISOString()
            });
          }
        }
      }
    }
  }

  console.log(`[Specs Parser] Success: Extracted ${pricing.length} pricing records.`);
  return pricing;
}
