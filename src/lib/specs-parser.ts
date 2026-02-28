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
 * HIGH-PRECISION PRICING PARSER (v35.0)
 * Optimized for Accessory Sheets and Universal Part Extraction.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    if (rawData.length < 2) continue;

    let skuColIdx = -1;
    let headerRowIdx = -1;

    // Scan for SKU column header with expanded detection
    const skuHeaders = ["SKU", "ITEMSKU", "CODE", "MODEL", "ITEMCODE", "CATALOGCODE", "PARTNUMBER", "CABINETSKU", "MODELNUMBER"];
    
    for (let r = 0; r < Math.min(200, rawData.length); r++) {
      const row = rawData[r];
      const idx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim().replace(/[^A-Z]/g, "");
        return skuHeaders.includes(val); 
      });
      if (idx !== -1) {
        skuColIdx = idx;
        headerRowIdx = r;
        break;
      }
    }

    // Default to column A if no header found, but scan first 10 rows for alphanumeric consistency
    if (skuColIdx === -1) {
      skuColIdx = 0;
      headerRowIdx = 0;
    }

    // Accessory sheets identifier
    const defaultCollection = sheetName.replace(/\d+/g, "").replace("Pricing", "").trim().toUpperCase();

    const collectionRow = headerRowIdx >= 2 ? (rawData[headerRowIdx - 2] || []) : [];
    const styleRow = headerRowIdx >= 1 ? (rawData[headerRowIdx - 1] || []) : [];
    const mainHeaderRow = rawData[headerRowIdx] || [];

    const normalizedCollections: string[] = [];
    let currentCollection = "";
    for (let c = 0; c < 300; c++) {
      const val = String(collectionRow[c] || "").trim();
      if (val && val.length > 1) currentCollection = val;
      normalizedCollections[c] = currentCollection;
    }

    const normalizedStyles: string[] = [];
    let currentStyle = "";
    for (let c = 0; c < 300; c++) {
      const val = String(styleRow[c] || "").trim();
      if (val && val.length > 1) currentStyle = val;
      normalizedStyles[c] = currentStyle;
    }

    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      const rawExcelSKU = String(row[skuColIdx] || "").trim();
      if (!rawExcelSKU) continue;

      const indexedSKU = normalizeSku(rawExcelSKU);
      
      // Filter out obvious noise rows
      if (!indexedSKU || indexedSKU.length < 2 || ["SKU", "TOTAL", "PAGE", "SUBTOTAL", "FOOTER", "GRAND", "CONTINUED"].includes(indexedSKU)) continue;

      // Scan ALL columns for prices to handle non-standard accessory layouts
      for (let c = 0; c < row.length; c++) {
        if (c === skuColIdx) continue;
        
        const rawPrice = row[c];
        if (rawPrice === null || rawPrice === undefined || rawPrice === "") continue;

        // Clean price string of currency symbols and commas
        const priceNum = parseFloat(String(rawPrice).replace(/[^\d.-]/g, ""));
        if (isNaN(priceNum) || priceNum === 0) continue;

        let colCell = normalizedCollections[c] || "";
        let styleCell = normalizedStyles[c] || mainHeaderRow[c] || "";

        // Fallback for accessory sheets
        if (!colCell || colCell.length < 2) colCell = defaultCollection;
        if (!styleCell || styleCell.length < 2) styleCell = "STANDARD";

        const collections = smartSplit(colCell);
        const styles = smartSplit(styleCell);

        for (const colName of collections) {
          for (const styleName of styles) {
            pricing.push({
              manufacturer_id: manufacturerId,
              collection_name: colName.toUpperCase().trim(),
              door_style: styleName.toUpperCase().trim(),
              sku: indexedSKU,
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