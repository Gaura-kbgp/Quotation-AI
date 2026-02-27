import * as XLSX from 'xlsx';

/**
 * Enterprise Matrix Extraction Engine (v22.0)
 * Optimized for: 
 * - Row 1: Merged Collection Group headers (e.g. "ELITE CHERRY ELITE DUROFORM")
 * - Row 2: Merged Door style headers (e.g. "CANYON, BELCOURT")
 * - Row 3: SKU header
 * - Row 4+: Data
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  // Look for the primary pricing sheet
  const targetSheetName = workbook.SheetNames.find(n => n.includes('SKU Pricing')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[targetSheetName];
  
  if (!sheet) return [];

  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
  if (rawData.length < 4) return [];

  // 1. Setup Header Rows
  const collectionRow = rawData[0] || [];
  const styleRow = rawData[1] || [];
  const skuRowIdx = 2; // Fixed SKU header at Row 3

  // 2. Identify the SKU column index
  const skuColIdx = collectionRow.findIndex(cell => {
    const val = String(cell || "").toUpperCase().trim();
    return val === "SKU" || val === "MODEL";
  }) !== -1 ? collectionRow.findIndex(cell => String(cell || "").toUpperCase().trim() === "SKU") : 0;

  // 3. Pre-process Merged Headers (Fill Forward Row 1)
  const normalizedCollectionsRaw: string[] = [];
  let currentRawCollection = "";
  for (let c = 0; c < collectionRow.length; c++) {
    const val = String(collectionRow[c] || "").trim();
    if (val && val.length > 2) currentRawCollection = val;
    normalizedCollectionsRaw[c] = currentRawCollection;
  }

  // 4. Process Data Rows (Start from Row 4)
  for (let r = 3; r < rawData.length; r++) {
    const row = rawData[r];
    const rawSku = String(row[skuColIdx] || "").trim();
    if (!rawSku || rawSku.toUpperCase() === "SKU") continue;

    // Scan matrix columns for prices (Starting after SKU column)
    for (let c = skuColIdx + 1; c < row.length; c++) {
      const rawPrice = row[c];
      if (rawPrice === null || rawPrice === undefined || rawPrice === "") continue;

      const priceNum = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ""));
      if (isNaN(priceNum) || priceNum <= 0) continue;

      const rawColString = normalizedCollectionsRaw[c] || targetSheetName;
      const rawStyleString = String(styleRow[c] || "").trim();

      // SPLIT DE-MERGED COLLECTIONS (Regex Lookahead)
      const collectionKeywords = "ELITE|PREMIUM|PRIME|BASE|CHOICE";
      const collections = rawColString
        .split(new RegExp(`(?=${collectionKeywords})`, "g"))
        .map(s => s.trim())
        .filter(s => s.length > 1);

      // SPLIT DE-MERGED STYLES (Comma or Newline)
      const styles = rawStyleString
        .split(/[\n\r,;]+/)
        .map(s => s.trim())
        .filter(s => s.length > 1);

      // CARTESIAN PRODUCT: For each split collection and each split style, save one record
      for (const colName of collections) {
        for (const styleName of styles) {
          pricing.push({
            manufacturer_id: manufacturerId,
            collection_name: colName.toUpperCase(),
            door_style: styleName.toUpperCase(),
            sku: rawSku.toUpperCase(),
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
