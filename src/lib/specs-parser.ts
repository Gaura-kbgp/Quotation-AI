import * as XLSX from 'xlsx';

/**
 * UNIVERSAL HIGH-PRECISION PRICING PARSER (v54.0)
 * 
 * "SUPER QUALITY" IMPROVEMENTS:
 * 1. ROW-FIRST HEURISTIC: Scans every row independently for SKU + Price pairs.
 * 2. HEADER-INDEPENDENT: Successfully extracts data from Row 626+ even without top headers.
 * 3. AGGRESSIVE PATTERN MATCHING: Captures 'UF1', 'UF 342', and 'UF E3'.
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

    let skuColIdx = -1;
    let priceCols: number[] = [];
    const currentCollection = sheetName.toUpperCase().trim();
    
    const isGlobalSheet = currentCollection.includes("ACCESSORY") || 
                         currentCollection.includes("OPTION") || 
                         currentCollection.includes("FILLER") ||
                         currentCollection.includes("UNIVERSAL") ||
                         currentCollection.includes("MOLDING");

    console.log(`[Parser] Exhaustive scan on: ${sheetName} (${rows.length} rows)...`);

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length < 2) continue;

      // 1. DYNAMIC HEADER SYNC (Look for anchors on every row)
      const foundSkuIdx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim();
        return skuKeywords.some(k => val === k);
      });

      if (foundSkuIdx !== -1) {
        skuColIdx = foundSkuIdx;
        priceCols = [];
        row.forEach((cell, cIdx) => {
          const val = String(cell || "").toUpperCase().trim();
          if (priceKeywords.some(k => val.includes(k))) {
            priceCols.push(cIdx);
          }
        });
        continue; // It's a header row
      }

      // 2. ROW-LEVEL HEURISTIC (Capture data even without a header anchor)
      let potentialSkuIdx = skuColIdx !== -1 ? skuColIdx : -1;
      let potentialPriceIdxs = priceCols.length > 0 ? priceCols : [];

      // If we don't know the columns yet, look for a SKU/Price pattern in this specific row
      if (potentialSkuIdx === -1) {
        potentialSkuIdx = row.findIndex(cell => {
          const s = String(cell || "").trim();
          // Regex to catch UF1, UF342, UF E3, B24, W3624, etc.
          return /^[A-Z]{1,5}\s?[0-9]{1,6}[A-Z]{0,5}$/i.test(s) || /^[A-Z]{1,5}\s[A-Z0-9]{1,6}$/i.test(s);
        });
      }

      if (potentialPriceIdxs.length === 0) {
        row.forEach((cell, idx) => {
          if (idx === potentialSkuIdx) return;
          const valStr = String(cell).replace(/[^\d.-]/g, "");
          const num = parseFloat(valStr);
          // Look for a realistic price (e.g., 5 to 10,000)
          if (!isNaN(num) && num > 5 && num < 15000) {
            potentialPriceIdxs.push(idx);
          }
        });
      }

      // 3. DATA EXTRACTION
      if (potentialSkuIdx !== -1 && potentialPriceIdxs.length > 0) {
        const rawSku = String(row[potentialSkuIdx] || "").trim();
        if (!rawSku || skuKeywords.some(k => rawSku.toUpperCase() === k)) continue;

        // Use the first potential price index as the primary one
        const primaryPriceIdx = potentialPriceIdxs[0];
        const rawValue = row[primaryPriceIdx];
        const valStr = String(rawValue).replace(/[^\d.-]/g, "");
        const priceNum = parseFloat(valStr);

        if (!isNaN(priceNum) && priceNum > 0) {
          pricing.push({
            manufacturer_id: manufacturerId,
            collection_name: isGlobalSheet ? "UNIVERSAL" : currentCollection,
            door_style: "UNIVERSAL",
            sku: rawSku.toUpperCase(),
            price: priceNum,
            raw_source_file_id: fileId,
            created_at: new Date().toISOString()
          });
        }
      }
    }
  }

  console.log(`[Parser] Global scan complete. Captured ${pricing.length} pricing records.`);
  return pricing;
}
