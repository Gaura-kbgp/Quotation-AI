import * as XLSX from 'xlsx';

/**
 * ENTERPRISE-GRADE HIGH-PRECISION PRICING PARSER (v50.0)
 * 
 * IMPROVEMENTS:
 * 1. INFINITE ROW SCAN: Scans every row of every sheet for headers (no 500-row limit).
 * 2. HEURISTIC PRICE DISCOVERY: Identifies price columns by content if headers are missing.
 * 3. GLOBAL ACCESSORY TAGGING: Automatically treats "Accessory" sheets as Universal.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  const skuKeywords = ["SKU", "ITEM SKU", "CODE", "MODEL", "ITEM CODE", "PART NUMBER", "CABINET SKU", "MODEL NUMBER"];
  const priceKeywords = ["PRICE", "LIST PRICE", "LIST", "NET", "COST", "MSRP"];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as any[][];
    if (rows.length < 1) continue;

    let skuColIdx = -1;
    let headerRowIdx = -1;
    let priceCols: number[] = [];
    
    // 1. EXHAUSTIVE ANCHOR SCAN (Unlimited depth)
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      
      const potentialSkuIdx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim();
        return skuKeywords.some(k => val === k || val.includes(k));
      });
      
      if (potentialSkuIdx !== -1) {
        skuColIdx = potentialSkuIdx;
        headerRowIdx = r;
        
        // Find all Price columns in this header row
        row.forEach((cell, cIdx) => {
          const val = String(cell || "").toUpperCase().trim();
          if (priceKeywords.some(k => val.includes(k))) {
            priceCols.push(cIdx);
          }
        });
        
        if (priceCols.length > 0) break;
      }
    }

    // 2. HEURISTIC FALLBACK: If no explicit headers, find the first column with numbers that isn't the SKU
    if (skuColIdx !== -1 && priceCols.length === 0) {
      for (let r = headerRowIdx + 1; r < Math.min(rows.length, headerRowIdx + 10); r++) {
        const row = rows[r];
        if (!row) continue;
        row.forEach((cell, cIdx) => {
          if (cIdx === skuColIdx) return;
          const val = String(cell || "").replace(/[^\d.-]/g, "");
          if (val && !isNaN(parseFloat(val)) && parseFloat(val) > 0) {
            priceCols.push(cIdx);
          }
        });
        if (priceCols.length > 0) break;
      }
    }

    if (skuColIdx === -1) continue;

    const isAccessorySheet = sheetName.toUpperCase().includes("ACCESSORY") || sheetName.toUpperCase().includes("OPTION");

    // 3. HEADER CONTEXT DISCOVERY (Propagation logic)
    const colMetadata = (rows[headerRowIdx] || []).map((cell, cIdx) => {
      let collection = "";
      let style = "";
      for (let r = 0; r <= headerRowIdx; r++) {
        const val = String(rows[r]?.[cIdx] || "").trim();
        if (val && !skuKeywords.some(k => val.toUpperCase().includes(k)) && !priceKeywords.some(k => val.toUpperCase().includes(k))) {
          if (!collection) collection = val;
          else if (val !== collection) style = val;
        }
      }
      return {
        collection: (collection || (isAccessorySheet ? "UNIVERSAL" : sheetName)).toUpperCase().trim(),
        style: (style || "UNIVERSAL").toUpperCase().trim()
      };
    });

    // 4. EXHAUSTIVE DATA EXTRACTION
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;

      const rawSku = String(row[skuColIdx] || "").trim();
      if (!rawSku || skuKeywords.some(k => rawSku.toUpperCase() === k)) continue;
      
      const displaySku = rawSku.toUpperCase();

      priceCols.forEach(cIdx => {
        const rawPrice = row[cIdx];
        if (rawPrice === "" || rawPrice === null) return;

        const priceNum = parseFloat(String(rawPrice).replace(/[^\d.-]/g, ""));
        if (isNaN(priceNum) || priceNum <= 0) return;

        const meta = colMetadata[cIdx] || { collection: isAccessorySheet ? "UNIVERSAL" : sheetName.toUpperCase(), style: "UNIVERSAL" };

        pricing.push({
          manufacturer_id: manufacturerId,
          collection_name: meta.collection,
          door_style: meta.door_style || "UNIVERSAL",
          sku: displaySku,
          price: priceNum,
          raw_source_file_id: fileId,
          created_at: new Date().toISOString()
        });
      });
    }
  }

  return pricing;
}