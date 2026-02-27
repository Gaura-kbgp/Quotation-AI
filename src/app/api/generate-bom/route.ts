
import { createServerSupabase } from '@/lib/supabase-server';
import { normalizeSku, calculateSimilarity, detectCategory } from '@/lib/utils';

export const maxDuration = 120;

/**
 * Enterprise BOM Generation Engine (v20.0)
 * Features:
 * - Category-First Search Priority
 * - Tiered Confidence Scoring
 * - Closest Match Debugging (Top 3)
 * - Dimension-Aware Confidence Boost
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
    
    // Load ALL Manufacturer Pricing
    const { data: allPricing, error: sError } = await supabase
      .from('manufacturer_pricing')
      .select('*')
      .eq('manufacturer_id', manufacturerId);

    if (sError) {
      return Response.json({ success: false, error: `Database error: ${sError.message}` }, { status: 500 });
    }

    const bomItems: any[] = [];
    
    for (const room of rooms) {
      const roomSelectedStyle = String(room.door_style || "").toUpperCase().trim();
      const sections = room.sections || {};

      for (const [sectionName, items] of Object.entries(sections)) {
        const cabinetItems = items as any[];
        for (const cab of cabinetItems) {
          if (!cab.code) continue;

          const rawTakeoff = cab.code;
          const targetCategory = detectCategory(rawTakeoff);
          
          let bestMatch: any = null;
          let bestScore = -1;
          let precisionLevel = 'NOT_FOUND';
          
          // Debugging candidates
          const candidates: any[] = [];

          // 1. Filter by Style for Category-First Search
          const styleSpecificRecords = (allPricing || []).filter(p => 
            String(p.door_style).toUpperCase().trim() === roomSelectedStyle
          );

          // 2. SEARCH PIPELINE (Category First)
          const searchSet = styleSpecificRecords.length > 0 ? styleSpecificRecords : (allPricing || []);

          for (const p of searchSet) {
            const currentScore = calculateSimilarity(rawTakeoff, p.sku);
            
            // Tier 1: EXACT
            if (currentScore >= 0.95) {
              bestScore = 1.0;
              bestMatch = p;
              precisionLevel = 'EXACT';
              break; 
            }

            if (currentScore > bestScore) {
              bestScore = currentScore;
              bestMatch = p;
            }

            // Keep track for top 3 fallback
            candidates.push({ record: p, score: currentScore });
          }

          // Tier Fallback logic
          if (bestScore >= 0.90) {
            precisionLevel = 'EXACT';
          } else if (bestScore >= 0.80) {
            precisionLevel = 'FUZZY';
          } else {
            precisionLevel = 'NOT_FOUND';
            bestMatch = null;
          }

          if (bestMatch) {
            const price = Number(bestMatch.price) || 0;
            bomItems.push({
              project_id: projectId,
              sku: rawTakeoff,
              matched_sku: bestMatch.sku,
              qty: Number(cab.qty) || 1,
              unit_price: price,
              line_total: price * (Number(cab.qty) || 1),
              room: room.room_name,
              collection: room.collection || bestMatch.collection_name,
              door_style: room.door_style || bestMatch.door_style,
              price_source: 'Manufacturer Price Guide',
              precision_level: precisionLevel,
              created_at: new Date().toISOString()
            });
          } else {
            // Return NOT FOUND with potential matches in debugging info
            const top3 = candidates
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
              .map(c => `${c.record.sku} (${Math.round(c.score * 100)}%)`)
              .join(', ');

            bomItems.push({
              project_id: projectId,
              sku: rawTakeoff,
              matched_sku: top3 ? `Potential: ${top3}` : 'NOT FOUND',
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

    // Persist results
    await supabase.from('quotation_boms').delete().eq('project_id', projectId);

    if (bomItems.length > 0) {
      await supabase.from('quotation_boms').insert(bomItems);
    }

    await supabase.from('quotation_projects').update({ 
      manufacturer_id: manufacturerId,
      status: 'Priced' 
    }).eq('id', projectId);

    return Response.json({ success: true, count: bomItems.length });

  } catch (err: any) {
    console.error('[Enterprise Engine] Critical Error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
