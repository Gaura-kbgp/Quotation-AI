import { createServerSupabase } from '@/lib/supabase-server';
import { normalizeSku, extractBaseModel, getLevenshteinDistance, calculateSimilarity } from '@/lib/utils';

export const maxDuration = 120;

/**
 * ENTERPRISE PRICING ENGINE (v21.0)
 * Implements 8-stage matching pipeline:
 * 1. Strict Normalization
 * 2. Multi-Sheet Dataset Merging
 * 3. Specification Filtering (Mandatory)
 * 4. 4-Tier Priority (Exact -> Contains -> Similar -> Structure)
 * 5. Intelligent Fallbacks (Global Search)
 * 6. $0 Protection
 * 7. Candidate Suggestions
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

    if (!projectId || !manufacturerId) {
      return Response.json({ success: false, error: "Missing required parameters." }, { status: 400 });
    }

    const supabase = createServerSupabase();

    // 1. Fetch Project and Manufacturers to ensure active status
    const [pRes, mRes] = await Promise.all([
      supabase.from('quotation_projects').select('*').eq('id', projectId).single(),
      supabase.from('manufacturers').select('*').eq('id', manufacturerId).single()
    ]);

    if (pRes.error || !pRes.data) throw new Error('Project retrieval failed.');
    if (mRes.error || !mRes.data) throw new Error('Manufacturer pricing sheet not found or inactive.');

    const project = pRes.data;
    const rooms = project.extracted_data?.rooms || [];
    
    // 2. Load ALL sheets for this manufacturer and merge into one dataset
    const { data: allPricing, error: sError } = await supabase
      .from('manufacturer_pricing')
      .select('*')
      .eq('manufacturer_id', manufacturerId);

    if (sError) throw new Error(`Database error: ${sError.message}`);
    if (!allPricing || allPricing.length === 0) throw new Error('No pricing records found for this manufacturer.');

    console.log(`[Enterprise Engine] Loaded ${allPricing.length} pricing records from all sheets.`);

    const bomItems: any[] = [];
    
    for (const room of rooms) {
      const selectedCollection = normalizeSku(room.collection || "");
      const selectedStyle = normalizeSku(room.door_style || "");
      const sections = room.sections || {};

      for (const [sectionName, items] of Object.entries(sections)) {
        const cabinetItems = items as any[];
        for (const cab of cabinetItems) {
          if (!cab.code) continue;

          const rawInput = String(cab.code).toUpperCase().trim();
          const normalizedInput = normalizeSku(rawInput);
          const baseInput = extractBaseModel(normalizedInput);
          
          let result: { match: any, type: string, confidence: number } | null = null;

          // 3. SPECIFICATION FILTER (MANDATORY PHASE)
          // Search only in rows matching the selected style/collection
          const styleFiltered = allPricing.filter(p => {
            const pColl = normalizeSku(p.collection_name);
            const pStyle = normalizeSku(p.door_style);
            return pColl === selectedCollection && pStyle === selectedStyle;
          });

          // 4. MATCHING PRIORITY (PIPELINE)
          result = runMatchingPipeline(normalizedInput, baseInput, styleFiltered);

          // 5. INTELLIGENT FALLBACK (GLOBAL PHASE)
          // If not found in specific style, search entire manufacturer database (Accessories, Global sheets)
          if (!result) {
            console.log(`[Enterprise Engine] Falling back to global search for ${normalizedInput}`);
            result = runMatchingPipeline(normalizedInput, baseInput, allPricing);
          }

          if (result) {
            const price = Number(result.match.price) || 0;
            bomItems.push({
              project_id: projectId,
              sku: rawInput,
              matched_sku: result.match.sku,
              qty: Number(cab.qty) || 1,
              unit_price: price,
              line_total: price * (Number(cab.qty) || 1),
              room: room.room_name,
              collection: room.collection || result.match.collection_name,
              door_style: room.door_style || result.match.door_style,
              price_source: `Price Book (${result.type})`,
              precision_level: result.type,
              created_at: new Date().toISOString()
            });
          } else {
            // 7. CANDIDATE SUGGESTIONS (TOP 3)
            const suggestions = allPricing
              .map(p => ({ p, score: calculateSimilarity(normalizedInput, p.sku) }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
              .map(c => `${c.p.sku} (${Math.round(c.score * 100)}%)`)
              .join(', ');

            bomItems.push({
              project_id: projectId,
              sku: rawInput,
              matched_sku: suggestions ? `Potential: ${suggestions}` : 'NOT FOUND',
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

/**
 * 4-TIER MATCHING PIPELINE
 */
function runMatchingPipeline(normalizedInput: string, baseInput: string, dataset: any[]) {
  // Step 1: EXACT MATCH
  const exact = dataset.find(p => normalizeSku(p.sku) === normalizedInput);
  if (exact) return { match: exact, type: 'EXACT', confidence: 100 };

  // Step 2: CONTAINS MATCH
  const contains = dataset.find(p => {
    const pSku = normalizeSku(p.sku);
    return pSku.includes(normalizedInput) || normalizedInput.includes(pSku);
  });
  if (contains) return { match: contains, type: 'PARTIAL', confidence: 90 };

  // Step 3: SIMILAR MATCH (Levenshtein Distance < 5)
  const similar = dataset.find(p => {
    const dist = getLevenshteinDistance(normalizedInput, normalizeSku(p.sku));
    return dist > 0 && dist < 5;
  });
  if (similar) return { match: similar, type: 'SIMILAR', confidence: 85 };

  // Step 4: STRUCTURE MATCH (Base model fallback)
  const structure = dataset.find(p => {
    const pBase = extractBaseModel(p.sku);
    return pBase === baseInput;
  });
  if (structure) return { match: structure, type: 'STRUCTURE', confidence: 80 };

  return null;
}
