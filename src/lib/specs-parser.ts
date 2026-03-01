
import * as XLSX from 'xlsx';

/**
 * EXTREME-FLEXIBILITY UNIVERSAL SCANNER (v60.0)
 * 
 * DESIGN PHILOSOPHY:
 * Treat every sheet and every row as a potential independent data source.
 * Use content-based heuristics (Regex for SKUs, Numeric ranges for Prices) 
 * to extract data even when headers are missing, shifted, or inconsistent.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  const skuKeywords = ["SKU", "ITEM SKU", "CODE", "MODEL", "ITEM CODE", "PART NUMBER", "CABINET SKU", "MODEL NUMBER", "ITEM", "SKU#"];
  const priceKeywords = ["PRICE", "LIST PRICE", "LIST", "NET", "COST", "MSRP", "TOTAL", "NET PRICE"];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as any[][];
    if (rows.length < 1) continue;

    const currentSheetName = sheetName.toUpperCase().trim();
    // Auto-detect if this is a specialized accessory or universal sheet
    const isGlobalSheet = currentSheetName.includes("ACCESSORY") || 
                         currentSheetName.includes("OPTION") || 
                         currentSheetName.includes("FILLER") ||
                         currentSheetName.includes("UNIVERSAL") ||
                         currentSheetName.includes("MOLDING") ||
                         currentSheetName.includes("SKU GUIDE");

    console.log(`[Parser v60] Format-Agnostic Scan: ${sheetName} (${rows.length} rows)`);

    let activeSkuColIdx = -1;
    let activePriceColIdx = -1;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length < 2) continue;

      // STAGE 1: DYNAMIC HEADER DISCOVERY
      // We look for headers on every row to handle multi-section sheets
      const foundSkuIdx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim();
        return skuKeywords.some(k => val === k);
      });

      if (foundSkuIdx !== -1) {
        activeSkuColIdx = foundSkuIdx;
        const foundPriceIdx = row.findIndex((cell, idx) => {
          if (idx === activeSkuColIdx) return false;
          const val = String(cell || "").toUpperCase().trim();
          return priceKeywords.some(k => val.includes(k));
        });
        if (foundPriceIdx !== -1) activePriceColIdx = foundPriceIdx;
        continue; // Skip header row itself
      }

      // STAGE 2: ROW-LEVEL CONTENT HEURISTIC
      let extractedSku = "";
      let extractedPrice = 0;

      // Tier A: Check known columns if they were discovered
      if (activeSkuColIdx !== -1 && activePriceColIdx !== -1) {
        extractedSku = String(row[activeSkuColIdx] || "").trim();
        const priceVal = String(row[activePriceColIdx] || "").replace(/[^\d.-]/g, "");
        extractedPrice = parseFloat(priceVal);
      } 
      
      // Tier B: Raw Grid Heuristic (Crucial for Row 626+ deep data where headers might be lost)
      if (!extractedSku || isNaN(extractedPrice) || extractedPrice <= 0) {
        // Look for any cell that looks like a cabinet SKU (e.g. UF3, B15, W3624)
        const heuristicSkuIdx = row.findIndex(cell => {
          const s = String(cell || "").trim();
          // Regex: Starts with 1-3 letters, followed by alphanumeric, 2-15 chars long
          return s.length >= 2 && s.length < 20 && /^[A-Z]{1,3}[A-Z0-9-\s]{1,15}$/i.test(s);
        });

        if (heuristicSkuIdx !== -1) {
          extractedSku = String(row[heuristicSkuIdx] || "").trim();
          // Find the best price candidate in the same row
          for (let i = 0; i < row.length; i++) {
            if (i === heuristicSkuIdx) continue;
            const val = String(row[i] || "").replace(/[^\d.-]/g, "");
            const num = parseFloat(val);
            // Heuristic: Valid logical cabinet price range
            if (!isNaN(num) && num > 1 && num < 40000) {
              extractedPrice = num;
              // Stabilize the column for the rest of this section if not already set
              if (activePriceColIdx === -1) activePriceColIdx = i;
              break;
            }
          }
        }
      }

      // STAGE 3: DATA PERSISTENCE
      if (extractedSku && !isNaN(extractedPrice) && extractedPrice > 0) {
        // Validation: Ensure the SKU isn't just a header word we missed
        if (skuKeywords.some(k => extractedSku.toUpperCase() === k)) continue;

        pricing.push({
          manufacturer_id: manufacturerId,
          collection_name: isGlobalSheet ? "UNIVERSAL" : currentSheetName,
          door_style: "UNIVERSAL",
          sku: extractedSku.toUpperCase(),
          price: extractedPrice,
          raw_source_file_id: fileId,
          created_at: new Date().toISOString()
        });
      }
    }
  }

  console.log(`[Parser v60] Finished. Extracted ${pricing.length} total records from all sheets.`);
  return pricing;
}
