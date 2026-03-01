import * as XLSX from 'xlsx';

/**
 * UNIVERSAL HIGH-PRECISION PRICING PARSER (v55.0)
 * 
 * "SUPER QUALITY" IMPROVEMENTS:
 * 1. HEADER-AGNOSTIC EXTRACTION: If no header is found, it uses row heuristics (SKU pattern + Number).
 * 2. EXHAUSTIVE SCAN: Reads 100% of rows in every sheet (resolves Row 626+ issues).
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
    const isGlobalSheet = currentSheetName.includes("ACCESSORY") || 
                         currentSheetName.includes("OPTION") || 
                         currentSheetName.includes("FILLER") ||
                         currentSheetName.includes("UNIVERSAL") ||
                         currentSheetName.includes("MOLDING");

    let skuColIdx = -1;
    let priceColIdx = -1;

    console.log(`[Parser v55] Exhaustive scan: ${sheetName} (${rows.length} rows)`);

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length < 2) continue;

      // 1. SYNC HEADERS (Try to find column anchors if not already found)
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
        continue; // Header row found
      }

      // 2. DATA EXTRACTION (Use identified columns or Heuristic Pair Search)
      let finalSku = "";
      let finalPrice = 0;

      if (skuColIdx !== -1 && priceColIdx !== -1) {
        // We have columns, extract directly
        finalSku = String(row[skuColIdx] || "").trim();
        const priceVal = String(row[priceColIdx] || "").replace(/[^\d.-]/g, "");
        finalPrice = parseFloat(priceVal);
      } else {
        // HEURISTIC PAIR SEARCH (For deep rows like 626 with no headers)
        // Find an alphanumeric cell that looks like a cabinet code
        const pSkuIdx = row.findIndex(cell => {
          const s = String(cell || "").trim();
          return s.length > 1 && s.length < 20 && /^[A-Z]{1,5}\s?[0-9]{1,6}/i.test(s);
        });

        if (pSkuIdx !== -1) {
          finalSku = String(row[pSkuIdx] || "").trim();
          // Find the first logical number after the SKU that looks like a price
          for (let i = pSkuIdx + 1; i < row.length; i++) {
            const val = String(row[i] || "").replace(/[^\d.-]/g, "");
            const num = parseFloat(val);
            if (!isNaN(num) && num > 5 && num < 15000) {
              finalPrice = num;
              break;
            }
          }
        }
      }

      // 3. PERSIST VALID PAIR
      if (finalSku && !isNaN(finalPrice) && finalPrice > 0) {
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

  console.log(`[Parser v55] Extraction complete. Total records: ${pricing.length}`);
  return pricing;
}
