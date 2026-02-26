import { createServerSupabase } from '@/lib/supabase-server';
import { normalizeSku } from '@/lib/utils';

export const maxDuration = 60;

/**
 * Precision Pricing Engine (v11.0).
 * Optimized for Multi-Tier Fallback Matching with style-agnostic recovery.
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

    console.log(`[Pricing Engine v11] Loaded ${allPricing?.length || 0} price book records.`);

    const bomItems: any[] = [];
    
    for (const room of rooms) {
      const roomSelectedStyle = normalizeSku(room.door_style || "");
      const sections = room.sections || {};

      for (const [sectionName, items] of Object.entries(sections)) {
        const cabinetItems = items as any[];
        for (const cab of cabinetItems) {
          if (!cab.code) continue;

          const rawTakeoff = cab.code;
          const normTakeoff = normalizeSku(rawTakeoff);
          
          let matchedRow = null;
          let precisionLevel = 'NOT_FOUND';

          // Filter pricing by normalized door style first
          const styleFilteredPricing = (allPricing || []).filter(p => {
            if (!roomSelectedStyle) return true;
            return normalizeSku(p.door_style) === roomSelectedStyle;
          });

          // TIER 1: EXACT MATCH (Within Selected Style)
          matchedRow = styleFilteredPricing.find(p => normalizeSku(p.sku) === normTakeoff);
          if (matchedRow) precisionLevel = 'EXACT';

          // TIER 2: PARTIAL MATCH (Within Selected Style)
          if (!matchedRow) {
            matchedRow = styleFilteredPricing.find(p => {
              const pSku = normalizeSku(p.sku);
              return normTakeoff.includes(pSku) || pSku.includes(normTakeoff);
            });
            if (matchedRow) precisionLevel = 'PARTIAL';
          }

          // TIER 3: EXACT MATCH (Style-Agnostic Fallback)
          // Search the entire manufacturer database regardless of style selection
          if (!matchedRow) {
            matchedRow = (allPricing || []).find(p => normalizeSku(p.sku) === normTakeoff);
            if (matchedRow) precisionLevel = 'FUZZY';
          }

          // TIER 4: PARTIAL MATCH (Style-Agnostic Fallback)
          // Search entire database for similar SKUs (Ultimate Recovery)
          if (!matchedRow) {
            matchedRow = (allPricing || []).find(p => {
              const pSku = normalizeSku(p.sku);
              return normTakeoff.includes(pSku) || pSku.includes(normTakeoff);
            });
            if (matchedRow) precisionLevel = 'FUZZY';
          }

          if (matchedRow) {
            const price = Number(matchedRow.price) || 0;
            console.log(`[Tier Match] ${rawTakeoff} -> ${matchedRow.sku} (${precisionLevel}) $${price}`);
            
            bomItems.push({
              project_id: projectId,
              sku: rawTakeoff,
              matched_sku: matchedRow.sku,
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
            console.log(`[Tier Match] FAILED: ${rawTakeoff} (Normalized: ${normTakeoff})`);
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
