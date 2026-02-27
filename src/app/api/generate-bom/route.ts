import { createServerSupabase } from '@/lib/supabase-server';
import { normalizeSku, calculateSimilarity, tokenizeSku } from '@/lib/utils';

export const maxDuration = 120; // Increased for high-accuracy scoring

/**
 * High-Accuracy Pricing Engine (v18.0)
 * Implements 8-stage matching: Normalized Exact, Prefix, Token/Dimensions, and Levenshtein Fuzzy.
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
    
    // Load ALL Manufacturer Pricing (Includes main SKUs and Accessory Sheets)
    const { data: allPricing, error: sError } = await supabase
      .from('manufacturer_pricing')
      .select('*')
      .eq('manufacturer_id', manufacturerId);

    if (sError) {
      return Response.json({ success: false, error: `Database error: ${sError.message}` }, { status: 500 });
    }

    console.log(`[High Accuracy Engine] Loaded ${allPricing?.length || 0} price records.`);

    const bomItems: any[] = [];
    
    for (const room of rooms) {
      const roomSelectedStyle = String(room.door_style || "").toUpperCase().trim();
      const sections = room.sections || {};

      for (const [sectionName, items] of Object.entries(sections)) {
        const cabinetItems = items as any[];
        for (const cab of cabinetItems) {
          if (!cab.code) continue;

          const rawTakeoff = cab.code;
          const normTakeoff = normalizeSku(rawTakeoff);
          const tokensTakeoff = tokenizeSku(rawTakeoff);
          
          let bestMatch: any = null;
          let bestScore = -1;
          let precisionLevel = 'NOT_FOUND';

          // SCORING PIPELINE
          for (const p of (allPricing || [])) {
            const normExcel = normalizeSku(p.sku);
            const styleMatch = String(p.door_style).toUpperCase().trim() === roomSelectedStyle;
            
            let currentScore = 0;
            let currentLevel = 'NOT_FOUND';

            // Tier 1: Exact Normalized Match
            if (normTakeoff === normExcel) {
              currentScore = 1.0;
              currentLevel = 'EXACT';
            } 
            // Tier 2: Prefix Matching
            else if (normExcel.startsWith(normTakeoff) || normTakeoff.startsWith(normExcel)) {
              currentScore = 0.9;
              currentLevel = 'PARTIAL';
            }
            // Tier 3: Token-Based Dimension Match (Width/Height)
            else {
              const tokensExcel = tokenizeSku(p.sku);
              let tokenMatchCount = 0;
              const maxTokens = Math.max(tokensTakeoff.length, tokensExcel.length);
              tokensTakeoff.forEach(t => { if (tokensExcel.includes(t)) tokenMatchCount++; });
              
              const tokenScore = tokenMatchCount / maxTokens;
              if (tokenScore >= 0.8) {
                currentScore = 0.8;
                currentLevel = 'FUZZY';
              } else {
                // Tier 4: Fuzzy Levenshtein
                const sim = calculateSimilarity(normTakeoff, normExcel);
                currentScore = sim;
                currentLevel = sim > 0.85 ? 'FUZZY' : 'NOT_FOUND';
              }
            }

            // Weighting: Prioritize selected Door Style
            if (styleMatch) currentScore += 0.05;

            // Update Best Match
            if (currentScore > bestScore && currentScore >= 0.7) {
              bestScore = currentScore;
              bestMatch = p;
              precisionLevel = currentLevel;
            }
          }

          if (bestMatch && bestScore >= 0.85) {
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
            // No confident match found
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
    console.error('[Pricing Engine] Critical Error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
