import * as XLSX from 'xlsx';

/**
 * Intelligent String Splitter (v28.0)
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
    "SELECT", "CLASSIC", "DESIGNER", "ULTRA"
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
 * STRICT EXACT SKU PARSER (v29.0)
 * Scans ALL sheets and extracts prices based on EXACT SKU column.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  console.log(`[Strict Parser] Scanning workbook with ${workbook.SheetNames.length} sheets...`);

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    if (rawData.length < 2) continue;

    // Detect SKU Column Exactly
    let skuColIdx = -1;
    let headerRowIdx = -1;

    for (let r = 0; r < Math.min(20, rawData.length); r++) {
      const row = rawData[r];
      const idx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim();
        return val === "SKU"; // EXACT MATCH FOR HEADER
      });
      if (idx !== -1) {
        skuColIdx = idx;
        headerRowIdx = r;
        break;
      }
    }

    if (skuColIdx === -1) {
      // Fallback to searching common aliases if "SKU" is strictly missing
      for (let r = 0; r < Math.min(20, rawData.length); r++) {
        const row = rawData[r];
        const idx = row.findIndex(cell => {
          const val = String(cell || "").toUpperCase().trim();
          return ["ITEM CODE", "CABINET CODE", "MODEL"].includes(val);
        });
        if (idx !== -1) {
          skuColIdx = idx;
          headerRowIdx = r;
          break;
        }
      }
    }

    if (skuColIdx === -1) continue;

    const collectionRow = rawData[Math.max(0, headerRowIdx - 2)] || [];
    const styleRow = rawData[Math.max(0, headerRowIdx - 1)] || [];
    const mainHeaderRow = rawData[headerRowIdx] || [];

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

    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      const rawSku = String(row[skuColIdx] || "").trim();
      
      if (!rawSku || ["SKU", "TOTAL", "PAGE"].includes(rawSku.toUpperCase())) continue;

      for (let c = skuColIdx + 1; c < row.length; c++) {
        const rawPrice = row[c];
        if (rawPrice === null || rawPrice === undefined || rawPrice === "") continue;

        const priceNum = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ""));
        if (isNaN(priceNum)) continue;

        const colCell = normalizedCollections[c] || sheetName;
        const styleCell = normalizedStyles[c] || mainHeaderRow[c] || "STANDARD";

        const collections = smartSplit(colCell);
        const styles = smartSplit(styleCell);

        for (const colName of collections) {
          for (const styleName of styles) {
            pricing.push({
              manufacturer_id: manufacturerId,
              collection_name: colName.toUpperCase().trim(),
              door_style: styleName.toUpperCase().trim(),
              sku: rawSku.toUpperCase().trim(), // STORE EXACT SKU
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
