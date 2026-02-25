import * as XLSX from 'xlsx';

/**
 * Utility to parse cabinet specifications from an Excel/CSV buffer.
 */
export async function parseSpecifications(buffer: Buffer, manufacturerId: string, fileId: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const specs: any[] = [];
  
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    // Skip empty sheets or those without headers
    if (data.length < 2) return;

    // Basic heuristic: Row 0 is often headers, Row 1+ is data
    // We expect: Collection Name, Door Style, Finish, Category (optional)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length < 2) continue;

      // Ensure we have at least collection and door style
      if (row[0] && row[1]) {
        specs.push({
          manufacturer_id: manufacturerId,
          collection_name: String(row[0]).trim(),
          door_style: String(row[1]).trim(),
          finish: row[2] ? String(row[2]).trim() : 'Standard',
          category: row[3] ? String(row[3]).trim() : 'Cabinetry',
          raw_source_file_id: fileId
        });
      }
    }
  });

  return specs;
}
