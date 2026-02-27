import { createServerSupabase } from '@/lib/supabase-server';
import { normalizeSku, calculateSimilarity } from '@/lib/utils';

export const maxDuration = 120;

/**
 * ENTERPRISE PRICING ENGINE (v21.0)
 * 1. Strict Spec Filtering (Collection + Style)
 * 2. Multi-Stage Matching (Exact -> Contains -> Fuzzy)
 * 3. Global Fallback Search (Crucial for Fillers/Accessories)
 * 4. Alphanumeric Normalization
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

    if (!projectId || !manufacturerId) {
      return Response.json({ success: false, error: "Missing required parameters." }, { status: 400 });
    }

    const supabase = createServerSupabase();

    const [pRes, mRes] = await Promise.all([
      supabase.from('quotation_projects').select('*').eq('id', projectId).single(),
      supabase.from('manufacturers').select('*').eq('id', manufacturerId).single()
    ]);

    if (pRes.error || !pRes.data) throw new Error('Project retrieval failed.');
    const project = pRes.data;
    const rooms = project.extracted_data?.rooms || [];
    
    // Load ALL pricing for this manufacturer to enable global fallbacks
    const { data: allPricing, error: sError } = await supabase
      .from('manufacturer_pricing')
      .select('*')
      .eq('manufacturer_id', manufacturerId);

    if (sError) throw new Error(`Database error: ${sError.message}`);
    
    console.log(`[Pricing Engine v21.0] Loaded ${allPricing?.length || 0} total records for matching.`);

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
          
          // PHASE 1: SEARCH WITHIN SELECTED SPEC (High Priority)
          const specFiltered = allPricing?.filter(p => 
            String(p.collection_name || "").toUpperCase() === selectedCollection && 
            String(p.door_style || "").toUpperCase() === selectedStyle
          ) || [];

          let match = null;
          let matchType = 'NOT_FOUND';

          // 1. Exact Alphanumeric Match (within spec)
          match = specFiltered.find(p => normalizeSku(p.sku) === normInput);
          if (match) {
            matchType = 'EXACT';
          } 
          
          // 2. Substring Match (within spec)
          if (!match) {
            match = specFiltered.find(p => {
              const pNorm = normalizeSku(p.sku);
              return pNorm.includes(normInput) || normInput.includes(pNorm);
            });
            if (match) matchType = 'PARTIAL';
          }

          // PHASE 2: GLOBAL FALLBACK (Search entire manufacturer catalog)
          // This is essential for fillers (UF), base moldings, and general accessories
          if (!match && allPricing) {
            // 3. Exact Global Match
            match = allPricing.find(p => normalizeSku(p.sku) === normInput);
            if (match) {
              matchType = 'GLOBAL_EXACT';
            } else {
              // 4. Partial Global Match
              match = allPricing.find(p => {
                const pNorm = normalizeSku(p.sku);
                return pNorm.includes(normInput) || normInput.includes(pNorm);
              });
              if (match) matchType = 'GLOBAL_PARTIAL';
            }
          }

          if (match) {
            matchedCount++;
            const price = Number(match.price) || 0;
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
            // PHASE 3: FUZZY SUGGESTIONS (Not found, provide top 3)
            const suggestions = allPricing
              ? allPricing
                  .map(p => ({ sku: p.sku, score: calculateSimilarity(normInput, p.sku) }))
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 3)
                  .map(c => c.sku)
                  .join(', ')
              : 'NONE';

            console.log(`[Pricing Engine] Unmatched SKU: ${rawInput} (Norm: ${normInput})`);

            bomItems.push({
              project_id: projectId,
              sku: rawInput,
              matched_sku: suggestions ? `SUGGEST: ${suggestions}` : 'NOT FOUND',
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

    console.log(`[Pricing Engine v21.0] Final Results: ${matchedCount}/${totalCount} matched.`);

    // Persist Results
    await supabase.from('quotation_boms').delete().eq('project_id', projectId);
    if (bomItems.length > 0) {
      const { error: insertError } = await supabase.from('quotation_boms').insert(bomItems);
      if (insertError) throw insertError;
    }

    await supabase.from('quotation_projects').update({ 
      manufacturer_id: manufacturerId,
      status: 'Priced' 
    }).eq('id', projectId);

    return Response.json({ success: true, matched: matchedCount, total: totalCount });

  } catch (err: any) {
    console.error('[Pricing Engine] Critical Error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
