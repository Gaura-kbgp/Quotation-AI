
import { createServerSupabase } from '@/lib/supabase-server';
import { normalizeSku } from '@/lib/utils';

export const maxDuration = 60;

/**
 * Precision Pricing Engine (v9.5).
 * Optimized for Multi-Tier Heuristic Matching (EXACT -> PARTIAL -> FUZZY).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

    if (!projectId || !manufacturerId) {
      return Response.json({ success: false, error: "Missing required parameters." }, { status: 400 });
    }

    const supabase = createServerSupabase();

    const { data: project, error: pError } = await supabase
      .from('quotation_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (pError || !project) {
      return Response.json({ success: false, error: 'Project record retrieval failed.' }, { status: 404 });
    }

    const rooms = project.extracted_data?.rooms || [];
    
    // Load ALL Manufacturer Pricing (Single Source of Truth)
    const { data: allPricing, error: sError } = await supabase
      .from('manufacturer_pricing')
      .select('*')
      .eq('manufacturer_id', manufacturerId);

    if (sError) {
      return Response.json({ success: false, error: `Database error: ${sError.message}` }, { status: 500 });
    }

    console.log(`[Pricing Engine] Loaded ${allPricing?.length || 0} pricing records for manufacturer ${manufacturerId}`);

    const bomItems: any[] = [];
    
    for (const room of rooms) {
      const selectedDoorStyle = normalizeSku(room.door_style || "");
      const sections = room.sections || {};

      console.log(`[Pricing Engine] Processing Room: ${room.room_name} (Selected Style: ${selectedDoorStyle})`);

      for (const [sectionName, items] of Object.entries(sections)) {
        const cabinetItems = items as any[];
        for (const cab of cabinetItems) {
          if (!cab.code) continue;

          const rawTakeoff = cab.code;
          const normTakeoff = normalizeSku(rawTakeoff);
          
          let matchedRow = null;
          let precisionLevel = 'NOT_FOUND';
          let matchedSku = '';

          // LEVEL 1: EXACT MATCH (Cleaned SKU + Selected Style)
          matchedRow = (allPricing || []).find(p => {
            const pSku = normalizeSku(p.sku);
            const pStyle = normalizeSku(p.door_style);
            return pSku === normTakeoff && (selectedDoorStyle === "" || pStyle === selectedDoorStyle);
          });

          if (matchedRow) {
            precisionLevel = 'EXACT';
          } 
          
          // LEVEL 2: PARTIAL/CONTAINS MATCH (If exact fails)
          if (!matchedRow) {
            matchedRow = (allPricing || []).find(p => {
              const pSku = normalizeSku(p.sku);
              const pStyle = normalizeSku(p.door_style);
              const styleMatch = selectedDoorStyle === "" || pStyle === selectedDoorStyle;
              // 2-way containment search to handle B24 matching B24BUTT or vice versa
              return styleMatch && (normTakeoff.includes(pSku) || pSku.includes(normTakeoff));
            });
            if (matchedRow) precisionLevel = 'PARTIAL';
          }

          // LEVEL 3: FUZZY FALLBACK (Match on first 4 characters for similar models)
          if (!matchedRow && normTakeoff.length >= 3) {
            const prefix = normTakeoff.substring(0, 4);
            matchedRow = (allPricing || []).find(p => {
              const pSku = normalizeSku(p.sku);
              const pStyle = normalizeSku(p.door_style);
              return (selectedDoorStyle === "" || pStyle === selectedDoorStyle) && pSku.startsWith(prefix);
            });
            if (matchedRow) precisionLevel = 'FUZZY';
          }

          if (matchedRow) {
            matchedSku = matchedRow.sku;
            const price = Number(matchedRow.price) || 0;
            console.log(`[Pricing Engine] MATCHED: ${rawTakeoff} -> ${matchedSku} (${precisionLevel}) Price: $${price}`);
            
            bomItems.push({
              project_id: projectId,
              sku: rawTakeoff,
              matched_sku: matchedSku,
              qty: Number(cab.qty) || 1,
              unit_price: price,
              line_total: price * (Number(cab.qty) || 1),
              room: room.room_name,
              collection: room.collection || matchedRow.collection_name,
              door_style: room.door_style || matchedRow.door_style,
              price_source: 'Admin Pricing Sheet',
              precision_level: precisionLevel,
              created_at: new Date().toISOString()
            });
          } else {
            console.log(`[Pricing Engine] NOT FOUND: ${rawTakeoff} (Normalized: ${normTakeoff})`);
            bomItems.push({
              project_id: projectId,
              sku: rawTakeoff,
              matched_sku: 'NOT FOUND',
              qty: Number(cab.qty) || 1,
              unit_price: 0,
              line_total: 0,
              room: room.room_name,
              collection: room.collection || 'N/A',
              door_style: room.door_style || 'N/A',
              price_source: 'Admin Pricing Sheet',
              precision_level: 'NOT_FOUND',
              created_at: new Date().toISOString()
            });
          }
        }
      }
    }

    // Persist results
    await supabase.from('quotation_boms').delete().eq('project_id', projectId);

    if (bomItems.length > 0) {
      const { error: insertError } = await supabase.from('quotation_boms').insert(bomItems);
      if (insertError) throw new Error(`BOM Save Failed: ${insertError.message}`);
    }

    await supabase.from('quotation_projects').update({ 
      manufacturer_id: manufacturerId,
      status: 'Priced' 
    }).eq('id', projectId);

    return Response.json({ success: true, count: bomItems.length });

  } catch (err: any) {
    console.error('[Pricing Engine] Critical Error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
