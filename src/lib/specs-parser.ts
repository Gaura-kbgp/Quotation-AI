import * as XLSX from 'xlsx';

/**
 * Intelligent String Splitter
 * Detects concatenated strings without delimiters by looking for repeating brand prefixes.
 */
function smartSplit(raw: string): string[] {
  if (!raw) return [];
  
  const brandKeywords = ["ELITE", "PREMIUM", "PRIME", "BASE", "CHOICE", "DURAFORM"];
  const keywordPattern = brandKeywords.join('|');
  
  // Split based on brand keywords using a lookahead
  let parts = raw.split(new RegExp(`(?=${keywordPattern})`, 'g'))
    .map(s => s.trim())
    .filter(Boolean);

  // Remove duplicates
  return Array.from(new Set(parts));
}

/**
 * Enterprise Matrix Extraction Engine (v24.0)
 * Specifically tuned for:
 * Row 1: Collection Group Headers (Merged)
 * Row 2: Door Style Headers
 * Row 3: SKU Label Row
 * Row 4+: Data
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  // 1. Target the specific production sheet
  const targetSheetName = workbook.SheetNames.find(n => n.includes('March 2025 SKU Pricing')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[targetSheetName];
  
  if (!sheet) return [];

  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
  if (rawData.length < 4) return [];

  // 2. Identify Header Rows (Excel Index 1, 2, 3 -> JS Array 0, 1, 2)
  const collectionRow = rawData[0] || [];
  const styleRow = rawData[1] || [];
  const skuRowLabels = rawData[2] || [];

  // Find SKU Column Index (Usually index 0 or where 'SKU' is written)
  let skuColIdx = skuRowLabels.findIndex(cell => {
    const val = String(cell || "").toUpperCase().trim();
    return val === "SKU" || val === "MODEL";
  });
  if (skuColIdx === -1) skuColIdx = 0;

  // 3. Pre-process Headers with Merged-Cell Fill Forward
  const normalizedCollections: string[] = [];
  let currentCollection = "";
  for (let c = 0; c < collectionRow.length; c++) {
    const val = String(collectionRow[c] || "").trim();
    if (val && val.length > 1) currentCollection = val;
    normalizedCollections[c] = currentCollection;
  }

  const normalizedStyles: string[] = [];
  let currentStyle = "";
  for (let c = 0; c < styleRow.length; c++) {
    const val = String(styleRow[c] || "").trim();
    if (val && val.length > 1) currentStyle = val;
    normalizedStyles[c] = currentStyle;
  }

  // 4. Process Data Rows (Starting at row index 3)
  for (let r = 3; r < rawData.length; r++) {
    const row = rawData[r];
    const rawSku = String(row[skuColIdx] || "").trim();
    
    // Skip empty SKU rows or header repetitions
    if (!rawSku || rawSku.toUpperCase() === "SKU") continue;

    // Iterate through price columns
    for (let c = skuColIdx + 1; c < row.length; c++) {
      const rawPrice = row[c];
      if (rawPrice === null || rawPrice === undefined || rawPrice === "") continue;

      const priceNum = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ""));
      if (isNaN(priceNum) || priceNum <= 0) continue;

      // Extract Collection and Style for this specific column
      const colCell = normalizedCollections[c];
      const styleCell = normalizedStyles[c];

      // Handle cases where headers are concatenated in one cell
      const collections = smartSplit(colCell);
      const styles = smartSplit(styleCell);

      // Create Cartesian product entries (Collection x Style)
      for (const colName of collections) {
        for (const styleName of styles) {
          pricing.push({
            manufacturer_id: manufacturerId,
            collection_name: colName.toUpperCase().trim(),
            door_style: styleName.toUpperCase().trim(),
            sku: rawSku.toUpperCase().trim(),
            price: priceNum,
            raw_source_file_id: fileId,
            created_at: new Date().toISOString()
          });
        }
      }
    }
  }

  return pricing;
}
