import { createServerSupabase } from '@/lib/supabase-server';
import { normalizeSku } from '@/lib/utils';

export const maxDuration = 60;

/**
 * Precision Pricing Engine (v6.0).
 * strictly implements 3-Level Match Strategy:
 * LEVEL 1: EXACT
 * LEVEL 2: PARTIAL (Contains)
 * LEVEL 3: FUZZY (Prefix)
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
    
    // Load ALL Manufacturer Pricing (The Single Source of Truth)
    const { data: allPricing, error: sError } = await supabase
      .from('manufacturer_pricing')
      .select('*')
      .eq('manufacturer_id', manufacturerId);

    if (sError) {
      console.error('[Pricing Engine] DB Error:', sError);
      return Response.json({ success: false, error: `Database error: ${sError.message}` }, { status: 500 });
    }

    console.log(`[Pricing Engine] Loaded ${allPricing?.length || 0} pricing records from manufacturer_pricing table.`);

    const bomItems: any[] = [];
    
    for (const room of rooms) {
      const sections = room.sections || {};

      for (const [sectionName, items] of Object.entries(sections)) {
        const cabinetItems = items as any[];
        for (const cab of cabinetItems) {
          if (!cab.code) continue;

          const rawTakeoff = cab.code;
          const normTakeoff = normalizeSku(rawTakeoff);
          
          let matchedRow = null;
          let precisionLevel = 'NOT_FOUND';
          let matchedSku = '';

          // LEVEL 1: EXACT MATCH
          matchedRow = (allPricing || []).find(p => normalizeSku(p.sku) === normTakeoff);
          if (matchedRow) {
            precisionLevel = 'EXACT';
          } 
          
          // LEVEL 2: CONTAINS MATCH (If exact fails)
          if (!matchedRow) {
            matchedRow = (allPricing || []).find(p => {
              const normPrice = normalizeSku(p.sku);
              if (!normPrice) return false;
              return normTakeoff.includes(normPrice) || normPrice.includes(normTakeoff);
            });
            if (matchedRow) precisionLevel = 'PARTIAL';
          }

          // LEVEL 3: SIMILAR / FUZZY MATCH (Prefix 4 chars)
          if (!matchedRow && normTakeoff.length >= 3) {
            const prefix = normTakeoff.substring(0, 4);
            matchedRow = (allPricing || []).find(p => {
              const normPrice = normalizeSku(p.sku);
              return normPrice.startsWith(prefix);
            });
            if (matchedRow) precisionLevel = 'FUZZY';
          }

          if (matchedRow) {
            matchedSku = matchedRow.sku;
            console.log(`[Pricing Engine] Matching SKU: ${rawTakeoff} -> Matched SKU: ${matchedSku} (${precisionLevel})`);
          } else {
            console.log(`[Pricing Engine] Matching SKU: ${rawTakeoff} -> Matched SKU: NOT FOUND`);
          }

          const price = matchedRow ? Number(matchedRow.price) : 0;

          bomItems.push({
            project_id: projectId,
            sku: rawTakeoff,
            matched_sku: matchedSku,
            qty: Number(cab.qty) || 1,
            unit_price: price,
            line_total: price * (Number(cab.qty) || 1),
            room: room.room_name,
            collection: room.collection || 'Standard',
            door_style: room.door_style || matchedRow?.door_style || 'Default',
            price_source: 'Admin Pricing Sheet',
            precision_level: precisionLevel,
            created_at: new Date().toISOString()
          });
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
