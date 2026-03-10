import { createServerSupabase } from '@/lib/supabase-server';
import { analyzeDrawing } from '@/ai/flows/analyze-drawing-flow';
import pdf from 'pdf-parse';

export const maxDuration = 300;

/**
 * HIGH-SPEED HYBRID EXTRACTION (v86.0)
 * Uses Gemini 3.1 Flash Lite for ultra-fast vision precision.
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

    // STAGE 1: Hyper-Parallel AI Analysis & Cloud Storage
    const storagePath = `quotations/drawings/${crypto.randomUUID()}.pdf`;
    const dataUri = `data:application/pdf;base64,${buffer.toString('base64')}`;

    console.log(`[Blueprint v86] Processing ${projectName} (Hyper-Parallel Mode)`);

    const [extractionResult, uploadResult] = await Promise.all([
      (async () => {
        let pdfTextContext = '';
        try {
          const data = await pdf(buffer);
          pdfTextContext = data.text.substring(0, 5000).replace(/\s+/g, ' ');
        } catch (e) {
          console.warn('[Blueprint v86] Context pre-scan skipped.');
        }
        return analyzeDrawing({
          pdfDataUri: dataUri,
          projectName: projectName,
          pdfText: pdfTextContext
        });
      })(),
      supabase.storage.from('manufacturer-docs').upload(storagePath, buffer, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: false
      })
    ]);

    if (uploadResult.error) {
      console.error('[Blueprint v86] Supabase Storage Error:', uploadResult.error);
      throw new Error(`Cloud storage upload failed: ${uploadResult.error.message}`);
    }

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
    console.error('[Blueprint v86] Detailed Error:', err);
    const errorMessage = err.message || 'Server processing delay';
    return Response.json({
      error: `${errorMessage}. Recommendation: Upload only the Cabinetry Plan/Schedule sheets for the fastest results.`
    }, { status: 504 });
  }
}
