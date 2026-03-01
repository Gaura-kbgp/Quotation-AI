
import * as XLSX from 'xlsx';

/**
 * UNIVERSAL HIGH-PRECISION PRICING PARSER (v58.0)
 * 
 * "SUPER QUALITY" FEATURES:
 * 1. ANCHOR-FREE DEEP SCAN: Evaluates every row independently for SKU/Price pairs.
 * 2. PATTERN-BASED HEURISTICS: Uses Alphanumeric and Numeric heuristics to find data deep in files (Row 600+).
 * 3. INFINITE DEPTH: Processes 100% of rows in every sheet (resolves accessory matching issues).
 * 4. GLOBAL ACCESSORY PRIORITY: Automatically handles "Accessory" and "Filler" sheets.
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

    console.log(`[Parser v58] AI-Enhanced Deep Scan on sheet: ${sheetName} (${rows.length} rows)`);

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

      // TIER 2: SMART GRID HEURISTIC (Independent of headers)
      let extractedSku = "";
      let extractedPrice = 0;

      // Check current column anchors if discovered
      if (activeSkuColIdx !== -1 && activePriceColIdx !== -1) {
        extractedSku = String(row[activeSkuColIdx] || "").trim();
        const priceVal = String(row[activePriceColIdx] || "").replace(/[^\d.-]/g, "");
        extractedPrice = parseFloat(priceVal);
      } 
      
      // TIER 3: ANCHOR-FREE PATTERN RECOGNITION (Row 626+ Fallback)
      if (!extractedSku || isNaN(extractedPrice) || extractedPrice <= 0) {
        // Find a cell matching a SKU-like regex (Alphanumeric, e.g. UF3, UF342)
        const heuristicSkuIdx = row.findIndex(cell => {
          const s = String(cell || "").trim();
          // Match codes like UF3, UF342, W3624, etc.
          return s.length >= 2 && s.length < 35 && /^[A-Z]{1,5}\s?[0-9]{1,10}/i.test(s);
        });

        if (heuristicSkuIdx !== -1) {
          extractedSku = String(row[heuristicSkuIdx] || "").trim();
          // Scan remaining cells in the row for a logical price
          for (let i = 0; i < row.length; i++) {
            if (i === heuristicSkuIdx) continue;
            const val = String(row[i] || "").replace(/[^\d.-]/g, "");
            const num = parseFloat(val);
            // Price pattern: positive, logical range for cabinetry or fillers
            if (!isNaN(num) && num > 1 && num < 25000) {
              extractedPrice = num;
              // If we find a price in a column, it's likely the price column for the rest of the sheet
              if (activePriceColIdx === -1) activePriceColIdx = i;
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

  console.log(`[Parser v58] Scan complete. Extracted ${pricing.length} pricing records.`);
  return pricing;
}
