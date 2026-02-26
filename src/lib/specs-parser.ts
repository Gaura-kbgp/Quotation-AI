
import * as XLSX from 'xlsx';
import { normalizeSku } from './utils';

/**
 * Precision Grid-Matrix Parser (v8.0)
 * Optimized for Cabinetry Price Books where:
 * - Column A: SKUs
 * - Row 3: Door Style Names
 * - Columns B-G: Prices for those styles
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const pricing: any[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    
    if (rawData.length < 4) continue;

    // STEP 1: Identify SKU Column and Header Row
    // Based on user image, SKU header is at A3.
    let skuColIdx = -1;
    let headerRowIdx = -1;

    for (let r = 0; r < 10; r++) {
      const row = rawData[r];
      const idx = row.findIndex(cell => String(cell).toUpperCase().trim() === "SKU");
      if (idx !== -1) {
        skuColIdx = idx;
        headerRowIdx = r;
        break;
      }
    }

    if (skuColIdx === -1) continue;

    const doorStyleHeaders = rawData[headerRowIdx];
    const collectionHeaders = rawData[headerRowIdx - 2] || []; // ELITE CHERRY etc.
    const dataRows = rawData.slice(headerRowIdx + 1);

    // STEP 2: Process every data row
    for (const row of dataRows) {
      const rawSku = row[skuColIdx];
      if (!rawSku || String(rawSku).trim() === "" || String(rawSku).toLowerCase().includes("sku")) continue;

      // Skip decorative separator rows like "WITH FULL HEIGHT DOOR"
      if (String(rawSku).toUpperCase().includes("DOOR") && row.length < 3) continue;

      // STEP 3: Iterate through price columns (every column after SKU)
      for (let c = skuColIdx + 1; c < row.length; c++) {
        const doorStyle = String(doorStyleHeaders[c] || "").trim();
        const collection = String(collectionHeaders[c] || collectionHeaders[c-1] || sheetName).trim();
        const rawPrice = row[c];

        // Clean price: handle "N/A", currency symbols, and spaces
        const priceStr = String(rawPrice).replace(/[^0-9.]/g, "");
        const price = parseFloat(priceStr);

        if (!isNaN(price) && price > 0 && doorStyle !== "") {
          pricing.push({
            manufacturer_id: manufacturerId,
            collection_name: collection || "Standard",
            door_style: doorStyle,
            sku: String(rawSku).trim(),
            price: price,
            raw_source_file_id: fileId,
            created_at: new Date().toISOString()
          });
        }
      }
    }
  }

  console.log(`[Specs Parser] Extracted ${pricing.length} grid-matrix records.`);
  return pricing;
}
