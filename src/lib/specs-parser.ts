import * as XLSX from 'xlsx';

/**
 * UNIVERSAL HIGH-PRECISION PRICING PARSER (v57.0)
 * 
 * "SUPER QUALITY" FEATURES:
 * 1. ANCHOR-FREE GRID SCANNING: Evaluates every row independently for SKU/Price pairs.
 *    No longer requires headers to be at the top of the sheet.
 * 2. PATTERN-BASED DETECTION: Uses Alphanumeric and Numeric heuristics to find data.
 * 3. INFINITE DEPTH: Processes 100% of rows in every sheet (resolves Row 626+ issues).
 * 4. GLOBAL ACCESSORY MAPPING: Automatically handles "Accessory" and "Filler" sheets.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  const skuKeywords = ["SKU", "ITEM SKU", "CODE", "MODEL", "ITEM CODE", "PART NUMBER", "CABINET SKU", "MODEL NUMBER", "ITEM", "SKU#"];
  const priceKeywords = ["PRICE", "LIST PRICE", "LIST", "NET", "COST", "MSRP", "TOTAL", "NET PRICE"];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) continue;

    // Fetch all rows from the sheet
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as any[][];
    if (rows.length < 1) continue;

    const currentSheetName = sheetName.toUpperCase().trim();
    // Auto-detect if this is a universal/accessory sheet
    const isGlobalSheet = currentSheetName.includes("ACCESSORY") || 
                         currentSheetName.includes("OPTION") || 
                         currentSheetName.includes("FILLER") ||
                         currentSheetName.includes("UNIVERSAL") ||
                         currentSheetName.includes("MOLDING");

    console.log(`[Parser v57] Deep scanning sheet: ${sheetName} (${rows.length} rows)`);

    let activeSkuColIdx = -1;
    let activePriceColIdx = -1;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length < 2) continue;

      // TIER 1: HEADER ANCHOR DISCOVERY (Look for row-level anchors)
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
        continue; // Skip the header row itself
      }

      // TIER 2: ANCHOR-FREE CONTENT ANALYSIS
      let extractedSku = "";
      let extractedPrice = 0;

      // If we have an active column pair, try them first
      if (activeSkuColIdx !== -1 && activePriceColIdx !== -1) {
        extractedSku = String(row[activeSkuColIdx] || "").trim();
        const priceVal = String(row[activePriceColIdx] || "").replace(/[^\d.-]/g, "");
        extractedPrice = parseFloat(priceVal);
      } 
      
      // TIER 3: HEURISTIC FALLBACK (For rows without active anchors, or if they failed)
      // This is the "Smart Engine" that finds UF342 at row 626 even if headers are missing.
      if (!extractedSku || isNaN(extractedPrice) || extractedPrice <= 0) {
        // Find a cell matching a SKU-like regex (Alphanumeric, starts with letter, e.g. UF3)
        const heuristicSkuIdx = row.findIndex(cell => {
          const s = String(cell || "").trim();
          return s.length >= 2 && s.length < 30 && /^[A-Z]{1,5}\s?[0-9]{1,8}/i.test(s);
        });

        if (heuristicSkuIdx !== -1) {
          extractedSku = String(row[heuristicSkuIdx] || "").trim();
          // Find the first valid numerical price in the same row after the SKU
          for (let i = heuristicSkuIdx + 1; i < row.length; i++) {
            const val = String(row[i] || "").replace(/[^\d.-]/g, "");
            const num = parseFloat(val);
            // Price pattern: positive, logical range for cabinetry
            if (!isNaN(num) && num > 5 && num < 25000) {
              extractedPrice = num;
              break;
            }
          }
        }
      }

      // TIER 4: PERSISTENCE
      if (extractedSku && !isNaN(extractedPrice) && extractedPrice > 0) {
        // Sanity check: Ensure we didn't just extract a header name
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

  console.log(`[Parser v57] Extraction finished. Captured ${pricing.length} pricing records across all sheets.`);
  return pricing;
}
