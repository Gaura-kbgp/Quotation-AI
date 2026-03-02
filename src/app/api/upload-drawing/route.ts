import { createServerSupabase } from '@/lib/supabase-server';
import { analyzeDrawing } from '@/ai/flows/analyze-drawing-flow';

// Increase timeout to 5 minutes to allow Gemini 2.5 Pro enough time for large PDFs
export const maxDuration = 300; 

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
    const dataUri = `data:application/pdf;base64,${buffer.toString('base64')}`;

    console.log(`[Analyzer] Processing via Gemini 2.5 Pro (v80)...`);
    
    const extractionResult = await analyzeDrawing({ 
      pdfDataUri: dataUri,
      projectName: projectName
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
    console.error('[API Error v80]:', err);
    // Return a structured JSON error instead of letting the gateway return an HTML 504
    return Response.json({ 
      error: 'The AI model took too long to process. For large files, try splitting the PDF into smaller sets of pages.' 
    }, { status: 504 });
  }
}
