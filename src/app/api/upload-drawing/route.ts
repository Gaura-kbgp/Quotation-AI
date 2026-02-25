
import { createServerSupabase } from '@/lib/supabase-server';
import { analyzeDrawing } from '@/ai/flows/analyze-drawing-flow';
import pdf from 'pdf-parse';

export const maxDuration = 300;

/**
 * PRODUCTION-SAFE PDF ANALYSIS ENGINE
 * 
 * 1. Primary: Fast Regex Extraction (pdf-parse)
 * 2. Secondary: Gemini 2.5 Flash Fallback (if codes < 5)
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

    // --- STEP 1: FAST REGEX EXTRACTION ---
    console.log('[Analyzer] Starting Fast Regex Extraction...');
    const pdfData = await pdf(buffer);
    const normalizedText = pdfData.text.replace(/\n/g, ' ').replace(/\s+/g, ' ').toUpperCase();

    // Regex Pattern as requested
    const cabinetRegex = /\b(W\d{3,4}BUTT|B\d{1,3}\s?BUTT|VSB\d{3,4}H?|UF\d{1,4}|SB\d{1,3}|DWR\d)\b/g;
    const matches = normalizedText.match(cabinetRegex) || [];
    
    let extractionResult: any = null;

    if (matches.length >= 5) {
      console.log(`[Analyzer] Found ${matches.length} codes via Regex. Skipping AI.`);
      
      const counts: Record<string, number> = {};
      matches.forEach(m => {
        const normalized = m.replace(/\s/g, '');
        counts[normalized] = (counts[normalized] || 0) + 1;
      });

      const sections: any = {
        'Wall Cabinets': [],
        'Base Cabinets': [],
        'Tall Cabinets': [],
        'Vanity Cabinets': [],
        'Hardware': []
      };

      Object.entries(counts).forEach(([code, qty]) => {
        let type = 'Hardware';
        if (code.startsWith('W')) type = 'Wall Cabinets';
        else if (code.startsWith('B') || code.startsWith('SB')) type = 'Base Cabinets';
        else if (code.startsWith('UF')) type = 'Tall Cabinets';
        else if (code.startsWith('VSB')) type = 'Vanity Cabinets';

        sections[type].push({ code, qty, type, description: 'Extracted via Regex' });
      });

      extractionResult = {
        rooms: [{
          room_name: 'Main Extraction',
          room_type: 'Kitchen',
          sections
        }],
        summary: `Instant extraction complete. Found ${matches.length} units across ${Object.keys(counts).length} unique SKUs.`
      };
    } else {
      // --- STEP 2: AI FALLBACK ---
      console.log('[Analyzer] Fewer than 5 codes found. Falling back to Gemini 2.5 Flash...');
      const dataUri = `data:application/pdf;base64,${buffer.toString('base64')}`;
      const aiResult = await analyzeDrawing({ pdfDataUri: dataUri });
      extractionResult = aiResult;
    }

    // --- STEP 3: STORAGE & DB ---
    const storagePath = `quotations/drawings/${crypto.randomUUID()}.pdf`;
    const [uploadRes] = await Promise.all([
      supabase.storage.from('manufacturer-docs').upload(storagePath, buffer, { contentType: 'application/pdf' })
    ]);

    if (uploadRes.error) throw new Error(`Storage error: ${uploadRes.error.message}`);
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
    console.error('[API] Critical Error:', err);
    return Response.json({ error: err.message || 'Processing error' }, { status: 500 });
  }
}
