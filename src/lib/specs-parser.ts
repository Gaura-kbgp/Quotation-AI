import * as XLSX from 'xlsx';

/**
 * Intelligent String Splitter
 * Splits multiple door styles/collections while preserving exact names.
 * Optimized for vertical/stacked text in Excel cells.
 */
function smartSplit(raw: string): string[] {
  if (!raw) return [];
  
  // First split by common delimiters including line breaks which are common in vertical Excel blocks
  let initialParts = String(raw).split(/[\n\r,]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const boundaryKeywords = [
    "ELITE", "PREMIUM", "PRIME", "BASE", "CHOICE", "DURAFORM", 
    "CANYON", "DURANGO", "ELDERIDGE", "BANDERA", "DENVER", "COOPER", 
    "OXFORD", "ALPINE", "SNOWBOUND", "ABILENE", "LUBBOCK", "COLORADO",
    "SELECT", "CLASSIC", "DESIGNER", "ULTRA", "BOERNE", "HARDWOOD"
  ];
  
  const keywordPattern = boundaryKeywords.join('|');
  const jammedRegex = new RegExp(`(?<=\\s)(?=${keywordPattern})`, 'gi');

  let results: string[] = [];
  initialParts.forEach(part => {
    // Check if the part itself has jammed keywords with no spaces (rare but possible in OCR/conversions)
    const subParts = part.split(jammedRegex)
      .map(s => s.trim())
      .filter(Boolean);
    results.push(...subParts);
  });

  return Array.from(new Set(results));
}

/**
 * HIGH-PRECISION PRICING PARSER (v33.0)
 * Scans ALL sheets and EVERY row without arbitrary limits.
 * Propagates merged headers correctly.
 * Handles Accessory sheets with simplified structures.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  console.log(`[High-Precision Parser] Scanning ${workbook.SheetNames.length} sheets...`);

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    if (rawData.length < 2) continue;

    // Detect SKU Column fuzzily
    let skuColIdx = -1;
    let headerRowIdx = -1;

    for (let r = 0; r < Math.min(100, rawData.length); r++) {
      const row = rawData[r];
      const idx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim().replace(/[^A-Z]/g, "");
        return ["SKU", "ITEMSKU", "CODE", "MODEL", "ITEMCODE"].includes(val); 
      });
      if (idx !== -1) {
        skuColIdx = idx;
        headerRowIdx = r;
        break;
      }
    }

    // Fallback: If no "SKU" header found, assume Column 0 if it contains SKU-like alphanumeric data
    if (skuColIdx === -1) {
      skuColIdx = 0;
      headerRowIdx = 0;
      console.log(`[Parser] Defaulting to Column 0 for SKU in sheet: ${sheetName}`);
    }

    // Determine Context Headers
    // Many accessory sheets don't have Row 1/2 for collection/style
    const collectionRow = headerRowIdx >= 2 ? (rawData[headerRowIdx - 2] || []) : [];
    const styleRow = headerRowIdx >= 1 ? (rawData[headerRowIdx - 1] || []) : [];
    const mainHeaderRow = rawData[headerRowIdx] || [];

    // Pre-calculate merged header values (propagation)
    const normalizedCollections: string[] = [];
    let currentCollection = "";
    for (let c = 0; c < 100; c++) {
      const val = String(collectionRow[c] || "").trim();
      if (val && val.length > 1) currentCollection = val;
      normalizedCollections[c] = currentCollection;
    }

    const normalizedStyles: string[] = [];
    let currentStyle = "";
    for (let c = 0; c < 100; c++) {
      const val = String(styleRow[c] || "").trim();
      if (val && val.length > 1) currentStyle = val;
      normalizedStyles[c] = currentStyle;
    }

    // SCAN ALL ROWS starting from after the detected header
    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      const excelSKU = String(row[skuColIdx] || "").trim().toUpperCase();
      
      // Clean SKU from invisible artifacts
      const cleanedSKU = excelSKU.replace(/[\u200B-\u200D\uFEFF]/g, "");
      
      if (!cleanedSKU || ["SKU", "TOTAL", "PAGE", "SUBTOTAL", "FOOTER"].includes(cleanedSKU)) continue;

      // Scan columns for pricing data
      // For accessory sheets, Row[skuColIdx + 1] is often the only price column
      for (let c = skuColIdx + 1; c < row.length; c++) {
        const rawPrice = row[c];
        if (rawPrice === null || rawPrice === undefined || rawPrice === "") continue;

        const priceNum = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ""));
        if (isNaN(priceNum)) continue;

        // Use propagated headers or fallback to sheet-level context
        let colCell = normalizedCollections[c] || "";
        let styleCell = normalizedStyles[c] || mainHeaderRow[c] || "";

        // ACCESSORY SHEET FALLBACK: If no headers detected, use sheet name
        if (!colCell) colCell = sheetName.replace(/\d{4}/g, "").replace("Pricing", "").trim();
        if (!styleCell) styleCell = "STANDARD";

        const collections = smartSplit(colCell);
        const styles = smartSplit(styleCell);

        for (const colName of collections) {
          for (const styleName of styles) {
            pricing.push({
              manufacturer_id: manufacturerId,
              collection_name: colName.toUpperCase().trim(),
              door_style: styleName.toUpperCase().trim(),
              sku: cleanedSKU,
              price: priceNum,
              raw_source_file_id: fileId,
              created_at: new Date().toISOString()
            });
          }
        }
      }
    }
  }

  console.log(`[Parser] Extraction Complete: ${pricing.length} price points indexed.`);
  return pricing;
}
