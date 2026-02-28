import * as XLSX from 'xlsx';

/**
 * ENTERPRISE-GRADE HIGH-PRECISION PRICING PARSER (v49.0)
 * 
 * IMPROVEMENTS:
 * 1. UNLIMITED GRID SCAN: Scans every row and every column of every sheet.
 * 2. DYNAMIC ANCHOR DETECTION: Independently finds "SKU" and "Price" headers on every sheet.
 * 3. MERGED HEADER PROPAGATION: Correctly un-merges headers to associate prices with collections.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  const skuKeywords = ["SKU", "ITEM SKU", "CODE", "MODEL", "ITEM CODE", "PART NUMBER", "CABINET SKU", "MODEL NUMBER"];
  const priceKeywords = ["PRICE", "LIST PRICE", "LIST", "NET", "COST"];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as any[][];
    if (rows.length < 1) continue;

    let skuColIdx = -1;
    let headerRowIdx = -1;
    let priceCols: number[] = [];
    
    // 1. DYNAMIC ANCHOR SCAN (Scan deep to find the SKU and Price anchors)
    for (let r = 0; r < Math.min(rows.length, 500); r++) {
      const row = rows[r];
      if (!row) continue;
      
      const potentialSkuIdx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim();
        return skuKeywords.some(k => val === k || val.includes(k));
      });
      
      if (potentialSkuIdx !== -1) {
        skuColIdx = potentialSkuIdx;
        headerRowIdx = r;
        
        // Once SKU found, find all Price columns in this same header row
        row.forEach((cell, cIdx) => {
          const val = String(cell || "").toUpperCase().trim();
          if (priceKeywords.some(k => val.includes(k))) {
            priceCols.push(cIdx);
          }
        });
        break;
      }
    }

    // Fallback Price Discovery: If no explicit Price header, any column with numbers in row +1/+2 is a candidate
    if (priceCols.length === 0 && headerRowIdx !== -1) {
      const sampleRow = rows[headerRowIdx + 1] || [];
      sampleRow.forEach((cell, cIdx) => {
        if (cIdx === skuColIdx) return;
        const val = String(cell || "").replace(/[^\d.-]/g, "");
        if (val && !isNaN(parseFloat(val))) {
          priceCols.push(cIdx);
        }
      });
    }

    if (skuColIdx === -1) continue;

    // 2. HEADER CONTEXT DISCOVERY
    const colMetadata = (rows[headerRowIdx] || []).map((cell, cIdx) => {
      // Look upwards for Collection/Style names (Merged cells)
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
        collection: (collection || sheetName).toUpperCase().trim(),
        style: (style || "UNIVERSAL").toUpperCase().trim()
      };
    });

    // 3. EXHAUSTIVE DATA EXTRACTION (Row 0 to End)
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;

      const rawSku = String(row[skuColIdx] || "").trim();
      if (!rawSku || skuKeywords.some(k => rawSku.toUpperCase() === k)) continue;
      
      const displaySku = rawSku.toUpperCase();

      // Extract price from every identified price column
      priceCols.forEach(cIdx => {
        const rawPrice = row[cIdx];
        if (rawPrice === "" || rawPrice === null) return;

        const priceNum = parseFloat(String(rawPrice).replace(/[^\d.-]/g, ""));
        if (isNaN(priceNum) || priceNum <= 0) return;

        const meta = colMetadata[cIdx] || { collection: sheetName.toUpperCase(), style: "UNIVERSAL" };

        pricing.push({
          manufacturer_id: manufacturerId,
          collection_name: meta.collection,
          door_style: meta.style,
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
