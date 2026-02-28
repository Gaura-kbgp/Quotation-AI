import * as XLSX from 'xlsx';

/**
 * ENTERPRISE-GRADE HIGH-PRECISION PRICING PARSER (v42.0)
 * Implements Deep-Header Un-merging and Bi-Directional Schema Detection.
 * Scans ALL sheets and ALL rows without limits.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  // SCAN EVERY SHEET IN THE WORKBOOK (Unlimited Sheets)
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // Read entire sheet as a raw 2D grid
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as any[][];
    if (rows.length < 1) continue;

    let skuColIdx = -1;
    let headerRowIdx = -1;
    
    // Expanded keywords to catch diverse sheet layouts
    const skuKeywords = [
      "SKU", "ITEM SKU", "CODE", "MODEL", "ITEM CODE", "PART NUMBER", 
      "CABINET SKU", "MODEL NUMBER", "ITEM", "PRODUCT CODE", "DESCRIPTION",
      "PART #", "MODEL #"
    ];

    // 1. DYNAMIC HEADER DETECTION (Scan up to 150 rows for the header)
    for (let r = 0; r < Math.min(rows.length, 150); r++) {
      const row = rows[r];
      if (!row) continue;
      
      const idx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim();
        return skuKeywords.some(k => val === k);
      });
      
      if (idx !== -1) {
        skuColIdx = idx;
        headerRowIdx = r;
        break;
      }
    }

    if (skuColIdx === -1) continue;

    // 2. DEEP-HEADER UN-MERGING (Propagate merged headers across the grid)
    const headerGrid = rows.slice(0, headerRowIdx + 1).map(r => [...r]);
    
    // Vertical propagation
    for (let c = 0; c < 300; c++) {
      let lastVal = "";
      for (let r = 0; r < headerGrid.length; r++) {
        const val = String(headerGrid[r][c] || "").trim();
        if (val !== "" && !skuKeywords.some(k => val.toUpperCase() === k)) {
          lastVal = val;
        } else if (val === "") {
          headerGrid[r][c] = lastVal;
        }
      }
    }

    // Horizontal propagation
    for (let r = 0; r < headerGrid.length; r++) {
      let lastVal = "";
      for (let c = 0; c < headerGrid[r].length; c++) {
        const val = String(headerGrid[r][c] || "").trim();
        if (val !== "" && !skuKeywords.some(k => val.toUpperCase() === k)) {
          lastVal = val;
        } else if (val === "") {
          headerGrid[r][c] = lastVal;
        }
      }
    }

    // 3. MAP COLUMNS TO CATALOG METADATA
    const colMetadata = (headerGrid[headerRowIdx] || []).map((_, cIdx) => {
      let collection = "";
      let style = "";
      
      for (let r = 0; r <= headerRowIdx; r++) {
        const val = String(headerGrid[r][cIdx] || "").trim();
        if (val && !skuKeywords.some(k => val.toUpperCase() === k)) {
          if (!collection) collection = val;
          else if (val !== collection) style = val;
        }
      }

      return {
        collection: (collection || sheetName).toUpperCase().trim(),
        style: (style || "STANDARD").toUpperCase().trim()
      };
    });

    // 4. EXHAUSTIVE DATA EXTRACTION
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const rawSku = String(row[skuColIdx] || "").trim();
      if (!rawSku || skuKeywords.some(k => rawSku.toUpperCase() === k)) continue;
      
      const displaySku = rawSku.toUpperCase();

      for (let c = 0; c < row.length; c++) {
        if (c === skuColIdx) continue;
        
        const rawVal = row[c];
        if (rawVal === "" || rawVal === null || rawVal === undefined) continue;

        const priceStr = String(rawVal).replace(/[^\d.-]/g, "");
        const priceNum = parseFloat(priceStr);
        if (isNaN(priceNum) || priceNum <= 0) continue;

        const meta = colMetadata[c] || { collection: sheetName.toUpperCase(), style: "STANDARD" };

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
