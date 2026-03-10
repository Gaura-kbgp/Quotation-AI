import { createServerSupabase } from '@/lib/supabase-server';
import { compressSku, detectCategory, normalizeSku } from '@/lib/utils';
import stringSimilarity from 'string-similarity';

export const maxDuration = 300;

/**
 * UNIVERSAL "SMART JACK" PRICING ENGINE (v99.0)
 * 
 * ARCHITECTURE:
 * 1. EXHAUSTIVE CATALOG STREAMING: Loads 100% of DB records in batches.
 * 2. MULTI-STAGE NORMALIZED SEARCH: Matches "UF 342" to "UF342" using compressed keys.
 * 3. UNIVERSAL PRIORITY: Prioritizes Accessory/Filler sheets for global matches.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

    if (!projectId || !manufacturerId) {
      return Response.json({ success: false, error: "Missing required IDs." }, { status: 400 });
    }

    const supabase = createServerSupabase();

    const { data: project } = await supabase
      .from('quotation_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (!project) throw new Error('Project not found.');
    const rooms = project.extracted_data?.rooms || [];
    
    let allPricing: any[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data } = await supabase
        .from('manufacturer_pricing')
        .select('*')
        .eq('manufacturer_id', manufacturerId)
        .range(from, from + pageSize - 1);

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allPricing = [...allPricing, ...data];
        from += pageSize;
        if (data.length < pageSize) hasMore = false;
      }
    }

    console.log(`[Smart Engine v99] Indexed ${allPricing.length} pricing records.`);

    const localMap = new Map<string, any>();
    const globalSkuMap = new Map<string, any>();
    const compressedGlobalMap = new Map<string, any>();
    const categoryStats = new Map<string, { total: number, count: number }>();
    const allSkus: string[] = [];

    const normalizeKey = (s: string) => String(s || "").trim().toUpperCase();

    allPricing.forEach(p => {
      const sku = normalizeKey(p.sku);
      const compSku = compressSku(sku);
      const col = normalizeKey(p.collection_name);
      const cat = detectCategory(sku);

      allSkus.push(sku);
      
      // Local indexing (Specific to room's chosen collection)
      localMap.set(`${sku}|${col}`, p);
      
      // Global indexing (Priority to UNIVERSAL sheets)
      if (!globalSkuMap.has(sku) || col === "UNIVERSAL") {
        globalSkuMap.set(sku, p);
      }
      
      // Compressed indexing (UF 342 -> UF342)
      if (!compressedGlobalMap.has(compSku) || col === "UNIVERSAL") {
        compressedGlobalMap.set(compSku, p);
      }

      // Stats for fallback
      const stats = categoryStats.get(cat) || { total: 0, count: 0 };
      stats.total += Number(p.price) || 0;
      stats.count += 1;
      categoryStats.set(cat, stats);
    });

    function findBestMatch(itemCode: string, roomCollection: string) {
      const target = normalizeKey(itemCode);
      if (!target) return null;

      const col = normalizeKey(roomCollection);
      const targetComp = compressSku(target);
      const category = detectCategory(target);

      // Variants to try: Original, No Spaces, Basic Regex Clean
      const variants = [
        target,
        target.replace(/\s+/g, ''),
        target.replace(/\s*(BUTT|H|L|R|FL|S|D)$/g, ''),
        target.replace(/[^A-Z0-9]/g, '')
      ].filter((v, i, self) => v && self.indexOf(v) === i);

      // TIER 1: STRICT LOCAL MATCH (Exact SKU in Room Collection)
      for (const v of variants) {
        const key = `${v}|${col}`;
        if (localMap.has(key)) return { match: localMap.get(key), type: 'STRICT_LOCAL' };
      }

      // TIER 2: GLOBAL CATALOG MATCH (Universal prioritized)
      for (const v of variants) {
        if (globalSkuMap.has(v)) return { match: globalSkuMap.get(v), type: 'GLOBAL_CATALOG' };
      }

      // TIER 3: COMPRESSED GLOBAL MATCH (UF 342 -> UF342)
      if (compressedGlobalMap.has(targetComp)) {
        return { match: compressedGlobalMap.get(targetComp), type: 'COMPRESSED_MATCH' };
      }

      // TIER 4: AI FUZZY MATCH (High threshold for production safety)
      if (allSkus.length > 0) {
        const fuzzy = stringSimilarity.findBestMatch(target, allSkus);
        if (fuzzy.bestMatch.rating > 0.88) {
          return { match: globalSkuMap.get(fuzzy.bestMatch.target), type: 'AI_FUZZY_MATCH' };
        }
      }

      // TIER 5: CATEGORY FALLBACK (Only if all else fails)
      const stats = categoryStats.get(category);
      if (stats && stats.count > 0) {
        return { 
          match: { sku: `${category} Est.`, price: stats.total / stats.count, collection_name: 'CAT_AVG' }, 
          type: 'CATEGORY_FALLBACK' 
        };
      }

      return null;
    }

    const bomItems: any[] = [];
    let matchedCount = 0;

    for (const room of rooms) {
      const allItems = [...(room.primaryCabinets || []), ...(room.otherItems || [])];
      for (const item of allItems) {
        const result = findBestMatch(item.code, room.collection || "");
        if (result) {
          matchedCount++;
          const { match, type } = result;
          const price = Number(match.price) || 0;
          bomItems.push({
            project_id: projectId,
            sku: item.code,
            matched_sku: match.sku,
            qty: Number(item.qty) || 1,
            unit_price: price,
            line_total: price * (Number(item.qty) || 1),
            room: room.room_name,
            collection: room.collection || match.collection_name,
            door_style: room.door_style || 'UNIVERSAL',
            price_source: `Smart Engine (${type})`,
            precision_level: type,
            created_at: new Date().toISOString()
          });
        }
      }
    }

    await supabase.from('quotation_boms').delete().eq('project_id', projectId);
    if (bomItems.length > 0) {
      for (let i = 0; i < bomItems.length; i += 500) {
        await supabase.from('quotation_boms').insert(bomItems.slice(i, i + 500));
      }
    }

    await supabase.from('quotation_projects').update({ status: 'Priced' }).eq('id', projectId);
    return Response.json({ success: true, matched: matchedCount });

  } catch (err: any) {
    console.error('[Smart Engine v99] Failure:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
