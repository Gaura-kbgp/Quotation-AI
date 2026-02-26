import { createServerSupabase } from '@/lib/supabase-server';
import { normalizeSku, getBaseSku } from '@/lib/utils';

export const maxDuration = 60;

/**
 * Smart Pricing Engine API for Architectural Cabinetry (v2.0).
 * Implements Step 2, 4, 6, and 7 of the production-level matching requirements.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

    console.log(`[BOM Engine] STARTING: Project=${projectId}, Manufacturer=${manufacturerId}`);

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
    
    // 2. Load ALL Manufacturer Specifications for memory-safe scan
    const { data: allSpecs, error: sError } = await supabase
      .from('manufacturer_specifications')
      .select('*')
      .eq('manufacturer_id', manufacturerId);

    if (sError) {
      console.error('[BOM Engine] Database Error:', sError);
      return Response.json({ success: false, error: `Database error during pricing fetch.` }, { status: 500 });
    }

    // STEP 6 - PRE-LOAD MAPS FOR PERFORMANCE
    const specCount = allSpecs?.length || 0;
    console.log(`[BOM Engine] Loaded ${specCount} price records.`);

    const exactMap = new Map(); // Key: Collection|NormalizedSku
    const globalSkuMap = new Map(); // Key: NormalizedSku (Fallback)

    (allSpecs || []).forEach(spec => {
      const cleanSku = normalizeSku(spec.sku);
      const collection = String(spec.collection_name || '').toUpperCase().trim();
      const price = Number(spec.price) || 0;

      if (price <= 0) return;

      // Primary tier: Specific Collection Match
      exactMap.set(`${collection}|${cleanSku}`, price);
      
      // Fallback tier: Global SKU lookup
      if (!globalSkuMap.has(cleanSku)) {
        globalSkuMap.set(cleanSku, price);
      }
    });

    // 3. Process each takeoff item
    const bomItems: any[] = [];
    
    for (const room of rooms) {
      const selectedColl = String(room.collection || '').toUpperCase().trim();
      const sections = room.sections || {};

      for (const [sectionName, items] of Object.entries(sections)) {
        const cabinetItems = items as any[];
        for (const cab of cabinetItems) {
          if (!cab.code) continue;

          // STEP 2 - NORMALIZE FOR MATCHING
          const rawCode = cab.code;
          const cleanCode = normalizeSku(rawCode);
          
          let price = 0;
          let source = 'NOT_FOUND';

          // STEP 4 - HIERARCHICAL MATCHING PIPELINE
          const exactKey = `${selectedColl}|${cleanCode}`;

          // Tier 1: Exact Collection Match
          if (exactMap.has(exactKey)) {
            price = exactMap.get(exactKey);
            source = 'EXACT_MATCH';
          } 
          // Tier 2: Global Fallback Match (Step 4 logic)
          else if (globalSkuMap.has(cleanCode)) {
            price = globalSkuMap.get(cleanCode);
            source = 'FALLBACK_COLLECTION_MATCH';
          }
          // Tier 3: Base Model Match (Heuristic)
          else {
            const baseCode = getBaseSku(rawCode);
            if (globalSkuMap.has(baseCode)) {
              price = globalSkuMap.get(baseCode);
              source = 'BASE_MODEL_MATCH';
            }
          }

          // STEP 7 - DEBUG LOGGING
          if (source === 'NOT_FOUND') {
            console.log(`[BOM Debug] NOT FOUND: ${rawCode} (Normalized: ${cleanCode})`);
          }

          bomItems.push({
            project_id: projectId,
            sku: rawCode,
            qty: Number(cab.qty) || 1,
            unit_price: price,
            line_total: price * (Number(cab.qty) || 1),
            room: room.room_name,
            collection: room.collection,
            door_style: room.door_style,
            price_source: source,
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
        return Response.json({ success: false, error: 'Failed to persist BOM items.' }, { status: 500 });
      }
    }

    await supabase.from('quotation_projects').update({ 
      manufacturer_id: manufacturerId,
      status: 'Priced' 
    }).eq('id', projectId);

    return Response.json({ success: true, count: bomItems.length });

  } catch (err: any) {
    console.error('[BOM Engine] Critical Failure:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
