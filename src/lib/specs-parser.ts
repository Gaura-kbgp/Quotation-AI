import * as XLSX from 'xlsx';
import { normalizeSku } from './utils';

/**
 * Intelligent String Splitter
 * Splits multiple door styles/collections while preserving exact names.
 */
function smartSplit(raw: string): string[] {
  if (!raw) return [];
  
  let initialParts = String(raw).split(/[\n\r,]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const boundaryKeywords = [
    "ELITE", "PREMIUM", "PRIME", "BASE", "CHOICE", "DURAFORM", 
    "CANYON", "DURANGO", "ELDERIDGE", "BANDERA", "DENVER", "COOPER", 
    "OXFORD", "ALPINE", "SNOWBOUND", "ABILENE", "LUBBOCK", "COLORADO",
    "SELECT", "CLASSIC", "DESIGNER", "ULTRA", "BOERNE", "HARDWOOD",
    "ACCESSORY", "MOULDING", "HARDWARE", "DECORATIVE", "CROWN"
  ];
  
  const keywordPattern = boundaryKeywords.join('|');
  const jammedRegex = new RegExp(`(?<=\\s)(?=${keywordPattern})`, 'gi');

  let results: string[] = [];
  initialParts.forEach(part => {
    const subParts = part.split(jammedRegex)
      .map(s => s.trim())
      .filter(Boolean);
    results.push(...subParts);
  });

  return Array.from(new Set(results));
}

/**
 * HIGH-PRECISION PRICING PARSER (v36.0)
 * Scans ALL sheets and ALL rows without stopping at blank lines.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  // STEP 1: Scan EVERY sheet in the workbook
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // Use header: 1 to get a 2D array of ALL rows
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as any[][];
    if (rawData.length < 1) continue;

    let skuColIdx = -1;
    let headerRowIdx = -1;

    // STEP 2: Detect SKU Column Dynamically by searching the first 100 rows
    const skuHeaders = ["SKU", "ITEMSKU", "CODE", "MODEL", "ITEMCODE", "CATALOGCODE", "PARTNUMBER", "CABINETSKU", "MODELNUMBER", "ITEM"];
    
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

    // Capture potential Collection and Style headers from rows above the SKU header
    const collectionRow = headerRowIdx >= 2 ? (rawData[headerRowIdx - 2] || []) : [];
    const styleRow = headerRowIdx >= 1 ? (rawData[headerRowIdx - 1] || []) : [];
    const mainHeaderRow = rawData[headerRowIdx] || [];

    // Propagate merged headers across columns
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

    // STEP 3: Iterate through EVERY row starting after the header
    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      const rawExcelSKU = String(row[skuColIdx] || "").trim();
      
      // Basic validation: must have some content to be a SKU
      if (!rawExcelSKU || rawExcelSKU.length < 1) continue;
      
      const displaySKU = rawExcelSKU.toUpperCase();

      // Scan ALL other columns in this row for prices
      for (let c = 0; c < row.length; c++) {
        if (c === skuColIdx) continue;
        
        const rawValue = row[c];
        if (rawValue === null || rawValue === undefined || rawValue === "") continue;

        // Clean price string
        const priceStr = String(rawValue).replace(/[^\d.-]/g, "");
        const priceNum = parseFloat(priceStr);
        
        // Skip if not a valid price
        if (isNaN(priceNum) || priceNum <= 0) continue;

        // Resolve Collection and Style
        let colCell = normalizedCollections[c] || "";
        let styleCell = normalizedStyles[c] || mainHeaderRow[c] || "";

        // ACCESSORY SHEET FALLBACK: If headers are missing, use sheet name
        if (!colCell || colCell.length < 2) colCell = sheetName.toUpperCase().trim();
        if (!styleCell || styleCell.length < 2) styleCell = "STANDARD";

        const collections = smartSplit(colCell);
        const styles = smartSplit(styleCell);

        for (const colName of collections) {
          for (const styleName of styles) {
            pricing.push({
              manufacturer_id: manufacturerId,
              collection_name: colName.toUpperCase().trim(),
              door_style: styleName.toUpperCase().trim(),
              sku: displaySKU, // Preserve exact Excel formatting
              price: priceNum,
              raw_source_file_id: fileId,
              created_at: new Date().toISOString()
            });
          }
        }
      }
    }
  }

  return pricing;
}
