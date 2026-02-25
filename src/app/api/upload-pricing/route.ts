import { createServerSupabase } from '@/lib/supabase-server';
import { parseSpecifications } from '@/lib/specs-parser';
import { revalidatePath } from 'next/cache';

/**
 * Route Handler for large pricing file uploads and extraction.
 * Bypasses Server Action 1MB limit.
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const manufacturerId = formData.get('manufacturerId') as string;

    if (!file || !manufacturerId) {
      return Response.json({ error: 'Missing file or manufacturer ID' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `${manufacturerId}/pricing-files/${fileName}`;
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Upload to Storage
    const { error: uploadError } = await supabase.storage
      .from('manufacturer-docs')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from('manufacturer-docs').getPublicUrl(filePath);

    // 2. Save record to DB
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

    if (dbError) throw dbError;

    // 3. Extract Specifications
    const specs = await parseSpecifications(buffer, manufacturerId, dbData.id);

    // 4. Batch insert specs (chunks of 500)
    if (specs.length > 0) {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < specs.length; i += CHUNK_SIZE) {
        const chunk = specs.slice(i, i + CHUNK_SIZE);
        const { error: insertError } = await supabase
          .from('manufacturer_specifications')
          .insert(chunk);
        if (insertError) console.error('Batch insert error:', insertError);
      }
    }

    revalidatePath(`/admin/manufacturers/${manufacturerId}`);
    return Response.json({ 
      success: true, 
      count: specs.length,
      fileName: file.name 
    });

  } catch (err: any) {
    console.error('API Upload Pricing Error:', err);
    return Response.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
