import { createServerSupabase } from '@/lib/supabase-server';
import { compressSku, detectCategory } from '@/lib/utils';
import stringSimilarity from 'string-similarity';

export const maxDuration = 300;

/**
 * UNIVERSAL HIGH-PRECISION PRICING SYSTEM (v53.0)
 * 
 * "SUPER QUALITY" FEATURES:
 * 1. FULL-WORKBOOK SCAN: Fetches 100% of data across 60+ sheets.
 * 2. CATEGORY-AWARE FALLBACK: Prevents $0.00 prices by using category averages.
 * 3. FUZZY STRING MATCHING: Uses string-similarity for resilient SKU lookups.
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
    
    // 2. STABLE CATALOG STREAMING (Paginated Load)
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

    // 3. MULTI-ENGINE INDEXING
    const localMap = new Map<string, any>();
    const globalSkuMap = new Map<string, any>();
    const compressedMap = new Map<string, any>();
    const categoryAverages = new Map<string, { total: number, count: number }>();
    const allSkus: string[] = [];

    const normalizeKey = (s: string) => String(s || "").trim().toUpperCase();

    allPricing.forEach(p => {
      const sku = normalizeKey(p.sku);
      const col = normalizeKey(p.collection_name);
      const sty = normalizeKey(p.door_style || "UNIVERSAL");
      const comp = compressSku(sku);
      const cat = detectCategory(sku);

      allSkus.push(sku);
      
      const fullKey = `${sku}|${col}|${sty}`;
      if (!localMap.has(fullKey)) localMap.set(fullKey, p);
      
      // Global Index (Accessories priority)
      if (!globalSkuMap.has(sku) || col === "UNIVERSAL" || col.includes("ACCESSORY")) {
        globalSkuMap.set(sku, p);
      }
      
      if (!compressedMap.has(comp)) compressedMap.set(comp, p);

      // Category Stats
      const stats = categoryAverages.get(cat) || { total: 0, count: 0 };
      stats.total += Number(p.price) || 0;
      stats.count += 1;
      categoryAverages.set(cat, stats);
    });

    /**
     * QUAD-ENGINE MATCHING + CATEGORY FALLBACK
     */
    function findBestMatch(itemCode: string, collection: string, style: string) {
      const target = normalizeKey(itemCode);
      if (!target) return null;

      const col = normalizeKey(collection);
      const sty = normalizeKey(style);
      const targetComp = compressSku(target);
      const category = detectCategory(target);

      const searchVariants = [
        target,
        target.replace(/\s+/g, ''),
        target.replace(/\s*(BUTT|H|L|R|FL|S|D)$/g, ''),
        target.substring(0, target.length - 1), // Try stripping last character
      ].filter((v, i, self) => v && self.indexOf(v) === i);

      // ENGINE 1: LOCAL STRICT
      for (const v of searchVariants) {
        const key = `${v}|${col}|${sty}`;
        if (localMap.has(key)) return { match: localMap.get(key), type: 'LOCAL_STRICT' };
      }

      // ENGINE 2: GLOBAL CATALOG (Accessories)
      for (const v of searchVariants) {
        if (globalSkuMap.has(v)) return { match: globalSkuMap.get(v), type: 'GLOBAL_CATALOG' };
      }

      // ENGINE 3: COMPRESSED PATTERN
      if (compressedMap.has(targetComp)) return { match: compressedMap.get(targetComp), type: 'GLOBAL_PATTERN' };

      // ENGINE 4: FUZZY SIMILARITY
      if (allSkus.length > 0) {
        const fuzzy = stringSimilarity.findBestMatch(target, allSkus);
        if (fuzzy.bestMatch.rating > 0.8) {
          return { match: globalSkuMap.get(fuzzy.bestMatch.target), type: 'FUZZY_MATCH' };
        }
      }

      // FALLBACK: CATEGORY AVERAGE (Prevents $0.00)
      const stats = categoryAverages.get(category);
      if (stats && stats.count > 0) {
        const avgPrice = stats.total / stats.count;
        return { 
          match: { sku: `${category} Estimate`, price: avgPrice, collection_name: 'ESTIMATED', door_style: 'ESTIMATED' }, 
          type: 'CATEGORY_FALLBACK' 
        };
      }

      return null;
    }

    const bomItems: any[] = [];
    let matchedCount = 0;

    for (const room of rooms) {
      const roomCol = room.collection || "";
      const roomSty = room.door_style || "";
      const allItems = [...(room.primaryCabinets || []), ...(room.otherItems || [])];

      for (const item of allItems) {
        const result = findBestMatch(item.code, roomCol, roomSty);

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
            door_style: room.door_style || match.door_style,
            price_source: `Match Engine (${type})`,
            precision_level: type,
            created_at: new Date().toISOString()
          });
        } else {
          bomItems.push({
            project_id: projectId,
            sku: item.code,
            matched_sku: 'SKU not present in pricing guide',
            qty: Number(item.qty) || 1,
            unit_price: 0,
            line_total: 0,
            room: room.room_name,
            collection: roomCol || 'N/A',
            door_style: roomSty || 'N/A',
            price_source: 'MISSING',
            precision_level: 'NOT_FOUND',
            created_at: new Date().toISOString()
          });
        }
      }
    }

    await supabase.from('quotation_boms').delete().eq('project_id', projectId);
    
    if (bomItems.length > 0) {
      const BATCH_SIZE = 500;
      for (let i = 0; i < bomItems.length; i += BATCH_SIZE) {
        await supabase.from('quotation_boms').insert(bomItems.slice(i, i + BATCH_SIZE));
      }
    }

    await supabase.from('quotation_projects').update({ status: 'Priced' }).eq('id', projectId);

    return Response.json({ success: true, matched: matchedCount });

  } catch (err: any) {
    console.error('[Pricing Engine] Error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
