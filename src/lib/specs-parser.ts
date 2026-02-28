import * as XLSX from 'xlsx';

/**
 * ENTERPRISE-GRADE HIGH-PRECISION PRICING PARSER (v51.0)
 * 
 * "SUPER QUALITY" IMPROVEMENTS:
 * 1. DEEP-GRID CONTENT HEURISTIC: Identifies SKU/Price data by pattern even if headers are missing.
 * 2. MULTI-TABLE DETECTION: Scans every row of every sheet independently.
 * 3. GLOBAL ACCESSORY PROPAGATION: Automatically tags accessory sheets for global discovery.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  const skuKeywords = ["SKU", "ITEM SKU", "CODE", "MODEL", "ITEM CODE", "PART NUMBER", "CABINET SKU", "MODEL NUMBER", "ITEM"];
  const priceKeywords = ["PRICE", "LIST PRICE", "LIST", "NET", "COST", "MSRP"];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as any[][];
    if (rows.length < 1) continue;

    let skuColIdx = -1;
    let priceCols: number[] = [];
    let currentCollection = sheetName.toUpperCase().trim();
    const isAccessorySheet = currentCollection.includes("ACCESSORY") || currentCollection.includes("OPTION") || currentCollection.includes("FILLER");

    // 1. DYNAMIC GRID ANALYSIS
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      // Header detection update: Look for SKU/Price anchors in ANY row
      const potentialSkuIdx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim();
        return skuKeywords.some(k => val === k || val.includes(k));
      });

      if (potentialSkuIdx !== -1) {
        skuColIdx = potentialSkuIdx;
        priceCols = []; // Reset price columns for this new potential table section
        row.forEach((cell, cIdx) => {
          const val = String(cell || "").toUpperCase().trim();
          if (priceKeywords.some(k => val.includes(k))) {
            priceCols.push(cIdx);
          }
        });
      }

      // 2. HEURISTIC DATA EXTRACTION
      // If we have a SKU column, check if this row looks like data
      if (skuColIdx !== -1) {
        const rawSku = String(row[skuColIdx] || "").trim();
        if (!rawSku || skuKeywords.some(k => rawSku.toUpperCase() === k)) continue;

        // Pattern Check: If we found no explicit price headers, look for currency-like values in other columns
        const activePriceCols = priceCols.length > 0 ? priceCols : row.map((_, i) => i).filter(i => i !== skuColIdx);

        activePriceCols.forEach(cIdx => {
          const rawValue = row[cIdx];
          if (rawValue === "" || rawValue === null) return;

          const valStr = String(rawValue).replace(/[^\d.-]/g, "");
          const priceNum = parseFloat(valStr);

          // Validation: Is it a valid price (> 0) and not the SKU itself?
          if (!isNaN(priceNum) && priceNum > 0 && valStr !== rawSku.replace(/[^\d.-]/g, "")) {
            // Success: Valid data point found
            pricing.push({
              manufacturer_id: manufacturerId,
              collection_name: isAccessorySheet ? "UNIVERSAL" : currentCollection,
              door_style: "UNIVERSAL",
              sku: rawSku.toUpperCase(),
              price: priceNum,
              raw_source_file_id: fileId,
              created_at: new Date().toISOString()
            });
          }
        });
      }
    }
  }

  return pricing;
}
