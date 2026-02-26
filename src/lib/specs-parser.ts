import * as XLSX from 'xlsx';
import { normalizeSku } from './utils';

/**
 * Precision Excel Specification Parser (v5.0).
 * Implements Dynamic Column Detection and Strong Normalization.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const specs: any[] = [];
  
  console.log("--- EXCEL PARSE START ---");
  console.log("Sheet Names:", workbook.SheetNames);

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as any[];
    
    if (rows.length === 0) continue;

    console.log(`Analyzing sheet: "${sheetName}" (${rows.length} rows)`);
    
    // STEP 1 & 2: LOG STRUCTURE & DETECT COLUMNS
    const sampleRow = rows[0];
    const keys = Object.keys(sampleRow);
    console.log("First row sample keys:", keys);

    const codeColumn = keys.find(col =>
      col.toLowerCase().includes("code") ||
      col.toLowerCase().includes("sku") ||
      col.toLowerCase().includes("model") ||
      col.toLowerCase().includes("item") ||
      col.toLowerCase().includes("catalog")
    );

    const priceColumn = keys.find(col =>
      col.toLowerCase().includes("price") ||
      col.toLowerCase().includes("msrp") ||
      col.toLowerCase().includes("list") ||
      col.toLowerCase().includes("cost")
    );

    console.log("Detected Code Column:", codeColumn);
    console.log("Detected Price Column:", priceColumn);

    if (!codeColumn || !priceColumn) {
      console.warn(`Skipping sheet "${sheetName}": Missing code or price column.`);
      continue;
    }

    // STEP 3: DATA EXTRACTION WITH STRONG NORMALIZATION
    for (const row of rows) {
      const rawSku = row[codeColumn];
      if (!rawSku) continue;

      const cleanSku = normalizeSku(rawSku);
      if (!cleanSku || cleanSku.length < 2) continue;

      // STEP 7: HANDLE PRICE CLEANING
      const rawPrice = row[priceColumn];
      const cleanPrice = Number(
        String(rawPrice || "0")
          .replace(/[^0-9.]/g, "")
      );

      if (cleanPrice > 0) {
        specs.push({
          manufacturer_id: manufacturerId,
          collection_name: sheetName,
          door_style: priceColumn, // Use price header as door style context
          sku: cleanSku,
          price: cleanPrice,
          raw_source_file_id: fileId,
          created_at: new Date().toISOString()
        });
      }
    }
  }

  console.log(`--- EXCEL PARSE END: Extracted ${specs.length} records ---`);
  return specs;
}
