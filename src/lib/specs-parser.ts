import * as XLSX from 'xlsx';
import { normalizeSku } from './utils';

/**
 * Advanced Excel Specification Parser (v6.0).
 * Implements Header-Row Discovery and Deep Grid Extraction.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const specs: any[] = [];
  
  console.log("--- ADVANCED EXCEL PARSE START ---");

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // Use header: 1 to get raw arrays to find the header row
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    
    if (rawData.length === 0) continue;

    console.log(`Analyzing sheet: "${sheetName}" (${rawData.length} rows)`);
    
    // STEP 1: Find the Header Row (search first 20 rows)
    let headerRowIndex = -1;
    let codeColIdx = -1;
    let priceColIdx = -1;

    for (let i = 0; i < Math.min(rawData.length, 20); i++) {
      const row = rawData[i];
      const codeIdx = row.findIndex(cell => {
        const val = String(cell).toLowerCase();
        return val.includes("code") || val.includes("sku") || val.includes("model") || val.includes("item");
      });
      const priceIdx = row.findIndex(cell => {
        const val = String(cell).toLowerCase();
        return val.includes("price") || val.includes("msrp") || val.includes("list") || val.includes("cost");
      });

      if (codeIdx !== -1 && priceIdx !== -1) {
        headerRowIndex = i;
        codeColIdx = codeIdx;
        priceColIdx = priceIdx;
        break;
      }
    }

    if (headerRowIndex === -1) {
      console.warn(`Skipping sheet "${sheetName}": Could not detect header structure.`);
      continue;
    }

    console.log(`Detected Header at Row ${headerRowIndex + 1}. Code Col: ${codeColIdx}, Price Col: ${priceColIdx}`);

    // STEP 2: Extract Data starting from the row AFTER the header
    const headers = rawData[headerRowIndex];
    const dataRows = rawData.slice(headerRowIndex + 1);

    for (const row of dataRows) {
      const rawSku = row[codeColIdx];
      if (!rawSku || String(rawSku).trim() === "") continue;

      const cleanSku = normalizeSku(rawSku);
      if (!cleanSku || cleanSku.length < 2) continue;

      // Extract price and handle multiple pricing columns (Door Styles) if they exist
      // For now, we fetch the primary detected price column
      const rawPrice = row[priceColIdx];
      const cleanPrice = Number(String(rawPrice || "0").replace(/[^0-9.]/g, ""));

      if (cleanPrice > 0) {
        specs.push({
          manufacturer_id: manufacturerId,
          collection_name: sheetName,
          door_style: String(headers[priceColIdx] || "Standard"),
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
