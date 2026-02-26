import { createServerSupabase } from '@/lib/supabase-server';
import { normalizeSku } from '@/lib/utils';

export const maxDuration = 60;

/**
 * Smart Pricing Engine API (v3.0).
 * Implements 2-Way Includes matching and Deep Logging.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

    console.log(`--- BOM GENERATION START ---`);
    console.log(`Project: ${projectId}, Manufacturer: ${manufacturerId}`);

    if (!projectId || !manufacturerId) {
      return Response.json({ success: false, error: "Missing required parameters." }, { status: 400 });
    }

    const supabase = createServerSupabase();

    // 1. Fetch project data
    const { data: project, error: pError } = await supabase
      .from('quotation_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (pError || !project) {
      return Response.json({ success: false, error: 'Project record retrieval failed.' }, { status: 404 });
    }

    const rooms = project.extracted_data?.rooms || [];
    
    // 2. Load ALL Manufacturer Specifications
    const { data: allSpecs, error: sError } = await supabase
      .from('manufacturer_specifications')
      .select('*')
      .eq('manufacturer_id', manufacturerId);

    if (sError) {
      console.error('[BOM Engine] Database Error:', sError);
      return Response.json({ success: false, error: `Database error during pricing fetch.` }, { status: 500 });
    }

    const specCount = allSpecs?.length || 0;
    console.log(`Loaded ${specCount} price records from database.`);

    // 3. Process each takeoff item
    const bomItems: any[] = [];
    
    for (const room of rooms) {
      const sections = room.sections || {};

      for (const [sectionName, items] of Object.entries(sections)) {
        const cabinetItems = items as any[];
        for (const cab of cabinetItems) {
          if (!cab.code) continue;

          // STEP 3: STRONG NORMALIZATION
          const takeoffCode = normalizeSku(cab.code);
          console.log(`Searching for: ${cab.code} (Normalized: ${takeoffCode})`);
          
          let matchedRow = null;
          let matchSource = 'NOT_FOUND';

          // STEP 4 & 5: 2-WAY INCLUDES MATCHING
          // We search the in-memory array for performance
          matchedRow = (allSpecs || []).find(spec => {
            const dbSku = normalizeSku(spec.sku);
            
            // 1. Exact Match
            if (dbSku === takeoffCode) {
              matchSource = 'EXACT_MATCH';
              return true;
            }
            
            // 2. Contains Match (Excel SKU contains Takeoff)
            if (dbSku.includes(takeoffCode)) {
              matchSource = 'PARTIAL_MATCH';
              return true;
            }

            // 3. Reverse Match (Takeoff contains Excel SKU)
            if (takeoffCode.includes(dbSku)) {
              matchSource = 'BASE_MODEL_MATCH';
              return true;
            }

            return false;
          });

          if (matchedRow) {
            console.log(`FOUND Match: ${takeoffCode} -> ${matchedRow.sku} (${matchSource})`);
          } else {
            console.log(`NOT FOUND: ${takeoffCode}`);
          }

          const price = matchedRow ? Number(matchedRow.price) : 0;

          bomItems.push({
            project_id: projectId,
            sku: cab.code,
            qty: Number(cab.qty) || 1,
            unit_price: price,
            line_total: price * (Number(cab.qty) || 1),
            room: room.room_name,
            collection: room.collection || 'Standard',
            door_style: room.door_style || matchedRow?.door_style || 'Default',
            price_source: matchSource,
            created_at: new Date().toISOString()
          });
        }
      }
    }

    // 4. Persistence
    await supabase.from('quotation_boms').delete().eq('project_id', projectId);

    if (bomItems.length > 0) {
      const { error: insertError } = await supabase.from('quotation_boms').insert(bomItems);
      if (insertError) {
        console.error("BOM Insert Error:", insertError);
        return Response.json({ success: false, error: 'Failed to persist BOM items.' }, { status: 500 });
      }
    }

    await supabase.from('quotation_projects').update({ 
      manufacturer_id: manufacturerId,
      status: 'Priced' 
    }).eq('id', projectId);

    console.log(`--- BOM GENERATION END: ${bomItems.length} items processed ---`);
    return Response.json({ success: true, count: bomItems.length });

  } catch (err: any) {
    console.error('[BOM Engine] Critical Failure:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
