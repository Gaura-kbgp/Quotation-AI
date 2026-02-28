import { createServerSupabase } from '@/lib/supabase-server';
import { normalizeSku, calculateSimilarity, getBaseSku } from '@/lib/utils';

export const maxDuration = 120;

/**
 * SMART PRICING ENGINE (v28.0)
 * Implements recursive matching logic to ensure no valid cabinet is missed.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

    if (!projectId || !manufacturerId) {
      return Response.json({ success: false, error: "Missing parameters." }, { status: 400 });
    }

    const supabase = createServerSupabase();

    const [pRes, mRes] = await Promise.all([
      supabase.from('quotation_projects').select('*').eq('id', projectId).single(),
      supabase.from('manufacturers').select('*').eq('id', manufacturerId).single()
    ]);

    if (pRes.error || !pRes.data) throw new Error('Project not found.');
    const project = pRes.data;
    const rooms = project.extracted_data?.rooms || [];
    
    // Fetch ALL pricing once for performance
    const { data: allPricing, error: sError } = await supabase
      .from('manufacturer_pricing')
      .select('*')
      .eq('manufacturer_id', manufacturerId);

    if (sError) throw new Error(`Database error: ${sError.message}`);

    const bomItems: any[] = [];
    let matchedCount = 0;
    let totalCount = 0;

    for (const room of rooms) {
      const selectedCollection = (room.collection || "").trim().toUpperCase();
      const selectedStyle = (room.door_style || "").trim().toUpperCase();
      const sections = room.sections || {};

      for (const [sectionName, items] of Object.entries(sections)) {
        const cabinetItems = items as any[];
        for (const cab of cabinetItems) {
          if (!cab.code) continue;
          totalCount++;

          const rawInput = String(cab.code).trim();
          const normInput = normalizeSku(rawInput);
          const baseInput = getBaseSku(rawInput);
          
          console.log(`[Pricing Engine] Matching: ${rawInput} (${normInput}) in ${selectedCollection}`);

          // STAGE 1: SPEC-SPECIFIC FILTERING
          const specFiltered = allPricing?.filter(p => 
            String(p.collection_name || "").toUpperCase() === selectedCollection && 
            String(p.door_style || "").toUpperCase() === selectedStyle
          ) || [];

          let match = null;
          let matchType = 'NOT_FOUND';

          // 1.1: Exact Normalized Match
          match = specFiltered.find(p => normalizeSku(p.sku) === normInput);
          if (match) matchType = 'EXACT';

          // 1.2: Base SKU Match (within spec)
          if (!match) {
            match = specFiltered.find(p => normalizeSku(p.sku) === baseInput);
            if (match) matchType = 'BASE_EXACT';
          }

          // 1.3: Partial/Substring Match
          if (!match) {
            match = specFiltered.find(p => {
              const pNorm = normalizeSku(p.sku);
              return pNorm.includes(normInput) || normInput.includes(pNorm);
            });
            if (match) matchType = 'PARTIAL';
          }

          // STAGE 2: GLOBAL FALLBACK (Entire Manufacturer Catalog)
          if (!match && allPricing) {
            // 2.1: Global Exact
            match = allPricing.find(p => normalizeSku(p.sku) === normInput);
            if (match) {
              matchType = 'GLOBAL_EXACT';
            } else {
              // 2.2: Global Base
              match = allPricing.find(p => normalizeSku(p.sku) === baseInput);
              if (match) matchType = 'GLOBAL_BASE';
            }
          }

          if (match) {
            matchedCount++;
            const price = Number(match.price) || 0;
            console.log(`[Pricing Engine] Found Match: ${match.sku} @ $${price} (${matchType})`);
            
            bomItems.push({
              project_id: projectId,
              sku: rawInput,
              matched_sku: match.sku,
              qty: Number(cab.qty) || 1,
              unit_price: price,
              line_total: price * (Number(cab.qty) || 1),
              room: room.room_name,
              collection: room.collection || match.collection_name,
              door_style: room.door_style || match.door_style,
              price_source: `Price Book (${matchType})`,
              precision_level: matchType,
              created_at: new Date().toISOString()
            });
          } else {
            console.warn(`[Pricing Engine] No price found for: ${rawInput}`);
            
            // PHASE 3: AUDIT SUGGESTIONS
            const suggestions = allPricing
              ? allPricing
                  .map(p => ({ sku: p.sku, score: calculateSimilarity(normInput, p.sku) }))
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 3)
                  .filter(s => s.score > 0.4)
                  .map(c => c.sku)
                  .join(', ')
              : 'NONE';

            bomItems.push({
              project_id: projectId,
              sku: rawInput,
              matched_sku: suggestions ? `SUGGEST: ${suggestions}` : 'PRICE NOT FOUND',
              qty: Number(cab.qty) || 1,
              unit_price: 0,
              line_total: 0,
              room: room.room_name,
              collection: room.collection || 'N/A',
              door_style: room.door_style || 'N/A',
              price_source: 'NOT FOUND',
              precision_level: 'NOT_FOUND',
              created_at: new Date().toISOString()
            });
          }
        }
      }
    }

    // Persist Results
    await supabase.from('quotation_boms').delete().eq('project_id', projectId);
    if (bomItems.length > 0) {
      await supabase.from('quotation_boms').insert(bomItems);
    }

    await supabase.from('quotation_projects').update({ 
      manufacturer_id: manufacturerId,
      status: 'Priced' 
    }).eq('id', projectId);

    return Response.json({ success: true, matched: matchedCount, total: totalCount });

  } catch (err: any) {
    console.error('[Pricing Engine] Error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
