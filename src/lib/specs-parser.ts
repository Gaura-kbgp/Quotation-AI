import * as XLSX from 'xlsx';

/**
 * Enterprise Matrix Extraction Engine (v22.0)
 * Optimized for: 
 * - Row 1 (Index 0): Merged Collection Group headers (e.g. "ELITE CHERRY ELITE DUROFORM")
 * - Row 2 (Index 1): Merged Door style headers (e.g. "CANYON, BELCOURT")
 * - Row 3 (Index 2): SKU header label
 * - Row 4 (Index 3)+: Data rows
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  // Look specifically for the requested sheet name, fallback to first sheet
  const targetSheetName = workbook.SheetNames.find(n => n.includes('March 2025 SKU Pricing')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[targetSheetName];
  
  if (!sheet) return [];

  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
  if (rawData.length < 4) return [];

  // Header indices based on user requirements
  const collectionRow = rawData[0] || [];
  const styleRow = rawData[1] || [];
  const skuRowLabels = rawData[2] || [];

  // Identify SKU column index (usually column A or index 0)
  const skuColIdx = skuRowLabels.findIndex(cell => {
    const val = String(cell || "").toUpperCase().trim();
    return val === "SKU" || val === "MODEL";
  }) !== -1 ? skuRowLabels.findIndex(cell => String(cell || "").toUpperCase().trim() === "SKU") : 0;

  // Pre-process Merged Headers for Collections (Fill Forward logic)
  const normalizedCollectionsRaw: string[] = [];
  let currentRawCollection = "";
  for (let c = 0; c < collectionRow.length; c++) {
    const val = String(collectionRow[c] || "").trim();
    if (val && val.length > 2) currentRawCollection = val;
    normalizedCollectionsRaw[c] = currentRawCollection;
  }

  // Pre-process Merged Headers for Door Styles (Fill Forward logic)
  const normalizedStylesRaw: string[] = [];
  let currentRawStyle = "";
  for (let c = 0; c < styleRow.length; c++) {
    const val = String(styleRow[c] || "").trim();
    if (val && val.length > 2) currentRawStyle = val;
    normalizedStylesRaw[c] = currentRawStyle;
  }

  // Process Data Rows starting from Row 4 (Index 3)
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

      const rawColString = normalizedCollectionsRaw[c] || "";
      const rawStyleString = normalizedStylesRaw[c] || "";

      // SPLIT DE-MERGED COLLECTIONS using strict brand keywords
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

      // CARTESIAN PRODUCT: Link each collection to each style discovered in this column
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
