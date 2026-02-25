
import { createServerSupabase } from '@/lib/supabase-server';
import { analyzeDrawing } from '@/ai/flows/analyze-drawing-flow';

export const maxDuration = 120;

/**
 * PRODUCTION-GRADE HYBRID EXTRACTION ENTRY POINT
 * 
 * Uses Gemini 2.5 Flash Native PDF Vision for 100% multi-page coverage.
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

    console.log('[Analyzer] Initiating Multi-Page Vision Analysis...');
    
    // Call the hybrid AI flow which handles multi-page reasoning
    const extractionResult = await analyzeDrawing({ pdfDataUri: dataUri });

    // Persist PDF to Storage
    const storagePath = `quotations/drawings/${crypto.randomUUID()}.pdf`;
    await supabase.storage.from('manufacturer-docs').upload(storagePath, buffer, { contentType: 'application/pdf' });
    const { data: { publicUrl } } = supabase.storage.from('manufacturer-docs').getPublicUrl(storagePath);

    // Persist Project to DB
    const { data: project, error: dbError } = await supabase
      .from('quotation_projects')
      .insert([{
        project_name: projectName,
        raw_pdf_url: publicUrl,
        extracted_data: extractionResult,
        status: 'Draft'
      }])
      .select()
      .single();

    if (dbError) throw new Error(`Database error: ${dbError.message}`);

    return Response.json({ success: true, projectId: project.id });

  } catch (err: any) {
    console.error('[API] Critical Error:', err);
    return Response.json({ error: err.message || 'Processing error' }, { status: 500 });
  }
}
