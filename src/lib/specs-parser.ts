import * as XLSX from 'xlsx';

/**
 * Intelligent String Splitter
 * Detects concatenated strings without delimiters by looking for repeating prefixes.
 * Example: "CANYON CHERRY CANYON DFO" -> ["CANYON CHERRY", "CANYON DFO"]
 */
function smartSplit(raw: string, brandKeywords: string[] = []): string[] {
  if (!raw) return [];
  
  // 1. Initial split by common delimiters
  let parts = raw.split(/[\n\r,;]+/).map(s => s.trim()).filter(Boolean);
  
  // 2. If it's a single block, check for internal brand concatenation (e.g. "ELITE CHERRYELITE DUROFORM")
  if (parts.length === 1 && brandKeywords.length > 0) {
    const keywordPattern = brandKeywords.join('|');
    parts = parts[0]
      .split(new RegExp(`(?=${keywordPattern})`, 'g'))
      .map(s => s.trim())
      .filter(Boolean);
  }

  // 3. Handle word repetition within a single part (e.g. "CANYON CHERRY CANYON DFO")
  const finalParts: string[] = [];
  parts.forEach(part => {
    const words = part.split(/\s+/);
    if (words.length > 2) {
      const firstWord = words[0];
      const indices: number[] = [];
      for (let i = 1; i < words.length; i++) {
        if (words[i] === firstWord) indices.push(i);
      }
      
      if (indices.length > 0) {
        let start = 0;
        [...indices, words.length].forEach(idx => {
          const subPart = words.slice(start, idx).join(' ').trim();
          if (subPart) finalParts.push(subPart);
          start = idx;
        });
      } else {
        finalParts.push(part);
      }
    } else {
      finalParts.push(part);
    }
  });

  return Array.from(new Set(finalParts));
}

/**
 * Enterprise Matrix Extraction Engine (v23.0)
 * Optimized for: 
 * - Row 1 (Index 0): Merged Collection Group headers
 * - Row 2 (Index 1): Merged Door style headers
 * - Row 3 (Index 2): SKU header label
 * - Row 4 (Index 3)+: Data rows
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  const targetSheetName = workbook.SheetNames.find(n => n.includes('March 2025 SKU Pricing')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[targetSheetName];
  
  if (!sheet) return [];

  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
  if (rawData.length < 4) return [];

  const collectionRow = rawData[0] || [];
  const styleRow = rawData[1] || [];
  const skuRowLabels = rawData[2] || [];

  const skuColIdx = skuRowLabels.findIndex(cell => {
    const val = String(cell || "").toUpperCase().trim();
    return val === "SKU" || val === "MODEL";
  }) !== -1 ? skuRowLabels.findIndex(cell => String(cell || "").toUpperCase().trim() === "SKU") : 0;

  // Pre-process Headers with Fill Forward
  const normalizedCollectionsRaw: string[] = [];
  let currentRawCollection = "";
  for (let c = 0; c < collectionRow.length; c++) {
    const val = String(collectionRow[c] || "").trim();
    if (val && val.length > 2) currentRawCollection = val;
    normalizedCollectionsRaw[c] = currentRawCollection;
  }

  const normalizedStylesRaw: string[] = [];
  let currentRawStyle = "";
  for (let c = 0; c < styleRow.length; c++) {
    const val = String(styleRow[c] || "").trim();
    if (val && val.length > 2) currentRawStyle = val;
    normalizedStylesRaw[c] = currentRawStyle;
  }

  const brandKeywords = ["ELITE", "PREMIUM", "PRIME", "BASE", "CHOICE", "DURAFORM"];

  // Process Data Rows
  for (let r = 3; r < rawData.length; r++) {
    const row = rawData[r];
    const rawSku = String(row[skuColIdx] || "").trim();
    if (!rawSku || rawSku.toUpperCase() === "SKU") continue;

    for (let c = skuColIdx + 1; c < row.length; c++) {
      const rawPrice = row[c];
      if (rawPrice === null || rawPrice === undefined || rawPrice === "") continue;

      const priceNum = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ""));
      if (isNaN(priceNum) || priceNum <= 0) continue;

      // DE-MERGE COLLECTIONS AND STYLES
      const collections = smartSplit(normalizedCollectionsRaw[c], brandKeywords);
      const styles = smartSplit(normalizedStylesRaw[c]);

      // Generate Cartesian Product of Records
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
