import * as XLSX from 'xlsx';

/**
 * UNIVERSAL HIGH-PRECISION PRICING PARSER (v56.0)
 * 
 * "SUPER QUALITY" FEATURES:
 * 1. HEADER-AGNOSTIC EXTRACTION: Evaluates every row for SKU and Price patterns.
 * 2. INFINITE DEPTH SCAN: Processes 100% of rows in every sheet (resolves Row 626+ issues).
 * 3. GLOBAL ACCESSORY DETECTION: Automatically maps accessory sheets to the UNIVERSAL catalog.
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
    // Mark sheets that are clearly universal accessories
    const isGlobalSheet = currentSheetName.includes("ACCESSORY") || 
                         currentSheetName.includes("OPTION") || 
                         currentSheetName.includes("FILLER") ||
                         currentSheetName.includes("UNIVERSAL") ||
                         currentSheetName.includes("MOLDING");

    let skuColIdx = -1;
    let priceColIdx = -1;

    console.log(`[Parser v56] Deep scanning sheet: ${sheetName} (${rows.length} rows)`);

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length < 2) continue;

      // 1. SYNC HEADERS (Look for column anchors)
      const foundSkuIdx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim();
        return skuKeywords.some(k => val === k);
      });

      if (foundSkuIdx !== -1) {
        skuColIdx = foundSkuIdx;
        const foundPriceIdx = row.findIndex((cell, idx) => {
          if (idx === skuColIdx) return false;
          const val = String(cell || "").toUpperCase().trim();
          return priceKeywords.some(k => val.includes(k));
        });
        if (foundPriceIdx !== -1) priceColIdx = foundPriceIdx;
        continue; // Skip header row from data processing
      }

      // 2. DATA EXTRACTION (Heuristic Fallback for deep rows or missing headers)
      let finalSku = "";
      let finalPrice = 0;

      if (skuColIdx !== -1 && priceColIdx !== -1) {
        // Standard column-based extraction
        finalSku = String(row[skuColIdx] || "").trim();
        const priceVal = String(row[priceColIdx] || "").replace(/[^\d.-]/g, "");
        finalPrice = parseFloat(priceVal);
      } else {
        // HEURISTIC GRID SCAN (Crucial for rows like 626-641 in accessory sheets)
        // Find a cell matching SKU-like pattern (e.g. UF3, B24, W36)
        const pSkuIdx = row.findIndex(cell => {
          const s = String(cell || "").trim();
          // SKU Heuristic: Alphanumeric, short-to-medium length, starts with a letter
          return s.length > 1 && s.length < 25 && /^[A-Z]{1,5}\s?[0-9]{1,6}/i.test(s);
        });

        if (pSkuIdx !== -1) {
          finalSku = String(row[pSkuIdx] || "").trim();
          // Look for the first numerical cell after the SKU that looks like a cabinet price
          for (let i = 0; i < row.length; i++) {
            if (i === pSkuIdx) continue;
            const val = String(row[i] || "").replace(/[^\d.-]/g, "");
            const num = parseFloat(val);
            // Price Heuristic: Positive number, not too small (avoids qty), not astronomical
            if (!isNaN(num) && num > 5 && num < 20000) {
              finalPrice = num;
              break;
            }
          }
        }
      }

      // 3. PERSIST VALID PAIR
      if (finalSku && !isNaN(finalPrice) && finalPrice > 0) {
        // Avoid adding headers as data
        if (skuKeywords.some(k => finalSku.toUpperCase() === k)) continue;

        pricing.push({
          manufacturer_id: manufacturerId,
          collection_name: isGlobalSheet ? "UNIVERSAL" : currentSheetName,
          door_style: "UNIVERSAL",
          sku: finalSku.toUpperCase(),
          price: finalPrice,
          raw_source_file_id: fileId,
          created_at: new Date().toISOString()
        });
      }
    }
  }

  console.log(`[Parser v56] Extraction complete. Successfully captured ${pricing.length} pricing records.`);
  return pricing;
}
