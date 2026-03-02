import { createServerSupabase } from '@/lib/supabase-server';
import { analyzeDrawing } from '@/ai/flows/analyze-drawing-flow';
import pdf from 'pdf-parse';

export const maxDuration = 300; 

/**
 * HIGH-SPEED HYBRID EXTRACTION (v86.0)
 * Uses Gemini 2.5 Pro for flagship vision precision.
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const projectName = (formData.get('projectName') as string) || 'NEW PROJECT';

    if (!file) {
      return Response.json({ error: 'No PDF provided.' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // STAGE 1: Hybrid Text Anchors
    let pdfTextContext = '';
    try {
      const data = await pdf(buffer);
      pdfTextContext = data.text.substring(0, 10000).replace(/\s+/g, ' ');
    } catch (e) {
      console.warn('[Blueprint v86] Context pre-scan skipped.');
    }

    const dataUri = `data:application/pdf;base64,${buffer.toString('base64')}`;
    
    // Calls Flow which is hardcoded to Gemini 2.5 Pro
    const extractionResult = await analyzeDrawing({ 
      pdfDataUri: dataUri,
      projectName: projectName,
      pdfText: pdfTextContext
    });

    const storagePath = `quotations/drawings/${crypto.randomUUID()}.pdf`;
    await supabase.storage.from('manufacturer-docs').upload(storagePath, buffer, { contentType: 'application/pdf' });
    const { data: { publicUrl } } = supabase.storage.from('manufacturer-docs').getPublicUrl(storagePath);

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
    console.error('[Blueprint v86] Error:', err);
    return Response.json({ 
      error: 'Server processing delay. Recommendation: Upload only the Cabinetry Plan/Schedule sheets for the fastest results.' 
    }, { status: 504 });
  }
}
