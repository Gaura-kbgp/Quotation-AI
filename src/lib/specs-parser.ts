import * as XLSX from 'xlsx';

/**
 * Intelligent String Splitter (v25.0)
 * Handles multi-value cells in Excel (Newlines, Commas, and concatenated strings).
 * Corrects the issue where multiple styles were merged into a single dropdown option.
 */
function smartSplit(raw: string): string[] {
  if (!raw) return [];
  
  // 1. Standardize and split by explicit delimiters (Newline, Carriage Return, Comma)
  // This handles cells where styles are listed vertically or separated by commas.
  let initialParts = String(raw).split(/[\n\r,]+/)
    .map(s => s.trim())
    .filter(Boolean);

  // 2. Secondary split for "jammed" strings without clear delimiters
  // We use common cabinetry prefixes and brand keywords as split points.
  const boundaryKeywords = [
    "ELITE", "PREMIUM", "PRIME", "BASE", "CHOICE", "DURAFORM", 
    "CANYON", "DURANGO", "ELDERIDGE", "BANDERA", "DENVER", "COOPER", 
    "OXFORD", "ALPINE", "SNOWBOUND", "ABILENE", "LUBBOCK", "COLORADO",
    "SELECT", "CLASSIC", "DESIGNER", "ULTRA", "ELITE", "PRIME"
  ];
  
  const keywordPattern = boundaryKeywords.join('|');
  
  // Regex Logic: Look for a keyword that is preceded by a space.
  // This allows "CANYON CHERRY" to stay together, but splits "CHERRY CANYON"
  // into ["CHERRY", "CANYON"] if they were jammed in one cell.
  const jammedRegex = new RegExp(`(?<=\\s)(?=${keywordPattern})`, 'gi');

  let results: string[] = [];
  initialParts.forEach(part => {
    const subParts = part.split(jammedRegex)
      .map(s => s.trim())
      .filter(Boolean);
    results.push(...subParts);
  });

  // 3. Final clean: Remove duplicates and return unique items
  return Array.from(new Set(results));
}

/**
 * Enterprise Matrix Extraction Engine (v25.0)
 * Specifically tuned for multi-row headers and merged multi-value cells.
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

  // 2. Identify Header Rows
  const collectionRow = rawData[0] || [];
  const styleRow = rawData[1] || [];
  const skuRowLabels = rawData[2] || [];

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
    
    if (!rawSku || rawSku.toUpperCase() === "SKU") continue;

    for (let c = skuColIdx + 1; c < row.length; c++) {
      const rawPrice = row[c];
      if (rawPrice === null || rawPrice === undefined || rawPrice === "") continue;

      const priceNum = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ""));
      if (isNaN(priceNum) || priceNum <= 0) continue;

      // Extract and split potentially multi-value headers
      const colCell = normalizedCollections[c];
      const styleCell = normalizedStyles[c];

      const collections = smartSplit(colCell);
      const styles = smartSplit(styleCell);

      // Create Cartesian product entries (Collection x Style)
      // This ensures "Elite Cherry, Elite Maple" becomes two separate searchable entries.
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
