import { createServerSupabase } from '@/lib/supabase-server';
import { compressSku, detectCategory, normalizeSku } from '@/lib/utils';
import stringSimilarity from 'string-similarity';

export const maxDuration = 300;

/**
 * UNIVERSAL HIGH-PRECISION SMART PRICING ENGINE (v57.0)
 * 
 * "SUPER QUALITY" FEATURES:
 * 1. MULTI-TIER SMART MATCHER: Local -> Global -> Compressed -> Suffix -> Fuzzy.
 * 2. ZERO-PRICE CATEGORY FALLBACK: Applies category averages if SKU is missing.
 * 3. RECURSIVE PAGINATED FETCH: Loads 100% of catalog data from all sheets.
 * 4. UNIVERSAL ACCESSORY PRIORITY: Automatically searches global sheets for Fillers/Molding.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

    if (!projectId || !manufacturerId) {
      return Response.json({ success: false, error: "Missing required IDs." }, { status: 400 });
    }

    const supabase = createServerSupabase();

    // 1. PROJECT DATA LOAD
    const { data: project, error: pError } = await supabase
      .from('quotation_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (pError || !project) throw new Error('Project not found.');
    const rooms = project.extracted_data?.rooms || [];
    
    // 2. EXHAUSTIVE CATALOG FETCH (Stream all rows from all sheets)
    let allPricing: any[] = [];
    let from = 0;
    const pageSize = 1000;
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

    console.log(`[Smart Engine v57] Loaded ${allPricing.length} total records from all catalog sheets.`);

    // 3. SMART INDEXING
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
      
      // Local Index (Collection Specific)
      localMap.set(`${sku}|${col}`, p);
      
      // Global Catalog Index (Essential for accessories on separate sheets)
      if (!globalSkuMap.has(sku) || col === "UNIVERSAL" || col.includes("ACCESSORY")) {
        globalSkuMap.set(sku, p);
      }
      
      // Compressed Index (Matches "UF 3" to "UF3")
      if (!compressedMap.has(comp)) compressedMap.set(comp, p);

      // Category Metrics for Fallback Estimates
      const stats = categoryStats.get(cat) || { total: 0, count: 0 };
      stats.total += Number(p.price) || 0;
      stats.count += 1;
      categoryStats.set(cat, stats);
    });

    /**
     * MULTI-TIER RECURSIVE SMART MATCHER
     */
    function findBestMatch(itemCode: string, roomCollection: string) {
      const target = normalizeKey(itemCode);
      if (!target) return null;

      const col = normalizeKey(roomCollection);
      const targetComp = compressSku(target);
      const category = detectCategory(target);

      // Variant Generation: Strip production suffixes (BUTT, H, L, R, FL)
      const variants = [
        target,
        target.replace(/\s+/g, ''),
        target.replace(/\s*(BUTT|H|L|R|FL|S|D)$/g, ''),
        target.replace(/[^A-Z0-9]/g, '')
      ].filter((v, i, self) => v && self.indexOf(v) === i);

      // TIER 1: STRICT LOCAL COLLECTION MATCH
      for (const v of variants) {
        const key = `${v}|${col}`;
        if (localMap.has(key)) return { match: localMap.get(key), type: 'STRICT_LOCAL' };
      }

      // TIER 2: GLOBAL CATALOG SEARCH (Checks all sheets for the item)
      for (const v of variants) {
        if (globalSkuMap.has(v)) return { match: globalSkuMap.get(v), type: 'GLOBAL_CATALOG' };
      }

      // TIER 3: COMPRESSED ALPHANUMERIC SEARCH
      if (compressedMap.has(targetComp)) return { match: compressedMap.get(targetComp), type: 'COMPRESSED_GLOBAL' };

      // TIER 4: AI FUZZY SIMILARITY (Smart fallback)
      if (allSkus.length > 0) {
        const fuzzy = stringSimilarity.findBestMatch(target, allSkus);
        if (fuzzy.bestMatch.rating > 0.85) {
          return { match: globalSkuMap.get(fuzzy.bestMatch.target), type: 'AI_FUZZY_MATCH' };
        }
      }

      // TIER 5: CATEGORY-AVERAGE FALLBACK (Ensures no $0.00 prices)
      const stats = categoryStats.get(category);
      if (stats && stats.count > 0) {
        const avg = stats.total / stats.count;
        return { 
          match: { sku: `${category} Est.`, price: avg, collection_name: 'CATEGORY_AVERAGE' }, 
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
            price_source: `Smart Matcher (${type})`,
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

    // Persist to Database
    await supabase.from('quotation_boms').delete().eq('project_id', projectId);
    if (bomItems.length > 0) {
      for (let i = 0; i < bomItems.length; i += 500) {
        await supabase.from('quotation_boms').insert(bomItems.slice(i, i + 500));
      }
    }

    await supabase.from('quotation_projects').update({ status: 'Priced' }).eq('id', projectId);
    return Response.json({ success: true, matched: matchedCount });

  } catch (err: any) {
    console.error('[Smart Pricing Engine v57] Critical Failure:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
