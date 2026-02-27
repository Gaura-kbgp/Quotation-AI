import { createServerSupabase } from '@/lib/supabase-server';
import { normalizeSku, getLevenshteinDistance, calculateSimilarity } from '@/lib/utils';

export const maxDuration = 120;

/**
 * ENTERPRISE PRICING ENGINE (v22.0)
 * 1. Strict Normalization Fallback
 * 2. Spec-First Filtering
 * 3. Multi-Tier Matching (Exact -> Contains -> Similar -> Structure)
 * 4. Audit Logging
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
    
    // Load ALL pricing for this manufacturer
    const { data: allPricing, error: sError } = await supabase
      .from('manufacturer_pricing')
      .select('*')
      .eq('manufacturer_id', manufacturerId);

    if (sError) throw new Error(`Database error: ${sError.message}`);
    
    console.log(`[Pricing Engine] Loaded ${allPricing?.length || 0} records.`);

    const bomItems: any[] = [];
    let matchedCount = 0;
    let totalCount = 0;
    const unmatched: string[] = [];

    for (const room of rooms) {
      const selectedCollection = (room.collection || "").toUpperCase();
      const selectedStyle = (room.door_style || "").toUpperCase();
      const sections = room.sections || {};

      for (const [sectionName, items] of Object.entries(sections)) {
        const cabinetItems = items as any[];
        for (const cab of cabinetItems) {
          if (!cab.code) continue;
          totalCount++;

          const rawInput = String(cab.code).trim();
          const normInput = normalizeSku(rawInput);
          
          // PHASE 1: FILTER BY SELECTED SPEC
          const specFiltered = allPricing?.filter(p => 
            p.collection_name === selectedCollection && 
            p.door_style === selectedStyle
          ) || [];

          let match = null;
          let matchType = 'NOT_FOUND';

          // 1. EXACT NORMALIZED
          match = specFiltered.find(p => normalizeSku(p.sku) === normInput);
          if (match) matchType = 'EXACT';

          // 2. CONTAINS
          if (!match) {
            match = specFiltered.find(p => {
              const pNorm = normalizeSku(p.sku);
              return pNorm.includes(normInput) || normInput.includes(pNorm);
            });
            if (match) matchType = 'PARTIAL';
          }

          // 3. GLOBAL FALLBACK (Search all sheets if not in spec)
          if (!match) {
            match = allPricing?.find(p => normalizeSku(p.sku) === normInput);
            if (match) matchType = 'GLOBAL_EXACT';
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
            unmatched.push(rawInput);
            // Suggest top 3
            const suggestions = allPricing
              ? allPricing
                  .slice(0, 500) // Performance cap
                  .map(p => ({ p, score: calculateSimilarity(normInput, p.sku) }))
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 3)
                  .map(c => c.p.sku)
                  .join(', ')
              : 'NONE';

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

    console.log(`[Pricing Engine] Results: ${matchedCount}/${totalCount} matched.`);
    if (unmatched.length > 0) console.log(`[Pricing Engine] Unmatched List:`, unmatched);

    // Persist
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
