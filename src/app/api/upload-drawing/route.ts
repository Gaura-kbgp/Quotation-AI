import { createServerSupabase } from '@/lib/supabase-server';
import { analyzeDrawing } from '@/ai/flows/analyze-drawing-flow';
import pdf from 'pdf-parse';

// High-precision timeout for architectural processing
export const maxDuration = 300; 

/**
 * HYBRID EXTRACTION ROUTE (v81.0)
 * 1. Local Parsing: Extracts text metadata/titles.
 * 2. Vision Analysis: Gemini 2.5 Pro identifies codes.
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

    // HYBRID STAGE 1: Extract Text Metadata for Room Anchors
    let pdfText = '';
    try {
      const data = await pdf(buffer);
      // Clean up text and take first 5000 chars to avoid token bloat while capturing titles
      pdfText = data.text.substring(0, 5000).replace(/\s+/g, ' ');
    } catch (e) {
      console.warn('[Hybrid] Text extraction failed, falling back to pure vision.');
    }

    const dataUri = `data:application/pdf;base64,${buffer.toString('base64')}`;

    console.log(`[Hybrid Engine v81] Processing via Gemini 2.5 Pro: ${projectName}`);
    
    const extractionResult = await analyzeDrawing({ 
      pdfDataUri: dataUri,
      projectName: projectName,
      pdfText: pdfText // Pass extracted anchors to AI
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
    console.error('[Hybrid API Error]:', err);
    return Response.json({ 
      error: 'The architectural analysis took too long. For very large files, try uploading specific plan pages.' 
    }, { status: 504 });
  }
}
