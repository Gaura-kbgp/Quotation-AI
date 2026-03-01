import * as XLSX from 'xlsx';

/**
 * EXTREME-FLEXIBILITY UNIVERSAL SCANNER (v66.0)
 * 
 * DESIGN PHILOSOPHY:
 * 1. ROW-LEVEL HEURISTIC: Treat every row as a potential independent data source.
 * 2. PATTERN RECOGNITION: Find SKUs (UF3, UF342) and Prices even without headers.
 * 3. EXHAUSTIVE SCAN: No row limits. Scans 100% of all sheets.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  const skuKeywords = ["SKU", "ITEM SKU", "CODE", "MODEL", "ITEM CODE", "PART NUMBER", "CABINET SKU", "MODEL NUMBER", "ITEM", "SKU#"];
  const priceKeywords = ["PRICE", "LIST PRICE", "LIST", "NET", "COST", "MSRP", "TOTAL", "NET PRICE"];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) continue;

    // Use header: 1 to get raw grid, defval: "" to prevent skipping empty cells
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as any[][];
    if (rows.length < 1) continue;

    const currentSheetName = sheetName.toUpperCase().trim();
    const isGlobalSheet = currentSheetName.includes("ACCESSORY") || 
                         currentSheetName.includes("OPTION") || 
                         currentSheetName.includes("FILLER") ||
                         currentSheetName.includes("UNIVERSAL") ||
                         currentSheetName.includes("MOLDING") ||
                         currentSheetName.includes("SKU GUIDE");

    console.log(`[Parser v66] Greedy Pattern Scan: ${sheetName} (${rows.length} rows)`);

    let activeSkuColIdx = -1;
    let activePriceColIdx = -1;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length < 1) continue;

      // STAGE 1: DYNAMIC HEADER DISCOVERY (Attempts to re-sync if columns move)
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

      // STAGE 2: ROW-LEVEL CONTENT HEURISTIC (GREEDY SCAN)
      let extractedSku = "";
      let extractedPrice = 0;

      // Method A: Anchored Search (If we found headers earlier)
      if (activeSkuColIdx !== -1 && activePriceColIdx !== -1) {
        extractedSku = String(row[activeSkuColIdx] || "").trim();
        const priceVal = String(row[activePriceColIdx] || "").replace(/[^\d.-]/g, "");
        extractedPrice = parseFloat(priceVal);
      } 
      
      // Method B: Greedy Grid Pattern Matcher (Fallback for Header-less Sections)
      if (!extractedSku || isNaN(extractedPrice) || extractedPrice <= 0) {
        const heuristicSkuIdx = row.findIndex(cell => {
          const s = String(cell || "").trim();
          // Matches Cabinet SKU patterns like UF3, W3624, OVD3396
          return s.length >= 2 && s.length < 16 && /^[A-Z]{1,4}[A-Z0-9-\s.]{1,12}$/i.test(s);
        });

        if (heuristicSkuIdx !== -1) {
          extractedSku = String(row[heuristicSkuIdx] || "").trim();
          for (let i = 0; i < row.length; i++) {
            if (i === heuristicSkuIdx) continue;
            const rawVal = String(row[i] || "").trim();
            if (!rawVal) continue;
            
            const val = rawVal.replace(/[^\d.-]/g, "");
            const num = parseFloat(val);
            if (!isNaN(num) && num >= 1 && num < 30000) {
              extractedPrice = num;
              break;
            }
          }
        }
      }

      // STAGE 3: DATA NORMALIZATION
      if (extractedSku && !isNaN(extractedPrice) && extractedPrice > 0) {
        const upperSku = extractedSku.toUpperCase();
        if (skuKeywords.some(k => upperSku === k)) continue;

        pricing.push({
          manufacturer_id: manufacturerId,
          collection_name: isGlobalSheet ? "UNIVERSAL" : currentSheetName,
          door_style: "UNIVERSAL",
          sku: upperSku,
          price: extractedPrice,
          raw_source_file_id: fileId,
          created_at: new Date().toISOString()
        });
      }
    }
  }

  console.log(`[Parser v66] Captured ${pricing.length} pricing records.`);
  return pricing;
}
