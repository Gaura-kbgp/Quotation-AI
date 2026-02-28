import * as XLSX from 'xlsx';

/**
 * Intelligent String Splitter (v28.0)
 * Handles multi-value cells in Excel (Newlines, Commas, and concatenated strings).
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
 * Enterprise Matrix Extraction Engine (v28.0)
 * Specifically tuned for multi-sheet workbooks and dynamic column discovery.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  console.log(`[Specs Parser] Scanning workbook with ${workbook.SheetNames.length} sheets...`);

  // STEP 1: Loop through ALL sheets
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    if (rawData.length < 2) continue;

    // STEP 2: Detect SKU Column Dynamically
    let skuColIdx = -1;
    let headerRowIdx = -1;

    for (let r = 0; r < Math.min(15, rawData.length); r++) {
      const row = rawData[r];
      const idx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim();
        return ["SKU", "ITEM CODE", "CABINET CODE", "PRODUCT CODE", "MODEL", "PART #"].includes(val);
      });
      if (idx !== -1) {
        skuColIdx = idx;
        headerRowIdx = r;
        break;
      }
    }

    // Fallback if no header found
    if (skuColIdx === -1) {
      skuColIdx = 0;
      headerRowIdx = 0;
    }

    console.log(`[Specs Parser] Processing sheet: "${sheetName}" | SKU Column: ${skuColIdx} | Header Row: ${headerRowIdx}`);

    // STEP 3: Header Normalization (Merged Cell Fill-Forward)
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

    // STEP 4: Full Row Scan
    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      const rawSku = String(row[skuColIdx] || "").trim();
      
      if (!rawSku || ["SKU", "TOTAL", "PAGE"].includes(rawSku.toUpperCase())) continue;

      // Scan all columns for numeric prices
      for (let c = skuColIdx + 1; c < row.length; c++) {
        const rawPrice = row[c];
        if (rawPrice === null || rawPrice === undefined || rawPrice === "") continue;

        const priceNum = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ""));
        if (isNaN(priceNum) || priceNum <= 0) continue;

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
              sku: rawSku.toUpperCase().trim(),
              price: priceNum,
              raw_source_file_id: fileId,
              created_at: new Date().toISOString()
            });
          }
        }
      }
    }
  }

  console.log(`[Specs Parser] Total records extracted across all sheets: ${pricing.length}`);
  return pricing;
}
