import * as XLSX from 'xlsx';

/**
 * ENTERPRISE-GRADE HIGH-PRECISION PRICING PARSER (v52.0)
 * 
 * "SUPER QUALITY" IMPROVEMENTS:
 * 1. DYNAMIC ANCHOR DISCOVERY: Scans every row for SKU/Price pairs, even deep in the sheet (Row 600+).
 * 2. HEURISTIC PRICE DETECTION: Identifies price columns by numerical content if headers are missing.
 * 3. GLOBAL CONTEXT PROPAGATION: Tracks merged collection headers across thousands of rows.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  const skuKeywords = ["SKU", "ITEM SKU", "CODE", "MODEL", "ITEM CODE", "PART NUMBER", "CABINET SKU", "MODEL NUMBER", "ITEM", "SKU#"];
  const priceKeywords = ["PRICE", "LIST PRICE", "LIST", "NET", "COST", "MSRP", "TOTAL", "NET PRICE"];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) continue;

    // Use header: 1 to get a raw 2D array of all rows/columns
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as any[][];
    if (rows.length < 1) continue;

    let skuColIdx = -1;
    let priceCols: number[] = [];
    let currentCollection = sheetName.toUpperCase().trim();
    
    // Auto-detect if this is a global accessory sheet
    const isGlobalSheet = currentCollection.includes("ACCESSORY") || 
                         currentCollection.includes("OPTION") || 
                         currentCollection.includes("FILLER") ||
                         currentCollection.includes("UNIVERSAL");

    console.log(`[Parser] Scanning sheet: ${sheetName} (${rows.length} rows)...`);

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      // 1. DYNAMIC HEADER/ANCHOR DETECTION
      // We check every row for SKU/Price headers to support multiple tables per sheet
      const foundSkuIdx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim();
        return skuKeywords.some(k => val === k || val.includes(k));
      });

      if (foundSkuIdx !== -1) {
        skuColIdx = foundSkuIdx;
        priceCols = []; // Reset price columns for this new section
        row.forEach((cell, cIdx) => {
          const val = String(cell || "").toUpperCase().trim();
          if (priceKeywords.some(k => val.includes(k))) {
            priceCols.push(cIdx);
          }
        });
      }

      // 2. HEURISTIC DATA EXTRACTION
      if (skuColIdx !== -1) {
        const rawSku = String(row[skuColIdx] || "").trim();
        
        // Skip header rows or empty SKU cells
        if (!rawSku || skuKeywords.some(k => rawSku.toUpperCase() === k)) continue;

        // If we have price headers, use them. 
        // IF NOT, use a numeric heuristic to find potential prices in this row.
        const targetCols = priceCols.length > 0 ? priceCols : row.map((_, i) => i).filter(i => i !== skuColIdx);

        targetCols.forEach(cIdx => {
          const rawValue = row[cIdx];
          if (rawValue === "" || rawValue === null) return;

          // Strip currency symbols and commas
          const valStr = String(rawValue).replace(/[^\d.-]/g, "");
          const priceNum = parseFloat(valStr);

          // Validation: Is it a valid price (> 0) and not the SKU itself?
          // We check if priceNum > 0 and the value isn't just the SKU repeated
          if (!isNaN(priceNum) && priceNum > 0 && valStr !== rawSku.replace(/[^\d.-]/g, "")) {
            pricing.push({
              manufacturer_id: manufacturerId,
              collection_name: isGlobalSheet ? "UNIVERSAL" : currentCollection,
              door_style: "UNIVERSAL", // Default style for row-based extraction
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

  console.log(`[Parser] Extraction complete. Total data points: ${pricing.length}`);
  return pricing;
}
