import * as XLSX from 'xlsx';

/**
 * HIGH-PRECISION ENTERPRISE PRICING PARSER (v38.0)
 * Implements Deep-Header Un-merging and Bi-Directional Schema Detection.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  // Iterate through EVERY sheet in the workbook
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // Use header: 1 to get a 2D array of ALL rows
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as any[][];
    if (rawData.length < 1) continue;

    let skuColIdx = -1;
    let headerRowIdx = -1;

    // DYNAMIC HEADER DETECTION
    const skuHeaders = ["SKU", "ITEM SKU", "CODE", "MODEL", "ITEM CODE", "PART NUMBER", "CABINET SKU", "MODEL NUMBER", "ITEM", "PRODUCT CODE"];
    
    // Scan deeper for the header row to handle complex intros
    for (let r = 0; r < Math.min(200, rawData.length); r++) {
      const row = rawData[r];
      const idx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim();
        return skuHeaders.some(h => val === h || val.replace(/[^A-Z]/g, '') === h);
      });
      if (idx !== -1) {
        skuColIdx = idx;
        headerRowIdx = r;
        break;
      }
    }

    if (skuColIdx === -1) {
      // Fallback to column A if no explicit header found, but scan for patterns
      skuColIdx = 0;
      headerRowIdx = 0;
    }

    // DEEP HEADER UN-MERGING (Propagate merged headers horizontally)
    const normalizedCollections: string[] = [];
    const normalizedStyles: string[] = [];
    
    // Look up to 10 rows above for headers
    const lookbackRows = Math.max(0, headerRowIdx - 10);
    const headerStack = rawData.slice(lookbackRows, headerRowIdx);

    // Build un-merged maps for every column
    for (let c = 0; c < 500; c++) {
      let colVal = "";
      let styleVal = "";
      
      // Traverse the stack vertically for this column
      for (let r = 0; r < headerStack.length; r++) {
        const cellVal = String(headerStack[r][c] || "").trim();
        if (cellVal.length > 2) {
          // If a new value is found, it's either a collection or a style
          if (!colVal) colVal = cellVal;
          else styleVal = cellVal;
        }
      }

      // Horizontal propagation if cell is empty (Standard Excel Merged behavior)
      if (!colVal && c > 0) colVal = normalizedCollections[c-1];
      if (!styleVal && c > 0) styleVal = normalizedStyles[c-1];

      normalizedCollections[c] = colVal;
      normalizedStyles[c] = styleVal;
    }

    // EXHAUSTIVE DATA EXTRACTION
    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      if (!row) continue;

      const rawExcelSKU = String(row[skuColIdx] || "").trim();
      if (!rawExcelSKU || rawExcelSKU.length < 1) continue;
      
      const displaySKU = rawExcelSKU.toUpperCase();

      // Scan ALL other columns in this row for numeric price values
      for (let c = 0; c < row.length; c++) {
        if (c === skuColIdx) continue;
        
        const rawValue = row[c];
        if (rawValue === null || rawValue === undefined || rawValue === "") continue;

        // Clean currency formatting
        const priceStr = String(rawValue).replace(/[^\d.-]/g, "");
        const priceNum = parseFloat(priceStr);
        if (isNaN(priceNum) || priceNum <= 0) continue;

        // Resolve Metadata
        let col = normalizedCollections[c] || "";
        let style = normalizedStyles[c] || (rawData[headerRowIdx] ? String(rawData[headerRowIdx][c] || "") : "");

        // If no header found, use sheet name (Critical for Accessory sheets)
        if (!col || col.length < 2) col = sheetName.toUpperCase().trim();
        if (!style || style.length < 2) style = "STANDARD";

        pricing.push({
          manufacturer_id: manufacturerId,
          collection_name: col.toUpperCase().trim(),
          door_style: style.toUpperCase().trim(),
          sku: displaySKU,
          price: priceNum,
          raw_source_file_id: fileId,
          created_at: new Date().toISOString()
        });
      }
    }
  }

  return pricing;
}
