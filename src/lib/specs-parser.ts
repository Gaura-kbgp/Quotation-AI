
import * as XLSX from 'xlsx';
import { normalizeSku, detectCategory } from './utils';

/**
 * High-Precision Enterprise Matrix Extraction Engine (v20.0)
 * Features:
 * - Multi-Sheet Processing (SKU Pricing, Accessory, Option Sheets)
 * - Matrix Style Splitting (Row 2 labels split by newlines/commas)
 * - Merged Cell Fill-Forward (Row 1 Collections)
 * - Category Auto-Detection
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    
    if (rawData.length < 3) continue;

    // 1. Locate SKU Anchor Row (Scan top 20 rows)
    let skuRowIdx = -1;
    let skuColIdx = -1;

    for (let r = 0; r < Math.min(rawData.length, 20); r++) {
      const row = rawData[r];
      const foundIdx = row.findIndex(cell => {
        const val = String(cell || "").toUpperCase().trim();
        return val === "SKU" || val === "MODEL" || val === "ITEM" || val === "CODE";
      });
      if (foundIdx !== -1) {
        skuRowIdx = r;
        skuColIdx = foundIdx;
        break;
      }
    }

    if (skuRowIdx === -1) {
      // List-style sheet fallback (e.g., Accessories without a matrix)
      processListSheet(rawData, sheetName, manufacturerId, fileId, pricing);
      continue;
    }

    // 2. Identify Matrix Headers
    const doorStyleRow = skuRowIdx > 0 ? rawData[skuRowIdx - 1] : [];
    const collectionRow = skuRowIdx > 1 ? rawData[skuRowIdx - 2] : [];

    // 3. Process Data Rows
    for (let r = skuRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      const rawSku = String(row[skuColIdx] || "").trim();

      if (!rawSku || rawSku.toUpperCase() === "SKU") continue;

      // Scan matrix columns for prices
      for (let c = skuColIdx + 1; c < row.length; c++) {
        const rawPrice = row[c];
        if (rawPrice === null || rawPrice === undefined || rawPrice === "") continue;

        const priceNum = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ""));
        if (isNaN(priceNum) || priceNum <= 0) continue;

        // Collection Fill-Forward
        let collection = "";
        for (let i = c; i >= skuColIdx + 1; i--) {
          const val = String(collectionRow[i] || "").trim();
          if (val && val.length > 2 && !val.includes("PRICING")) {
            collection = val;
            break;
          }
        }
        if (!collection) collection = sheetName;

        // Door Style Splitting (Enterprise Step 2 requirement)
        const styleGroupStr = String(doorStyleRow[c] || "").trim();
        if (!styleGroupStr) continue;

        const individualStyles = styleGroupStr
          .split(/[\n\r,;]+/)
          .map(s => s.trim())
          .filter(s => s.length > 1);

        const category = detectCategory(rawSku, sheetName);

        for (const style of individualStyles) {
          pricing.push({
            manufacturer_id: manufacturerId,
            collection_name: collection.toUpperCase().replace(/\s+/g, ' '),
            door_style: style.toUpperCase().replace(/\s+/g, ' '),
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

/**
 * Handles non-matrix sheets where prices are in a simple column.
 */
function processListSheet(data: any[][], sheetName: string, manufacturerId: string, fileId: string, pricing: any[]) {
  // Find SKU and PRICE columns
  const header = data[0].map(h => String(h || "").toUpperCase().trim());
  const skuIdx = header.findIndex(h => h === "SKU" || h === "MODEL" || h === "ITEM");
  const priceIdx = header.findIndex(h => h === "PRICE" || h === "BASE" || h === "NET");

  if (skuIdx === -1 || priceIdx === -1) return;

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const sku = String(row[skuIdx] || "").trim();
    const price = parseFloat(String(row[priceIdx] || "").replace(/[^0-9.]/g, ""));

    if (sku && !isNaN(price) && price > 0) {
      pricing.push({
        manufacturer_id: manufacturerId,
        collection_name: sheetName.toUpperCase(),
        door_style: "STANDARD",
        sku: sku.toUpperCase(),
        price,
        raw_source_file_id: fileId,
        created_at: new Date().toISOString()
      });
    }
  }
}
