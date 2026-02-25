"use server";

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import * as XLSX from 'xlsx';
import { revalidatePath } from 'next/cache';

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
 * Adds a new manufacturer to the database.
 */
export async function addManufacturer(name: string) {
  const supabase = createServerSupabase();
  
  const { data, error } = await supabase
    .from('manufacturers')
    .insert([{ name, status: 'Active' }])
    .select()
    .single();

  if (error) {
    console.error('Add Manufacturer Error:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/manufacturers');
  return { success: true, data };
}

/**
 * Deletes a manufacturer from the database.
 */
export async function deleteManufacturer(id: string) {
  const supabase = createServerSupabase();
  
  const { error } = await supabase
    .from('manufacturers')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Delete Manufacturer Error:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/manufacturers');
  return { success: true };
}

/**
 * Server-side file upload and record insertion to bypass browser connection issues.
 */
export async function uploadManufacturerFileAction(formData: FormData) {
  const supabase = createServerSupabase();
  const file = formData.get('file') as File;
  const manufacturerId = formData.get('manufacturerId') as string;
  const fileType = formData.get('fileType') as string;

  if (!file || !manufacturerId || !fileType) {
    return { success: false, error: 'Missing required upload data' };
  }

  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `${manufacturerId}/${fileType}s/${fileName}`;
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Storage
    // NOTE: Ensure the 'manufacturer-docs' bucket exists in your Supabase project with public access
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('manufacturer-docs')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true
      });

    if (uploadError) {
      console.error('Storage Upload Error:', uploadError);
      throw new Error(`Storage error: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage.from('manufacturer-docs').getPublicUrl(filePath);

    // Insert DB Record
    const { data: dbData, error: dbError } = await supabase
      .from('manufacturer_files')
      .insert([{
        manufacturer_id: manufacturerId,
        file_type: fileType,
        file_name: file.name,
        file_url: publicUrl,
        file_format: fileExt?.toLowerCase()
      }])
      .select()
      .single();

    if (dbError) {
      console.error('Database Insertion Error:', dbError);
      throw new Error(`Database error: ${dbError.message}`);
    }

    // Trigger Extraction for pricing files
    let extractionSummary = null;
    if (fileType === 'pricing') {
      const extRes = await extractSpecifications(dbData.id, manufacturerId, publicUrl);
      if (extRes.success) {
        extractionSummary = `Parsed ${extRes.count} specifications.`;
      }
    }

    revalidatePath(`/admin/manufacturers/${manufacturerId}`);
    return { success: true, data: dbData, extractionSummary };
  } catch (err: any) {
    console.error('Upload Action Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Deletes a file from storage and database.
 */
export async function deleteManufacturerFileAction(fileId: string, fileUrl: string, manufacturerId: string) {
  const supabase = createServerSupabase();
  
  try {
    // Extract relative path from public URL
    // Public URL format usually: .../storage/v1/object/public/manufacturer-docs/PATH
    const pathParts = fileUrl.split('/public/manufacturer-docs/');
    const path = pathParts.length > 1 ? pathParts[1] : null;

    if (path) {
      await supabase.storage.from('manufacturer-docs').remove([path]);
    }
    
    const { error } = await supabase.from('manufacturer_files').delete().eq('id', fileId);
    if (error) throw error;

    revalidatePath(`/admin/manufacturers/${manufacturerId}`);
    return { success: true };
  } catch (err: any) {
    console.error('Delete File Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Parses an Excel/XLSM file and extracts cabinet specifications.
 */
export async function extractSpecifications(fileId: string, manufacturerId: string, fileUrl: string) {
  const supabase = createServerSupabase();
  
  try {
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
    
    const specs: any[] = [];
    
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      
      if (data.length < 2) return;

      // Simple heuristic for cabinet specs: Row[0]=Collection, Row[1]=Style, Row[2]=Finish
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length < 2) continue;

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
      const { error } = await supabase
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
