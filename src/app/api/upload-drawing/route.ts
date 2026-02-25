import { createServerSupabase } from '@/lib/supabase-server';
import { analyzeDrawing } from '@/ai/flows/analyze-drawing-flow';

export const maxDuration = 300; // 5-minute threshold for heavy AI tasks

/**
 * Optimized API Route Handler for architectural PDF uploads.
 * Uses parallel execution to prevent 504 Gateway Timeouts.
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const projectName = (formData.get('projectName') as string) || 'Untitled Project';

    if (!file) {
      return Response.json({ error: 'No drawing PDF provided.' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const dataUri = `data:application/pdf;base64,${buffer.toString('base64')}`;

    // 1. Parallelize AI Analysis and Storage Upload
    const fileName = `quotations/drawings/${crypto.randomUUID()}.pdf`;
    
    const [aiResult, uploadRes] = await Promise.all([
      analyzeDrawing({ pdfDataUri: dataUri }),
      supabase.storage
        .from('manufacturer-docs')
        .upload(fileName, buffer, {
          contentType: 'application/pdf',
          upsert: true
        })
    ]);

    if (uploadRes.error) throw new Error(`Storage error: ${uploadRes.error.message}`);
    
    const { data: { publicUrl } } = supabase.storage.from('manufacturer-docs').getPublicUrl(fileName);

    // 2. Save Project to DB
    const { data: project, error: dbError } = await supabase
      .from('quotation_projects')
      .insert([{
        project_name: projectName,
        raw_pdf_url: publicUrl,
        extracted_data: aiResult,
        status: 'Draft'
      }])
      .select()
      .single();

    if (dbError) throw new Error(`Database error: ${dbError.message}`);

    return Response.json({ success: true, projectId: project.id });

  } catch (err: any) {
    console.error('[API] Critical Upload Error:', err);
    return Response.json({ 
      error: err.message || 'Server timeout or processing error' 
    }, { status: 500 });
  }
}
