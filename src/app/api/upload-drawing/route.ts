import { createServerSupabase } from '@/lib/supabase-server';
import { analyzeDrawing } from '@/ai/flows/analyze-drawing-flow';

export const maxDuration = 120; // Maximum allowed timeout for heavy analysis

/**
 * API Route Handler for architectural PDF uploads and AI analysis.
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
    
    // Process the file immediately for AI to minimize overhead
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Pdf = buffer.toString('base64');
    const dataUri = `data:application/pdf;base64,${base64Pdf}`;

    // 1. Upload to Supabase Storage in parallel/background if possible, but we need the URL
    const fileName = `quotations/drawings/${crypto.randomUUID()}.pdf`;
    const uploadPromise = supabase.storage
      .from('manufacturer-docs')
      .upload(fileName, buffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    // 2. Fetch latest NKBA rule for context if exists
    const nkbaPromise = supabase
      .from('nkba_files')
      .select('file_url')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const [uploadRes, nkbaRes] = await Promise.all([uploadPromise, nkbaPromise]);

    if (uploadRes.error) throw new Error(`Storage upload failed: ${uploadRes.error.message}`);
    const { data: { publicUrl } } = supabase.storage.from('manufacturer-docs').getPublicUrl(fileName);

    // 3. Run AI Extraction Flow - This is the bottleneck
    const aiResult = await analyzeDrawing({
      pdfDataUri: dataUri,
      nkbaContext: nkbaRes.data?.file_url ? `Reference NKBA Standards at ${nkbaRes.data.file_url}` : undefined
    });

    // 4. Save Project to DB
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

    if (dbError) throw new Error(`Project database entry failed: ${dbError.message}`);

    return Response.json({ 
      success: true, 
      projectId: project.id 
    });

  } catch (err: any) {
    console.error('API Upload Drawing Error:', err);
    return Response.json({ 
      error: err.message || 'Server error during AI processing' 
    }, { status: 500 });
  }
}
