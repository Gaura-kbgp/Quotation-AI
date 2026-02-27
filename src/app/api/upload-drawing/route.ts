import { createServerSupabase } from '@/lib/supabase-server';
import { analyzeDrawing } from '@/ai/flows/analyze-drawing-flow';

/**
 * Extended timeout for complex architectural vision analysis.
 * Supports processing of 20+ page PDFs via Gemini Vision.
 */
export const maxDuration = 300; 

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const projectName = (formData.get('projectName') as string) || '4031 MAGNOLIA';

    if (!file) {
      return Response.json({ error: 'No drawing PDF provided.' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const dataUri = `data:application/pdf;base64,${buffer.toString('base64')}`;

    console.log(`[Analyzer] Initiating High-Precision Analysis for ${projectName}...`);
    
    // Call the AI flow using Gemini 2.0 Flash for multi-page reasoning
    const extractionResult = await analyzeDrawing({ 
      pdfDataUri: dataUri,
      projectName: projectName
    });

    // Persist PDF to Storage for reference
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
