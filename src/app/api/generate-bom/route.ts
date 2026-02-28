import { createServerSupabase } from '@/lib/supabase-server';

export const maxDuration = 120;

/**
 * ENTERPRISE PRICING ENGINE (v36.0)
 * Optimized for Strict Exact Matching and Universal Accessory Fallbacks.
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
    
    // PAGINATED FETCH: Load entire manufacturer pricing catalog
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

      if (sError) throw new Error(`Database error: ${sError.message}`);
      
      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allPricing = [...allPricing, ...data];
        from += step;
        if (data.length < step) hasMore = false;
      }
    }

    // Build indexing maps
    // 1. Strict Map: EXACT_SKU | COLLECTION | STYLE
    const strictMap = new Map<string, any>();
    // 2. Global Map: EXACT_SKU (for accessories like UF3 found in any sheet)
    const globalSkuMap = new Map<string, any>();

    allPricing.forEach(p => {
      const sku = String(p.sku || "").trim().toUpperCase();
      const col = String(p.collection_name || "").trim().toUpperCase();
      const sty = String(p.door_style || "").trim().toUpperCase();
      
      const key = `${sku}|${col}|${sty}`;
      strictMap.set(key, p);

      if (!globalSkuMap.has(sku) || (p.price > 0 && globalSkuMap.get(sku)?.price === 0)) {
        globalSkuMap.set(sku, p);
      }
    });

    const bomItems: any[] = [];
    let matchedCount = 0;

    /**
     * Strict Exact Matcher with Fallbacks
     */
    function findBestMatch(itemCode: string, collection: string, style: string) {
      const target = itemCode.trim().toUpperCase();
      if (!target) return null;

      const col = collection.trim().toUpperCase();
      const sty = style.trim().toUpperCase();

      // STAGE 1: Exact Match in Selected Collection/Style
      const exactKey = `${target}|${col}|${sty}`;
      if (strictMap.has(exactKey)) {
        return { match: strictMap.get(exactKey), type: 'EXACT' };
      }

      // STAGE 2: Global Match (for Fillers/Accessories across all sheets)
      if (globalSkuMap.has(target)) {
        return { match: globalSkuMap.get(target), type: 'GLOBAL' };
      }

      // STAGE 3: Smart Fallbacks (BUTT, Handedness)
      const variants = [
        { s: target.replace(" BUTT", ""), type: 'NO_BUTT' },
        { s: target.replace(/BUTT$/, ""), type: 'NO_BUTT_COMPRESSED' },
        { s: target.replace(/[LRH]$/, ""), type: 'NO_HANDING' },
        { s: target.replace(/(BUTT|[LRH])$/, ""), type: 'BASE_SKU' },
        { s: target.replace(/FL$/, ""), type: 'NO_FL' }
      ];

      for (const variant of variants) {
        if (!variant.s || variant.s === target) continue;
        
        // Try exact fallback in collection
        const fallKey = `${variant.s}|${col}|${sty}`;
        if (strictMap.has(fallKey)) return { match: strictMap.get(fallKey), type: variant.type };
        
        // Try global fallback
        if (globalSkuMap.has(variant.s)) return { match: globalSkuMap.get(variant.s), type: `GLOBAL_${variant.type}` };
      }

      return null;
    }

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
            price_source: `Auto (${type})`,
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

    // Cleanup and Insert
    await supabase.from('quotation_boms').delete().eq('project_id', projectId);
    if (bomItems.length > 0) {
      await supabase.from('quotation_boms').insert(bomItems);
    }

    await supabase.from('quotation_projects').update({ 
      manufacturer_id: manufacturerId,
      status: 'Priced' 
    }).eq('id', projectId);

    return Response.json({ success: true, matched: matchedCount });

  } catch (err: any) {
    console.error('[Pricing Engine] Critical Failure:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
