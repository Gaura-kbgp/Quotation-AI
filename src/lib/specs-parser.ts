import * as XLSX from 'xlsx';

/**
 * HIGH-PRECISION PRICING PARSER (v37.0)
 * Scans ALL sheets, ALL rows, and ALL columns to build an exhaustive price map.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  // STEP 1: Scan EVERY sheet in the workbook
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // Use header: 1 to get a 2D array of ALL rows (no skipping blanks)
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as any[][];
    if (rawData.length < 1) continue;

    let skuColIdx = -1;
    let headerRowIdx = -1;

    // Detect SKU Column Dynamically
    const skuHeaders = ["SKU", "ITEM SKU", "CODE", "MODEL", "ITEM CODE", "PART NUMBER", "CABINET SKU", "MODEL NUMBER", "ITEM", "PRODUCT CODE"];
    
    for (let r = 0; r < Math.min(100, rawData.length); r++) {
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

    // Default to column A if no header found
    if (skuColIdx === -1) {
      skuColIdx = 0;
      headerRowIdx = 0;
    }

    // Capture potential Collection and Style headers
    const collectionRow = headerRowIdx >= 2 ? (rawData[headerRowIdx - 2] || []) : [];
    const styleRow = headerRowIdx >= 1 ? (rawData[headerRowIdx - 1] || []) : [];
    const mainHeaderRow = rawData[headerRowIdx] || [];

    // Propagate headers
    const normalizedCollections: string[] = [];
    let currentCollection = "";
    for (let c = 0; c < 500; c++) {
      const val = String(collectionRow[c] || "").trim();
      if (val && val.length > 1) currentCollection = val;
      normalizedCollections[c] = currentCollection;
    }

    const normalizedStyles: string[] = [];
    let currentStyle = "";
    for (let c = 0; c < 500; c++) {
      const val = String(styleRow[c] || "").trim();
      if (val && val.length > 1) currentStyle = val;
      normalizedStyles[c] = currentStyle;
    }

    // STEP 2: Iterate through EVERY row
    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      const rawExcelSKU = String(row[skuColIdx] || "").trim();
      if (!rawExcelSKU || rawExcelSKU.length < 1) continue;
      
      const displaySKU = rawExcelSKU.toUpperCase();

      // Scan ALL other columns in this row for prices
      for (let c = 0; c < row.length; c++) {
        if (c === skuColIdx) continue;
        
        const rawValue = row[c];
        if (rawValue === null || rawValue === undefined || rawValue === "") continue;

        const priceStr = String(rawValue).replace(/[^\d.-]/g, "");
        const priceNum = parseFloat(priceStr);
        if (isNaN(priceNum) || priceNum <= 0) continue;

        // Resolve Collection and Style
        let colCell = normalizedCollections[c] || "";
        let styleCell = normalizedStyles[c] || mainHeaderRow[c] || "";

        if (!colCell || colCell.length < 2) colCell = sheetName.toUpperCase().trim();
        if (!styleCell || styleCell.length < 2) styleCell = "STANDARD";

        pricing.push({
          manufacturer_id: manufacturerId,
          collection_name: colCell.toUpperCase().trim(),
          door_style: styleCell.toUpperCase().trim(),
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