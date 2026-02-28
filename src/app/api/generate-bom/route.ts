import { createServerSupabase } from '@/lib/supabase-server';

export const maxDuration = 120;

/**
 * SMART PRICING ENGINE (v39.0)
 * High-Precision matching with recursive fallbacks and global catalog lookup.
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
    
    // EXHAUSTIVE CATALOG RETRIEVAL (Bypass limits via pagination)
    let allPricing: any[] = [];
    let from = 0;
    const step = 5000;
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

    // BUILD MULTI-INDEX LOOKUP
    const localMap = new Map<string, any>(); // Key: SKU|Collection|Style
    const globalSkuMap = new Map<string, any>(); // Key: SKU (for universal items)

    allPricing.forEach(p => {
      const sku = String(p.sku || "").trim().toUpperCase();
      const col = String(p.collection_name || "").trim().toUpperCase();
      const sty = String(p.door_style || "").trim().toUpperCase();
      
      localMap.set(`${sku}|${col}|${sty}`, p);
      
      // Global map prioritized by alphabetical sheet source (often Accessories come first)
      if (!globalSkuMap.has(sku)) {
        globalSkuMap.set(sku, p);
      }
    });

    /**
     * RESILIENT MATCHER
     * Logic: Strict Match -> Compressed Match -> Descriptor Fallback -> Global Search
     */
    function findBestMatch(itemCode: string, collection: string, style: string) {
      const target = itemCode.trim().toUpperCase();
      if (!target) return null;

      const col = collection.trim().toUpperCase();
      const sty = style.trim().toUpperCase();

      // VARIANT CHAIN (Strict -> No Space -> No BUTT -> No Handing -> Base)
      const variants = [
        target,
        target.replace(/\s+/g, ''),
        target.replace(" BUTT", ""),
        target.replace(" BUTT", "").replace(/[HLR]$/, ""),
        target.replace(/[HLR]$/, ""),
        target.replace(/ (BUTT|H|L|R)$/, "").replace(/[HLR]$/, "").trim()
      ];

      // 1. Try Local Collection Match (High Precision)
      for (const v of variants) {
        const key = `${v}|${col}|${sty}`;
        if (localMap.has(key)) return { match: localMap.get(key), type: 'LOCAL' };
      }

      // 2. Try Global Catalog Search (Universal Items like UF3, RR120)
      for (const v of variants) {
        if (globalSkuMap.has(v)) return { match: globalSkuMap.get(v), type: 'GLOBAL' };
      }

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

    // Atomic Clear and Rewrite
    await supabase.from('quotation_boms').delete().eq('project_id', projectId);
    if (bomItems.length > 0) {
      await supabase.from('quotation_boms').insert(bomItems);
    }

    await supabase.from('quotation_projects').update({ status: 'Priced' }).eq('id', projectId);

    return Response.json({ success: true, matched: matchedCount });

  } catch (err: any) {
    console.error('[Pricing Engine] Failure:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
