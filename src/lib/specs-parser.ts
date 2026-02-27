import * as XLSX from 'xlsx';
import { normalizeSku } from './utils';

/**
 * Enterprise Matrix Extraction Engine (v21.0)
 * Optimized for: Row 1 (Collection), Row 2 (Door Style), Row 3 (SKU)
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  // Prioritize "March 2025 SKU Pricing" sheet
  const mainSheetName = workbook.SheetNames.find(n => n.includes('SKU Pricing')) || workbook.SheetNames[0];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    
    if (rawData.length < 4) continue;

    // 1. Identify Row 1 (Collection Group) and Row 2 (Door Styles)
    const collectionRow = rawData[0] || [];
    const styleRow = rawData[1] || [];
    const skuRowIdx = 2; // Fixed SKU header at Row 3
    const skuColIdx = collectionRow.findIndex(cell => {
      const val = String(cell || "").toUpperCase().trim();
      return val === "SKU" || val === "MODEL";
    }) !== -1 ? collectionRow.findIndex(cell => String(cell || "").toUpperCase().trim() === "SKU") : 0;

    // 2. Pre-process merged headers (Fill Forward Row 1)
    const normalizedCollections: string[] = [];
    let currentCollection = "";
    for (let c = 0; c < collectionRow.length; c++) {
      const val = String(collectionRow[c] || "").trim();
      if (val && val.length > 2) currentCollection = val.toUpperCase();
      normalizedCollections[c] = currentCollection;
    }

    // 3. Process Data Rows (Start from Row 4)
    for (let r = 3; r < rawData.length; r++) {
      const row = rawData[r];
      const rawSku = String(row[skuColIdx] || "").trim();
      if (!rawSku || rawSku.toUpperCase() === "SKU") continue;

      // Scan matrix columns for prices
      for (let c = skuColIdx + 1; c < row.length; c++) {
        const rawPrice = row[c];
        if (rawPrice === null || rawPrice === undefined || rawPrice === "") continue;

        const priceNum = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ""));
        if (isNaN(priceNum) || priceNum <= 0) continue;

        const collection = normalizedCollections[c] || sheetName.toUpperCase();
        const styleGroupStr = String(styleRow[c] || "").trim().toUpperCase();
        
        if (!styleGroupStr) continue;

        // Handle split door styles (comma or newline)
        const individualStyles = styleGroupStr
          .split(/[\n\r,;]+/)
          .map(s => s.trim())
          .filter(s => s.length > 1);

        for (const style of individualStyles) {
          pricing.push({
            manufacturer_id: manufacturerId,
            collection_name: collection,
            door_style: style,
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
