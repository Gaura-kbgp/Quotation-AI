import { createServerSupabase } from '@/lib/supabase-server';
import { calculateSimilarity, detectCategory, normalizeSku } from '@/lib/utils';

export const maxDuration = 120;

/**
 * Enterprise BOM Generation Engine (v21.0)
 * Features:
 * - Style-Agnostic Global Fallback
 * - 4-Tier Search Pipeline
 * - Multi-Sheet Cross-Reference
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
    
    // Load ALL Manufacturer Pricing records
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

          const rawTakeoff = String(cab.code).toUpperCase().trim();
          const targetCategory = detectCategory(rawTakeoff);
          
          let bestMatch: any = null;
          let bestScore = -1;
          let precisionLevel = 'NOT_FOUND';
          
          // Debugging candidates
          const candidates: any[] = [];

          // 1. PHASE ONE: SEARCH IN SELECTED STYLE (The target price category)
          const styleSpecificRecords = (allPricing || []).filter(p => 
            String(p.door_style || "").toUpperCase().trim() === roomSelectedStyle
          );

          // If we have style-specific records, search them first
          if (styleSpecificRecords.length > 0) {
            for (const p of styleSpecificRecords) {
              const score = calculateSimilarity(rawTakeoff, p.sku);
              if (score > bestScore) {
                bestScore = score;
                bestMatch = p;
              }
              if (score >= 1.0) break; 
            }
          }

          // 2. PHASE TWO: GLOBAL FALLBACK (Search all sheets and styles for the SKU)
          // If match is still poor (< 0.85), search the entire database for this manufacturer
          if (bestScore < 0.85) {
            for (const p of (allPricing || [])) {
              const score = calculateSimilarity(rawTakeoff, p.sku);
              // Slight penalty for global matches to favor style-specific ones if possible
              const adjustedScore = score * 0.98; 
              if (adjustedScore > bestScore) {
                bestScore = adjustedScore;
                bestMatch = p;
              }
              if (score >= 1.0) break;
            }
          }

          // Tier Fallback logic
          if (bestScore >= 0.90) {
            precisionLevel = 'EXACT';
          } else if (bestScore >= 0.75) {
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
              price_source: 'Manufacturer Guide',
              precision_level: precisionLevel,
              created_at: new Date().toISOString()
            });
          } else {
            // Collect top 3 candidates for the "Potential" UI helper
            const top3 = (allPricing || [])
              .map(p => ({ p, score: calculateSimilarity(rawTakeoff, p.sku) }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
              .map(c => `${c.p.sku} (${Math.round(c.score * 100)}%)`)
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
