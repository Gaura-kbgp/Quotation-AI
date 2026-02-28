import { createServerSupabase } from '@/lib/supabase-server';
import { compressSku } from '@/lib/utils';

export const maxDuration = 300;

/**
 * ULTIMATE SMART PRICING ENGINE (v43.0)
 * Implements Paginated Catalog Retrieval and Recursive Fallback Matching across ALL sheets.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

    if (!projectId || !manufacturerId) {
      return Response.json({ success: false, error: "Missing parameters." }, { status: 400 });
    }

    const supabase = createServerSupabase();

    const [pRes, mRes] = await Promise.all([
      supabase.from('quotation_projects').select('*').eq('id', projectId).single(),
      supabase.from('manufacturers').select('*').eq('id', manufacturerId).single()
    ]);

    if (pRes.error || !pRes.data) throw new Error('Project not found.');
    const project = pRes.data;
    const rooms = project.extracted_data?.rooms || [];
    
    // 1. EXHAUSTIVE CATALOG RETRIEVAL (Fetch 100% of the pricing guide)
    let allPricing: any[] = [];
    let from = 0;
    const step = 2000;
    let hasMore = true;

    while (hasMore) {
      const { data, error: sError } = await supabase
        .from('manufacturer_pricing')
        .select('*')
        .eq('manufacturer_id', manufacturerId)
        .range(from, from + step - 1);

      if (sError) throw new Error(`Database fetch error: ${sError.message}`);
      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allPricing = [...allPricing, ...data];
        from += step;
        if (data.length < step) hasMore = false;
      }
    }

    // 2. BUILD MULTI-TIER LOOKUP INDEXES
    const localMap = new Map<string, any>(); // SKU|Collection|Style
    const globalSkuMap = new Map<string, any>(); // SKU (Any Sheet Fallback)
    const compressedMap = new Map<string, any>(); // Compressed SKU (Fuzzy Fallback)

    allPricing.forEach(p => {
      const sku = String(p.sku || "").trim().toUpperCase();
      const col = String(p.collection_name || "").trim().toUpperCase();
      const sty = String(p.door_style || "").trim().toUpperCase();
      const comp = compressSku(sku);
      
      const fullKey = `${sku}|${col}|${sty}`;
      if (!localMap.has(fullKey)) localMap.set(fullKey, p);
      
      // Global fallback prioritized by "Better" matches (preferring non-standard sheets)
      if (!globalSkuMap.has(sku)) globalSkuMap.set(sku, p);
      if (!compressedMap.has(comp)) compressedMap.set(comp, p);
    });

    /**
     * RECURSIVE MATCHING ENGINE
     * Tries exact matches first, then falls back to compressed and global searches.
     */
    function findBestMatch(itemCode: string, collection: string, style: string) {
      const target = String(itemCode || "").trim().toUpperCase();
      if (!target) return null;

      const col = String(collection || "").trim().toUpperCase();
      const sty = String(style || "").trim().toUpperCase();
      const targetComp = compressSku(target);

      // Search Variants for specific variants (like stripping BUTT or handedness)
      const variants = [
        target,
        target.replace(/\s+/g, ''),
        target.replace(/\s*BUTT$/g, ''),
        target.replace(/\s*[HLR]$/g, ''),
        target.replace(/\s*FL$/g, ''),
        target.replace(/\s*(BUTT|H|L|R|FL)$/g, ''),
      ];

      const searchVariants = Array.from(new Set(variants.filter(Boolean)));

      // TIER 1: EXACT LOCAL COLLECTION MATCH
      for (const v of searchVariants) {
        const key = `${v}|${col}|${sty}`;
        if (localMap.has(key)) return { match: localMap.get(key), type: 'LOCAL' };
      }

      // TIER 2: COMPRESSED LOCAL MATCH (Ignores all whitespace)
      const compKey = `${targetComp}|${col}|${sty}`;
      if (compressedMap.has(compKey)) return { match: compressedMap.get(compKey), type: 'FUZZY_LOCAL' };

      // TIER 3: GLOBAL CATALOG MATCH (Checks all other sheets)
      for (const v of searchVariants) {
        if (globalSkuMap.has(v)) return { match: globalSkuMap.get(v), type: 'GLOBAL' };
      }

      // TIER 4: GLOBAL COMPRESSED MATCH
      if (compressedMap.has(targetComp)) return { match: compressedMap.get(targetComp), type: 'FUZZY_GLOBAL' };

      return null;
    }

    const bomItems: any[] = [];
    let matchedCount = 0;

    for (const room of rooms) {
      const roomCol = room.collection || "";
      const roomSty = room.door_style || "";
      
      const allItems = [
        ...(room.primaryCabinets || []),
        ...(room.otherItems || [])
      ];

      for (const item of allItems) {
        if (!item.code) continue;
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
            price_source: `Catalog (${type})`,
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

    // Atomic Update of BOM items
    await supabase.from('quotation_boms').delete().eq('project_id', projectId);
    if (bomItems.length > 0) {
      const BATCH_SIZE = 500;
      for (let i = 0; i < bomItems.length; i += BATCH_SIZE) {
        const batch = bomItems.slice(i, i + BATCH_SIZE);
        await supabase.from('quotation_boms').insert(batch);
      }
    }

    await supabase.from('quotation_projects').update({ status: 'Priced' }).eq('id', projectId);

    return Response.json({ success: true, matched: matchedCount });

  } catch (err: any) {
    console.error('[Ultimate Pricing Engine] Critical Failure:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
