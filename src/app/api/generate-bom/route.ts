import { createServerSupabase } from '@/lib/supabase-server';
import { normalizeSku, getBaseSku } from '@/lib/utils';

export const maxDuration = 60;

/**
 * Smart Pricing Engine API for Architectural Cabinetry.
 * Implements multi-tier matching heuristics for high-precision takeoff verification.
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
      console.error('[BOM Engine] Project Fetch Error:', pError);
      return Response.json({ success: false, error: 'Project record retrieval failed.' }, { status: 404 });
    }

    const rooms = project.extracted_data?.rooms || [];
    
    // 2. Load ALL Manufacturer Specifications into high-speed memory maps
    const { data: allSpecs, error: sError } = await supabase
      .from('manufacturer_specifications')
      .select('*')
      .eq('manufacturer_id', manufacturerId);

    if (sError) {
      console.error('[BOM Engine] Database error during specs fetch:', sError);
      return Response.json({ success: false, error: `Failed to fetch pricing guide from database.` }, { status: 500 });
    }

    const specCount = allSpecs?.length || 0;
    console.log(`[BOM Engine] Loaded ${specCount} price book entries.`);

    if (specCount === 0) {
      console.warn(`[BOM Engine] WARNING: No pricing guide found in database for manufacturer: ${manufacturerId}`);
    }

    const exactMap = new Map();
    const collectionMap = new Map();
    const baseModelMap = new Map();
    const globalSkuMap = new Map();

    (allSpecs || []).forEach(spec => {
      // SKUs are already normalized during ingestion by specs-parser
      const cleanSku = spec.sku; 
      const collection = String(spec.collection_name || '').toUpperCase().trim();
      const style = String(spec.door_style || '').toUpperCase().trim();
      const price = Number(spec.price) || 0;

      if (price <= 0) return;

      // Tier 1: Exact Collection + Door Style Match
      exactMap.set(`${collection}|${style}|${cleanSku}`, price);
      
      // Tier 2: Collection-Level Fallback
      if (!collectionMap.has(`${collection}|${cleanSku}`)) {
        collectionMap.set(`${collection}|${cleanSku}`, price);
      }

      // Tier 3: Base Model Identification
      const baseSku = getBaseSku(cleanSku);
      if (!baseModelMap.has(baseSku) || price < baseModelMap.get(baseSku)) {
        baseModelMap.set(baseSku, price);
      }

      // Tier 4: Global SKU lookup (Any collection)
      if (!globalSkuMap.has(cleanSku)) {
        globalSkuMap.set(cleanSku, price);
      }
    });

    // 3. Process each takeoff item
    const bomItems: any[] = [];
    
    for (const room of rooms) {
      const selectedColl = String(room.collection || '').toUpperCase().trim();
      const selectedStyle = String(room.door_style || '').toUpperCase().trim();

      const sections = room.sections || {};
      for (const [sectionName, items] of Object.entries(sections)) {
        const cabinetItems = items as any[];
        for (const cab of cabinetItems) {
          if (!cab.code) continue;

          const rawCode = cab.code;
          const cleanCode = normalizeSku(rawCode);
          const baseCode = getBaseSku(rawCode);

          let price = 0;
          let source = 'NOT_FOUND';

          // HEURISTIC MATCHING PIPELINE
          const exactKey = `${selectedColl}|${selectedStyle}|${cleanCode}`;
          const collKey = `${selectedColl}|${cleanCode}`;

          if (exactMap.has(exactKey)) {
            price = exactMap.get(exactKey);
            source = 'EXACT_MATCH';
          } else if (collectionMap.has(collKey)) {
            price = collectionMap.get(collKey);
            source = 'PARTIAL_MATCH';
          } else if (baseModelMap.has(baseCode)) {
            price = baseModelMap.get(baseCode);
            source = 'BASE_MODEL_MATCH';
          } else if (globalSkuMap.has(cleanCode)) {
            price = globalSkuMap.get(cleanCode);
            source = 'FALLBACK_COLLECTION_MATCH';
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
    const { error: deleteError } = await supabase.from('quotation_boms').delete().eq('project_id', projectId);
    if (deleteError) {
      console.error('[BOM Engine] Failed to clear existing items:', deleteError);
    }

    if (bomItems.length > 0) {
      const { error: insertError } = await supabase.from('quotation_boms').insert(bomItems);
      if (insertError) {
        console.error('[BOM Engine] Persistence error:', insertError);
        return Response.json({ success: false, error: 'Failed to persist BOM items. Please ensure database tables are created.' }, { status: 500 });
      }
    }

    await supabase.from('quotation_projects').update({ 
      manufacturer_id: manufacturerId,
      status: 'Priced' 
    }).eq('id', projectId);

    console.log(`[BOM Engine] SUCCESS: Generated ${bomItems.length} line items.`);
    return Response.json({ success: true, count: bomItems.length });

  } catch (err: any) {
    console.error('[BOM Engine] CRITICAL FAILURE:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
