import { createServerSupabase } from '@/lib/supabase-server';

export const maxDuration = 120;

/**
 * SMART PRICING ENGINE (v38.0)
 * Enterprise-grade multi-stage fallback matching across global catalog.
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
    
    // FULL CATALOG RETRIEVAL (Recursive pagination to ensure all 50k+ records are loaded)
    let allPricing: any[] = [];
    let from = 0;
    const step = 5000; // Larger chunks for speed
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

    // MULTI-LEVEL LOOKUP MAPS
    const strictMap = new Map<string, any>();
    const globalSkuMap = new Map<string, any>();

    allPricing.forEach(p => {
      const sku = String(p.sku || "").trim().toUpperCase();
      const col = String(p.collection_name || "").trim().toUpperCase();
      const sty = String(p.door_style || "").trim().toUpperCase();
      
      const key = `${sku}|${col}|${sty}`;
      strictMap.set(key, p);

      // Global map prioritized by most descriptive source or highest price (prevents 0 matches)
      if (!globalSkuMap.has(sku)) {
        globalSkuMap.set(sku, p);
      }
    });

    /**
     * SUPER-RESILIENT MATCHER
     * Implementation: Exact -> Compressed -> No BUTT -> No Handing -> Global Fallback
     */
    function findBestMatch(itemCode: string, collection: string, style: string) {
      const target = itemCode.trim().toUpperCase();
      if (!target) return null;

      const col = collection.trim().toUpperCase();
      const sty = style.trim().toUpperCase();

      // 1. EXACT LOCAL MATCH (Best Case)
      const exactKey = `${target}|${col}|${sty}`;
      if (strictMap.has(exactKey)) return { match: strictMap.get(exactKey), type: 'EXACT' };

      // 2. SPACE-INSENSITIVE MATCH (Common for UF items)
      const compressed = target.replace(/\s+/g, '');
      const compressedKey = `${compressed}|${col}|${sty}`;
      if (strictMap.has(compressedKey)) return { match: strictMap.get(compressedKey), type: 'COMPRESSED' };

      // 3. GLOBAL EXACT (Check other sheets/sections for this SKU)
      if (globalSkuMap.has(target)) return { match: globalSkuMap.get(target), type: 'GLOBAL' };
      if (globalSkuMap.has(compressed)) return { match: globalSkuMap.get(compressed), type: 'GLOBAL_COMPRESSED' };

      // 4. STRIP " BUTT" FALLBACK
      const noButt = target.replace(" BUTT", "").trim();
      if (noButt !== target) {
        const key = `${noButt}|${col}|${sty}`;
        if (strictMap.has(key)) return { match: strictMap.get(key), type: 'NO_BUTT' };
        if (globalSkuMap.has(noButt)) return { match: globalSkuMap.get(noButt), type: 'GLOBAL_NO_BUTT' };
      }

      // 5. STRIP HANDING FALLBACK (H, L, R)
      const noHanding = target.replace(/[HLR]$/, "").trim();
      if (noHanding !== target) {
        const key = `${noHanding}|${col}|${sty}`;
        if (strictMap.has(key)) return { match: strictMap.get(key), type: 'NO_HANDING' };
        if (globalSkuMap.has(noHanding)) return { match: globalSkuMap.get(noHanding), type: 'GLOBAL_NO_HANDING' };
      }

      // 6. BASE SKU CLEANING
      const baseSku = target.replace(/ (BUTT|H|L|R)$/, "").replace(/[HLR]$/, "").trim();
      if (baseSku !== target && baseSku.length > 2) {
        const key = `${baseSku}|${col}|${sty}`;
        if (strictMap.has(key)) return { match: strictMap.get(key), type: 'BASE_SKU' };
        if (globalSkuMap.has(baseSku)) return { match: globalSkuMap.get(baseSku), type: 'GLOBAL_BASE' };
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

    // Atomic Update: Clear and Rewrite BOM
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
