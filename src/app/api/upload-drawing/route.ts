import { createServerSupabase } from '@/lib/supabase-server';
import { analyzeDrawing } from '@/ai/flows/analyze-drawing-flow';
import pdf from 'pdf-parse';

// Production-grade timeout for architectural takeoff
export const maxDuration = 300; 

/**
 * HIGH-EFFICIENCY HYBRID EXTRACTION (v82.0)
 * 1. Text Parsing: Extracts "Anchors" (Sheet Names, Schedule Titles).
 * 2. Vision Analysis: Gemini 2.5 Pro uses anchors for lightning-fast takeoff.
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const projectName = (formData.get('projectName') as string) || 'NEW PROJECT';

    if (!file) {
      return Response.json({ error: 'No drawing PDF provided.' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // STAGE 1: Fast Text Extraction for Context Anchors
    let pdfTextContext = '';
    try {
      const data = await pdf(buffer);
      // We only take first 8000 chars to identify the Sheet Index and Schedule headers
      // This prevents token bloat while giving the AI a "Map" of the PDF
      pdfTextContext = data.text.substring(0, 8000).replace(/\s+/g, ' ');
    } catch (e) {
      console.warn('[Hybrid v82] Text extraction failed, proceeding with pure vision.');
    }

    const dataUri = `data:application/pdf;base64,${buffer.toString('base64')}`;

    console.log(`[Hybrid v82] Calling Gemini 2.5 Pro for: ${projectName}`);
    
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
    console.error('[Hybrid API v82] Error:', err);
    // Return structured JSON even for failures to avoid the "Error reaching server" HTML fallback
    return Response.json({ 
      error: 'The analysis took too long for this specific file. Recommendation: Upload just the Cabinetry Schedule or Floor Plan pages for a 10x faster response.' 
    }, { status: 504 });
  }
}
