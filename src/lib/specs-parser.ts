
import * as XLSX from 'xlsx';

/**
 * UNIVERSAL ANCHOR-FREE PRICING PARSER (v59.0)
 * 
 * "SUPER QUALITY" FEATURES:
 * 1. ROW-LEVEL HEURISTIC PATTERN MATCHING: Treats every row as a potential data pair.
 * 2. NO-LIMIT GRID SCAN: Processes 100% of rows/cols in all 60+ sheets.
 * 3. DYNAMIC SKU/PRICE RECOGNITION: Identifies cabinet codes even without headers.
 * 4. GLOBAL ACCESSORY PRIORITY: Deep scans specialized accessory sheets (Row 626+).
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

    console.log(`[Parser v59] Deep Pattern Scan: ${sheetName} (${rows.length} rows)`);

    let activeSkuColIdx = -1;
    let activePriceColIdx = -1;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length < 2) continue;

      // STAGE 1: HEADER ANCHOR DISCOVERY (Look for row-level anchors)
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
        continue; 
      }

      // STAGE 2: ROW-LEVEL PATTERN HEURISTIC (Independent of headers)
      let extractedSku = "";
      let extractedPrice = 0;

      // Use discovered columns if they exist
      if (activeSkuColIdx !== -1 && activePriceColIdx !== -1) {
        extractedSku = String(row[activeSkuColIdx] || "").trim();
        const priceVal = String(row[activePriceColIdx] || "").replace(/[^\d.-]/g, "");
        extractedPrice = parseFloat(priceVal);
      } 
      
      // STAGE 3: RAW GRID SEARCH (Crucial for Row 626+ deep data)
      if (!extractedSku || isNaN(extractedPrice) || extractedPrice <= 0) {
        // Look for any cell that looks like a cabinet SKU (e.g. UF3, B15, W3624)
        const heuristicSkuIdx = row.findIndex(cell => {
          const s = String(cell || "").trim();
          // Heuristic: Alphanumeric string, 2-15 chars, starts with a letter
          return s.length >= 2 && s.length < 20 && /^[A-Z][A-Z0-9-\s]{1,15}$/i.test(s);
        });

        if (heuristicSkuIdx !== -1) {
          extractedSku = String(row[heuristicSkuIdx] || "").trim();
          // Find the best price candidate in the same row
          for (let i = 0; i < row.length; i++) {
            if (i === heuristicSkuIdx) continue;
            const val = String(row[i] || "").replace(/[^\d.-]/g, "");
            const num = parseFloat(val);
            // Heuristic: Logical price range for cabinets/accessories
            if (!isNaN(num) && num > 1 && num < 30000) {
              extractedPrice = num;
              // Stabilize for future rows in this sheet
              if (activePriceColIdx === -1) activePriceColIdx = i;
              break;
            }
          }
        }
      }

      // STAGE 4: PERSISTENCE (Clean and push to DB)
      if (extractedSku && !isNaN(extractedPrice) && extractedPrice > 0) {
        // Skip common header words if they were misidentified
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

  console.log(`[Parser v59] Final Scan Results: ${pricing.length} pricing records extracted.`);
  return pricing;
}
