import * as XLSX from 'xlsx';

/**
 * ENTERPRISE-GRADE HIGH-PRECISION PRICING PARSER (v48.0)
 * 
 * IMPROVEMENTS:
 * 1. ZERO ROW LIMIT: Scans all 50,000+ rows of every sheet.
 * 2. DEEP HEADER SCAN: Finds SKU column even if hidden deep in the sheet.
 * 3. UNIVERSAL ACCESSORY SUPPORT: Captures simple list-format sheets.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  const skuKeywords = [
    "SKU", "ITEM SKU", "CODE", "MODEL", "ITEM CODE", "PART NUMBER", 
    "CABINET SKU", "MODEL NUMBER", "ITEM", "PRODUCT CODE", "DESCRIPTION",
    "PART #", "MODEL #", "ITEM #", "PART NO", "MODEL NO"
  ];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) continue;

    // Read entire sheet as a raw 2D grid
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as any[][];
    if (rows.length < 1) continue;

    let skuColIdx = -1;
    let headerRowIdx = -1;
    
    // 1. DYNAMIC HEADER DISCOVERY (Scan deep to find the SKU anchor)
    // Increased scan range to 200 rows to find headers in complex accessory sheets
    for (let r = 0; r < Math.min(rows.length, 200); r++) {
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

    // Fallback: If no keyword, look for SKU patterns (A-Z followed by numbers)
    if (skuColIdx === -1) {
      for (let r = 0; r < Math.min(rows.length, 100); r++) {
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

    // Ultimate Fallback: Assume first column is SKU if alphanumeric
    if (skuColIdx === -1 && rows.length > 0) {
      skuColIdx = 0;
      headerRowIdx = 0;
    }

    // 2. RECURSIVE HEADER PROPAGATION
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const maxCols = range.e.c + 1;
    const headerGrid = rows.slice(0, headerRowIdx + 1).map(r => [...r]);
    
    // Propagate headers to handle merged cells (Collections/Styles)
    for (let c = 0; c < maxCols; c++) {
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

    // 3. MAP COLUMNS TO CATALOG DESCRIPTORS
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

      // Default to Sheet Name for collections without clear headers (Common in Accessory Pricing)
      return {
        collection: (collection || sheetName).toUpperCase().trim(),
        style: (style || "UNIVERSAL").toUpperCase().trim()
      };
    });

    // 4. EXHAUSTIVE EXTRACTION (No Row Limits)
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const rawSku = String(row[skuColIdx] || "").trim();
      if (!rawSku || skuKeywords.some(k => rawSku.toUpperCase() === k)) continue;
      
      const displaySku = rawSku.toUpperCase();

      // Scan EVERY column in the row for prices
      for (let c = 0; c < Math.min(row.length, maxCols); c++) {
        if (c === skuColIdx) continue;
        
        const rawVal = row[c];
        if (rawVal === "" || rawVal === null || rawVal === undefined) continue;

        const priceStr = String(rawVal).replace(/[^\d.-]/g, "");
        const priceNum = parseFloat(priceStr);
        
        // Ensure we only grab valid numbers
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
