"use server";

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import * as XLSX from 'xlsx';

export async function createSession(token: string) {
  (await cookies()).set('kabs_admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  });
}

export async function logout() {
  (await cookies()).delete('kabs_admin_session');
  redirect('/admin/login');
}

/**
 * Parses an Excel/XLSM file and extracts cabinet specifications.
 */
export async function extractSpecifications(fileId: string, manufacturerId: string, fileUrl: string) {
  try {
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
    
    const specs: any[] = [];
    
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      
      // Basic extraction logic: 
      // This expects a header row and then data. 
      // In production, we'd add more complex heuristic detection for "Collections" and "Door Styles"
      if (data.length < 2) return;

      const headers = data[0];
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        // Simple mapping (Assuming Col 0 is Collection, Col 1 is Style, Col 2 is Finish)
        // This should be adjusted based on the actual manufacturer file layouts
        if (row[0] && row[1]) {
          specs.push({
            manufacturer_id: manufacturerId,
            collection_name: String(row[0]).trim(),
            door_style: String(row[1]).trim(),
            finish: row[2] ? String(row[2]).trim() : 'Standard',
            category: 'Cabinetry',
            raw_source_file_id: fileId
          });
        }
      }
    });

    if (specs.length > 0) {
      const { error } = await supabaseServer
        .from('manufacturer_specifications')
        .insert(specs);
      
      if (error) throw error;
    }

    return { success: true, count: specs.length };
  } catch (error: any) {
    console.error('Extraction Error:', error);
    return { success: false, error: error.message };
  }
}
