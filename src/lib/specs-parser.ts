
import * as XLSX from 'xlsx';
import { normalizeSku } from './utils';

/**
 * Advanced Excel Specification Parser (v7.0).
 * Implements Dynamic Header Search and Unified Normalization.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    
    if (rawData.length === 0) continue;

    // STEP 1: Dynamic Column Detection
    let headerRowIndex = -1;
    let codeColIdx = -1;
    let priceColIdx = -1;

    for (let i = 0; i < Math.min(rawData.length, 25); i++) {
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

    if (headerRowIndex === -1) continue;

    const headers = rawData[headerRowIndex];
    const dataRows = rawData.slice(headerRowIndex + 1);

    for (const row of dataRows) {
      const rawSku = row[codeColIdx];
      if (!rawSku || String(rawSku).trim() === "") continue;

      const normSku = normalizeSku(rawSku);
      const rawPrice = row[priceColIdx];
      const cleanPrice = Number(String(rawPrice || "0").replace(/[^0-9.]/g, ""));

      if (cleanPrice > 0) {
        pricing.push({
          manufacturer_id: manufacturerId,
          collection_name: sheetName,
          door_style: String(headers[priceColIdx] || "Standard"),
          sku: String(rawSku).trim(), // Store original for display, normalize during match
          price: cleanPrice,
          raw_source_file_id: fileId,
          created_at: new Date().toISOString()
        });
      }
    }
  }

  return pricing;
}
