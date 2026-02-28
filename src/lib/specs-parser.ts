import * as XLSX from 'xlsx';

/**
 * ENTERPRISE-GRADE HIGH-PRECISION PRICING PARSER (v44.0)
 * Scans ALL sheets and ALL columns using Deep-Header Un-merging.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // Read entire sheet as a raw 2D grid
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as any[][];
    if (rows.length < 1) continue;

    let skuColIdx = -1;
    let headerRowIdx = -1;
    
    const skuKeywords = [
      "SKU", "ITEM SKU", "CODE", "MODEL", "ITEM CODE", "PART NUMBER", 
      "CABINET SKU", "MODEL NUMBER", "ITEM", "PRODUCT CODE", "DESCRIPTION",
      "PART #", "MODEL #", "ITEM #", "PART NO", "MODEL NO"
    ];

    // 1. DEEP HEADER DETECTION (Scan deeper for complex sheets)
    for (let r = 0; r < Math.min(rows.length, 100); r++) {
      const row = rows[r];
      if (!row) continue;
      
      const idx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim();
        return skuKeywords.some(k => val === k || val.includes(k));
      });
      
      if (idx !== -1) {
        skuColIdx = idx;
        headerRowIdx = r;
        break;
      }
    }

    // Fallback: If no header found, look for cells that look like SKUs
    if (skuColIdx === -1) {
      for (let r = 0; r < Math.min(rows.length, 20); r++) {
        const row = rows[r];
        if (!row) continue;
        const potentialIdx = row.findIndex(cell => /^[A-Z]{1,4}[0-9]{1,6}/.test(String(cell || "")));
        if (potentialIdx !== -1) {
          skuColIdx = potentialIdx;
          headerRowIdx = Math.max(0, r - 1);
          break;
        }
      }
    }

    if (skuColIdx === -1) continue;

    // 2. BI-DIRECTIONAL HEADER UN-MERGING (Crucial for merged Excel cells)
    const headerGrid = rows.slice(0, headerRowIdx + 1).map(r => [...r]);
    
    // Propagate headers vertically
    for (let c = 0; c < 150; c++) {
      let lastVal = "";
      for (let r = 0; r < headerGrid.length; r++) {
        const val = String(headerGrid[r]?.[c] || "").trim();
        if (val !== "" && !skuKeywords.some(k => val.toUpperCase().includes(k))) {
          lastVal = val;
        } else if (val === "" && lastVal !== "") {
          if (headerGrid[r]) headerGrid[r][c] = lastVal;
        }
      }
    }

    // Propagate headers horizontally
    for (let r = 0; r < headerGrid.length; r++) {
      let lastVal = "";
      for (let c = 0; c < 150; c++) {
        const val = String(headerGrid[r]?.[c] || "").trim();
        if (val !== "" && !skuKeywords.some(k => val.toUpperCase().includes(k))) {
          lastVal = val;
        } else if (val === "" && lastVal !== "") {
          if (headerGrid[r]) headerGrid[r][c] = lastVal;
        }
      }
    }

    // 3. MAP COLUMNS TO CATALOG METADATA
    const colMetadata = (headerGrid[headerRowIdx] || []).map((_, cIdx) => {
      let collection = "";
      let style = "";
      
      for (let r = 0; r <= headerRowIdx; r++) {
        const val = String(headerGrid[r]?.[cIdx] || "").trim();
        if (val && !skuKeywords.some(k => val.toUpperCase().includes(k))) {
          if (!collection) collection = val;
          else if (val !== collection) style = val;
        }
      }

      return {
        collection: (collection || sheetName).toUpperCase().trim(),
        style: (style || "UNIVERSAL").toUpperCase().trim()
      };
    });

    // 4. EXHAUSTIVE EXTRACTION SCAN
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const rawSku = String(row[skuColIdx] || "").trim();
      if (!rawSku || skuKeywords.some(k => rawSku.toUpperCase() === k)) continue;
      
      const displaySku = rawSku.toUpperCase();

      for (let c = 0; c < row.length; c++) {
        // Scan ALL columns for prices
        if (c === skuColIdx) continue;
        
        const rawVal = row[c];
        if (rawVal === "" || rawVal === null || rawVal === undefined) continue;

        // Clean price string: handle currency and accounting formats
        const priceStr = String(rawVal).replace(/[^\d.-]/g, "");
        const priceNum = parseFloat(priceStr);
        
        if (isNaN(priceNum) || priceNum <= 0) continue;

        const meta = colMetadata[c] || { collection: sheetName.toUpperCase(), style: "UNIVERSAL" };

        pricing.push({
          manufacturer_id: manufacturerId,
          collection_name: meta.collection,
          door_style: meta.style,
          sku: displaySku,
          price: priceNum,
          raw_source_file_id: fileId,
          created_at: new Date().toISOString()
        });
      }
    }
  }

  return pricing;
}
