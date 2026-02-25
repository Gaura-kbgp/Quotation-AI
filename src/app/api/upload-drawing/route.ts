
import { createServerSupabase } from '@/lib/supabase-server';
import { extractCabinetsFromPdf } from '@/lib/pdf-extractor';
import { analyzeDrawing } from '@/ai/flows/analyze-drawing-flow';

export const maxDuration = 120;

/**
 * HIGH-PERFORMANCE MULTI-PAGE EXTRACTION ENGINE
 * 
 * 1. Fast Multi-Page Regex Parser (Preferred)
 * 2. Gemini 2.5 Flash Fallback (If text parsing is insufficient)
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

    console.log('[Analyzer] Starting Multi-Page Extraction...');
    
    // --- STEP 1: FAST TEXT PARSING (MULTI-PAGE) ---
    let extractionResult = await extractCabinetsFromPdf(buffer);
    const totalFound = extractionResult.rooms.reduce((acc, r) => 
      acc + Object.values(r.sections).flat().length, 0
    );

    // --- STEP 2: AI FALLBACK (If < 5 items found) ---
    if (totalFound < 5) {
      console.log(`[Analyzer] Only ${totalFound} items found via Regex. Falling back to AI...`);
      const dataUri = `data:application/pdf;base64,${buffer.toString('base64')}`;
      
      try {
        const aiResult = await analyzeDrawing({ pdfDataUri: dataUri });
        
        const aiRooms = aiResult.rooms.map(room => {
          const sections: any = {
            'Base Cabinets': [],
            'Wall Cabinets': [],
            'Tall Cabinets': [],
            'Vanity Cabinets': [],
            'Hardware': []
          };
          
          room.cabinets.forEach((c: any) => {
            const type = c.type.includes('Base') ? 'Base Cabinets' :
                         c.type.includes('Wall') ? 'Wall Cabinets' :
                         c.type.includes('Tall') ? 'Tall Cabinets' :
                         c.type.includes('Vanity') ? 'Vanity Cabinets' : 'Hardware';
            sections[type].push({ ...c, type });
          });

          return { room_name: room.room_name, room_type: room.room_type, sections };
        });

        extractionResult = { rooms: aiRooms };
      } catch (aiError) {
        console.error('[Analyzer] AI Fallback failed:', aiError);
        // Keep the (limited) regex result if AI also fails
      }
    }

    // --- STEP 3: PERSISTENCE ---
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
    console.error('[API] Critical Error:', err);
    return Response.json({ error: err.message || 'Processing error' }, { status: 500 });
  }
}
