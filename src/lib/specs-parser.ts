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
    "ACCESSORY", "MOULDING", "HARDWARE"
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

    // Scan for SKU column header
    for (let r = 0; r < Math.min(100, rawData.length); r++) {
      const row = rawData[r];
      const idx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim().replace(/[^A-Z]/g, "");
        return ["SKU", "ITEMSKU", "CODE", "MODEL", "ITEMCODE", "CATALOGCODE"].includes(val); 
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

    // Accessory sheets usually have sheet names as the collection identifier
    const defaultCollection = sheetName.replace(/\d+/g, "").replace("Pricing", "").trim().toUpperCase();

    const collectionRow = headerRowIdx >= 2 ? (rawData[headerRowIdx - 2] || []) : [];
    const styleRow = headerRowIdx >= 1 ? (rawData[headerRowIdx - 1] || []) : [];
    const mainHeaderRow = rawData[headerRowIdx] || [];

    const normalizedCollections: string[] = [];
    let currentCollection = "";
    for (let c = 0; c < 200; c++) {
      const val = String(collectionRow[c] || "").trim();
      if (val && val.length > 1) currentCollection = val;
      normalizedCollections[c] = currentCollection;
    }

    const normalizedStyles: string[] = [];
    let currentStyle = "";
    for (let c = 0; c < 200; c++) {
      const val = String(styleRow[c] || "").trim();
      if (val && val.length > 1) currentStyle = val;
      normalizedStyles[c] = currentStyle;
    }

    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      const rawExcelSKU = String(row[skuColIdx] || "").trim();
      if (!rawExcelSKU) continue;

      // COMPRESSED NORMALIZATION: Standardize keys for matching
      const indexedSKU = normalizeSku(rawExcelSKU);
      
      if (!indexedSKU || ["SKU", "TOTAL", "PAGE", "SUBTOTAL", "FOOTER", "GRAND"].includes(indexedSKU)) continue;

      for (let c = skuColIdx + 1; c < row.length; c++) {
        const rawPrice = row[c];
        if (rawPrice === null || rawPrice === undefined || rawPrice === "") continue;

        const priceNum = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ""));
        if (isNaN(priceNum)) continue;

        let colCell = normalizedCollections[c] || "";
        let styleCell = normalizedStyles[c] || mainHeaderRow[c] || "";

        // Fallback for accessory sheets
        if (!colCell) colCell = defaultCollection;
        if (!styleCell) styleCell = "STANDARD";

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
