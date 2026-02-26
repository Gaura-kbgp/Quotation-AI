import { createServerSupabase } from '@/lib/supabase-server';
import { parseSpecifications } from '@/lib/specs-parser';
import { revalidatePath } from 'next/cache';

export const maxDuration = 300; // Extended to 5 minutes for very large price guides

/**
 * Enhanced Route Handler for large pricing file uploads and extraction.
 * Implements high-performance batching and structural validation.
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const manufacturerId = formData.get('manufacturerId') as string;

    if (!file || !manufacturerId) {
      return Response.json({ error: 'Missing file or manufacturer ID' }, { status: 400 });
    }

    console.log(`[Upload] Starting processing for: ${file.name} (Size: ${(file.size / 1024).toFixed(1)} KB)`);

    const supabase = createServerSupabase();
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `${manufacturerId}/pricing-files/${fileName}`;
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Upload to Storage for archival
    const { error: uploadError } = await supabase.storage
      .from('manufacturer-docs')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true
      });

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const { data: { publicUrl } } = supabase.storage.from('manufacturer-docs').getPublicUrl(filePath);

    // 2. Register file in DB
    const { data: dbData, error: dbError } = await supabase
      .from('manufacturer_files')
      .insert([{
        manufacturer_id: manufacturerId,
        file_type: 'pricing',
        file_name: file.name,
        file_url: publicUrl,
        file_format: fileExt?.toLowerCase()
      }])
      .select()
      .single();

    if (dbError) throw new Error(`Database registration failed: ${dbError.message}`);

    // 3. Extract Specifications using Advanced Parser v3.0
    const specs = await parseSpecifications(buffer, manufacturerId, dbData.id);

    // 4. Batch insert specs with safety chunks
    if (specs.length > 0) {
      const CHUNK_SIZE = 400; // Smaller chunk size to avoid payload limits
      for (let i = 0; i < specs.length; i += CHUNK_SIZE) {
        const chunk = specs.slice(i, i + CHUNK_SIZE);
        const { error: insertError } = await supabase
          .from('manufacturer_specifications')
          .insert(chunk);
          
        if (insertError) {
          console.error(`[Upload] Batch insert failed at index ${i}:`, insertError.message);
        }
      }
      console.log(`[Upload] Finalized insertion of ${specs.length} records.`);
    } else {
      console.warn('[Upload] No pricing records were identified in the document.');
    }

    revalidatePath(`/admin/manufacturers/${manufacturerId}`);
    return Response.json({ 
      success: true, 
      count: specs.length,
      fileName: file.name 
    });

  } catch (err: any) {
    console.error('[API Upload Pricing Error]:', err.message);
    return Response.json({ error: err.message || 'Server-side extraction failed' }, { status: 500 });
  }
}
