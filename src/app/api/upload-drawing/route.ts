import { createServerSupabase } from '@/lib/supabase-server';
import { analyzeDrawing } from '@/ai/flows/analyze-drawing-flow';
import pdf from 'pdf-parse';

// High-capacity timeout for complex blueprint sets
export const maxDuration = 300; 

/**
 * HYBRID BLUEPRINT EXTRACTION (v83.0)
 * 1. Sheet Title Scan: Local text parsing finds room headers and title blocks.
 * 2. Vision Mapping: Gemini 2.5 Pro scans plan views using sheet headers as anchors.
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

    // STAGE 1: Architectural Anchor Extraction
    let pdfTextContext = '';
    try {
      const data = await pdf(buffer);
      // We scan the first 12000 chars to ensure we hit title blocks on multiple pages
      pdfTextContext = data.text.substring(0, 12000).replace(/\s+/g, ' ');
    } catch (e) {
      console.warn('[Blueprint Hybrid v83] Text scan failed, proceeding with vision only.');
    }

    const dataUri = `data:application/pdf;base64,${buffer.toString('base64')}`;

    console.log(`[Blueprint Hybrid v83] Calling Gemini 2.5 Pro Vision: ${projectName}`);
    
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
    console.error('[Blueprint API v83] Critical Error:', err);
    return Response.json({ 
      error: 'The server environment timed out while reading this architectural set. Recommendation: Upload only the Floor Plan and Cabinetry Schedule pages for a 10x faster response.' 
    }, { status: 504 });
  }
}