import { createServerSupabase } from '@/lib/supabase-server';
import { compressSku, detectCategory } from '@/lib/utils';
import stringSimilarity from 'string-similarity';

export const maxDuration = 300;

/**
 * UNIVERSAL HIGH-PRECISION PRICING ENGINE (v55.0)
 * 
 * "SUPER QUALITY" FEATURES:
 * 1. UNIVERSAL ACCESSORY PRIORITY: Immediately searches global map for items like UF3.
 * 2. CATEGORY ESTIMATION: Prevents $0.00 prices using collection-wide averages.
 * 3. PAGINATED DATA STREAM: Fetches 100% of catalog records from all sheets.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

    if (!projectId || !manufacturerId) {
      return Response.json({ success: false, error: "Missing IDs." }, { status: 400 });
    }

    const supabase = createServerSupabase();

    // 1. PROJECT LOAD
    const { data: project, error: pError } = await supabase
      .from('quotation_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (pError || !project) throw new Error('Project not found.');
    const rooms = project.extracted_data?.rooms || [];
    
    // 2. EXHAUSTIVE CATALOG FETCH (Paginated)
    let allPricing: any[] = [];
    let from = 0;
    const pageSize = 2000;
    let hasMore = true;

    while (hasMore) {
      const { data, error: sError } = await supabase
        .from('manufacturer_pricing')
        .select('*')
        .eq('manufacturer_id', manufacturerId)
        .range(from, from + pageSize - 1);

      if (sError) throw sError;
      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allPricing = [...allPricing, ...data];
        from += pageSize;
        if (data.length < pageSize) hasMore = false;
      }
    }

    // 3. MULTI-ENGINE INDEXING
    const localMap = new Map<string, any>();
    const globalSkuMap = new Map<string, any>();
    const compressedMap = new Map<string, any>();
    const categoryStats = new Map<string, { total: number, count: number }>();
    const allSkus: string[] = [];

    const normalizeKey = (s: string) => String(s || "").trim().toUpperCase();

    allPricing.forEach(p => {
      const sku = normalizeKey(p.sku);
      const col = normalizeKey(p.collection_name);
      const comp = compressSku(sku);
      const cat = detectCategory(sku);

      allSkus.push(sku);
      
      // Strict Index
      localMap.set(`${sku}|${col}`, p);
      
      // Global Index (Accessories priority)
      if (!globalSkuMap.has(sku) || col === "UNIVERSAL" || col.includes("ACCESSORY")) {
        globalSkuMap.set(sku, p);
      }
      
      if (!compressedMap.has(comp)) compressedMap.set(comp, p);

      // Category Averages for Fallback
      const stats = categoryStats.get(cat) || { total: 0, count: 0 };
      stats.total += Number(p.price) || 0;
      stats.count += 1;
      categoryStats.set(cat, stats);
    });

    /**
     * QUAD-ENGINE MATCHING + CATEGORY FALLBACK
     */
    function findBestMatch(itemCode: string, roomCollection: string) {
      const target = normalizeKey(itemCode);
      if (!target) return null;

      const col = normalizeKey(roomCollection);
      const targetComp = compressSku(target);
      const category = detectCategory(target);

      // Variants to try: Exact, NoSpaces, NoSuffix
      const searchVariants = [
        target,
        target.replace(/\s+/g, ''),
        target.replace(/\s*(BUTT|H|L|R|FL|S|D)$/g, ''),
      ].filter((v, i, self) => v && self.indexOf(v) === i);

      // ENGINE 1: LOCAL COLLECTION SEARCH
      for (const v of searchVariants) {
        const key = `${v}|${col}`;
        if (localMap.has(key)) return { match: localMap.get(key), type: 'LOCAL_STRICT' };
      }

      // ENGINE 2: GLOBAL CATALOG SEARCH (Critical for accessories like UF3)
      for (const v of searchVariants) {
        if (globalSkuMap.has(v)) return { match: globalSkuMap.get(v), type: 'GLOBAL_CATALOG' };
      }

      // ENGINE 3: COMPRESSED GLOBAL SEARCH
      if (compressedMap.has(targetComp)) return { match: compressedMap.get(targetComp), type: 'GLOBAL_COMPRESSED' };

      // ENGINE 4: FUZZY SEARCH (Closest alphabetical match)
      if (allSkus.length > 0) {
        const fuzzy = stringSimilarity.findBestMatch(target, allSkus);
        if (fuzzy.bestMatch.rating > 0.85) {
          return { match: globalSkuMap.get(fuzzy.bestMatch.target), type: 'FUZZY_MATCH' };
        }
      }

      // FALLBACK: CATEGORY AVERAGE (Never return $0 if we can estimate)
      const stats = categoryStats.get(category);
      if (stats && stats.count > 0) {
        const avg = stats.total / stats.count;
        return { 
          match: { sku: `${category} Estimate`, price: avg, collection_name: 'ESTIMATED' }, 
          type: 'CATEGORY_ESTIMATE' 
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
            price_source: `Matcher (${type})`,
            precision_level: type,
            created_at: new Date().toISOString()
          });
        } else {
          bomItems.push({
            project_id: projectId,
            sku: item.code,
            matched_sku: 'NOT FOUND',
            qty: Number(item.qty) || 1,
            unit_price: 0,
            line_total: 0,
            room: room.room_name,
            collection: room.collection || 'N/A',
            door_style: room.door_style || 'N/A',
            price_source: 'MISSING',
            precision_level: 'NOT_FOUND',
            created_at: new Date().toISOString()
          });
        }
      }
    }

    // Persist Results
    await supabase.from('quotation_boms').delete().eq('project_id', projectId);
    if (bomItems.length > 0) {
      for (let i = 0; i < bomItems.length; i += 500) {
        await supabase.from('quotation_boms').insert(bomItems.slice(i, i + 500));
      }
    }

    await supabase.from('quotation_projects').update({ status: 'Priced' }).eq('id', projectId);
    return Response.json({ success: true, matched: matchedCount });

  } catch (err: any) {
    console.error('[Pricing Engine] Critical Error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
