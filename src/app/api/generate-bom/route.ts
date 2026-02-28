import { createServerSupabase } from '@/lib/supabase-server';

export const maxDuration = 120;

/**
 * SMART PRICING ENGINE (v37.0)
 * Implements Multi-Stage Fallback Matching across all sheets.
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
    
    // Fetch entire manufacturer pricing catalog with pagination
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

    // Build indexing maps for high-speed lookup
    const strictMap = new Map<string, any>();
    const globalSkuMap = new Map<string, any>();

    allPricing.forEach(p => {
      const sku = String(p.sku || "").trim().toUpperCase();
      const col = String(p.collection_name || "").trim().toUpperCase();
      const sty = String(p.door_style || "").trim().toUpperCase();
      
      const key = `${sku}|${col}|${sty}`;
      strictMap.set(key, p);

      // Global map keeps the most descriptive or highest priced entry as a baseline
      if (!globalSkuMap.has(sku) || (p.price > 0 && globalSkuMap.get(sku)?.price === 0)) {
        globalSkuMap.set(sku, p);
      }
    });

    /**
     * SMART FALLBACK MATCHER
     * Exact -> No BUTT -> No Handing -> Base
     */
    function findBestMatch(itemCode: string, collection: string, style: string) {
      const target = itemCode.trim().toUpperCase();
      if (!target) return null;

      const col = collection.trim().toUpperCase();
      const sty = style.trim().toUpperCase();

      // 1. EXACT MATCH in specific spec
      const exactKey = `${target}|${col}|${sty}`;
      if (strictMap.has(exactKey)) {
        return { match: strictMap.get(exactKey), type: 'EXACT' };
      }

      // 2. GLOBAL EXACT MATCH (Accessories/Fillers found on any sheet)
      if (globalSkuMap.has(target)) {
        return { match: globalSkuMap.get(target), type: 'GLOBAL' };
      }

      // 3. REMOVE " BUTT" FALLBACK
      const noButt = target.replace(" BUTT", "").trim();
      if (noButt !== target) {
        const key = `${noButt}|${col}|${sty}`;
        if (strictMap.has(key)) return { match: strictMap.get(key), type: 'NO_BUTT' };
        if (globalSkuMap.has(noButt)) return { match: globalSkuMap.get(noButt), type: 'GLOBAL_NO_BUTT' };
      }

      // 4. REMOVE HANDEDNESS FALLBACK (H, L, R)
      const noHanding = target.replace(/[HLR]$/, "").trim();
      if (noHanding !== target) {
        const key = `${noHanding}|${col}|${sty}`;
        if (strictMap.has(key)) return { match: strictMap.get(key), type: 'NO_HANDING' };
        if (globalSkuMap.has(noHanding)) return { match: globalSkuMap.get(noHanding), type: 'GLOBAL_NO_HANDING' };
      }

      // 5. AGGRESSIVE CLEAN (BUTT + HANDING)
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

    // Insert results
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