import { createServerSupabase } from '@/lib/supabase-server';
import { normalizeSku } from '@/lib/utils';

export const maxDuration = 60;

/**
 * Precision Pricing Engine (v4.0).
 * Implements Unified Normalization and Cross-Collection Deep Search.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

    console.log(`--- PRICING ENGINE START ---`);
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
    
    // 2. Load ALL Manufacturer Specifications (The Price Book)
    const { data: allSpecs, error: sError } = await supabase
      .from('manufacturer_specifications')
      .select('*')
      .eq('manufacturer_id', manufacturerId);

    if (sError) {
      console.error('[Pricing Engine] DB Error:', sError);
      return Response.json({ success: false, error: `Database error: ${sError.message}` }, { status: 500 });
    }

    console.log(`Loaded ${allSpecs?.length || 0} price book records.`);

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
          console.log(`Searching for takeoff code: ${cab.code} -> Normalized: ${takeoffCode}`);
          
          let matchedRow = null;
          let matchSource = 'NOT_FOUND';

          // STEP 4: FUZZY MULTI-TIER MATCHING
          // allSpecs.sku is already normalized from the parser
          matchedRow = (allSpecs || []).find(spec => {
            const dbSku = spec.sku; // Assumed normalized from DB
            
            // 1. Exact Match
            if (dbSku === takeoffCode) {
              matchSource = 'EXACT_MATCH';
              return true;
            }
            
            // 2. Takeoff contains DB entry (e.g., Takeoff "B24BUTT" contains DB "B24")
            if (takeoffCode.includes(dbSku) && dbSku.length > 2) {
              matchSource = 'BASE_MODEL_MATCH';
              return true;
            }

            // 3. DB entry contains Takeoff (e.g., DB "W2442-12" contains Takeoff "W2442")
            if (dbSku.includes(takeoffCode) && takeoffCode.length > 2) {
              matchSource = 'PARTIAL_MATCH';
              return true;
            }

            return false;
          });

          if (matchedRow) {
            console.log(`MATCH SUCCESS: ${takeoffCode} -> ${matchedRow.sku} (${matchSource}) at $${matchedRow.price}`);
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
        console.error("BOM Persistence Failure:", insertError);
        return Response.json({ success: false, error: 'Failed to save quotation line items.' }, { status: 500 });
      }
    }

    await supabase.from('quotation_projects').update({ 
      manufacturer_id: manufacturerId,
      status: 'Priced' 
    }).eq('id', projectId);

    console.log(`--- PRICING ENGINE COMPLETE: ${bomItems.length} items processed ---`);
    return Response.json({ success: true, count: bomItems.length });

  } catch (err: any) {
    console.error('[Pricing Engine] Critical Error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
