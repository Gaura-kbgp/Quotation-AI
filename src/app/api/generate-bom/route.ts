import { createServerSupabase } from '@/lib/supabase-server';
import { compressSku } from '@/lib/utils';

export const maxDuration = 300;

/**
 * ENTERPRISE MULTI-ENGINE PRICING SYSTEM (v47.0)
 * Implements recursive global scanning across ALL sheets and sheets indexed in the database.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

    if (!projectId || !manufacturerId) {
      return Response.json({ success: false, error: "Missing IDs." }, { status: 400 });
    }

    const supabase = createServerSupabase();

    // 1. FETCH PROJECT
    const { data: project, error: pError } = await supabase
      .from('quotation_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (pError || !project) throw new Error('Project not found.');
    const rooms = project.extracted_data?.rooms || [];
    
    // 2. PAGINATED GLOBAL CATALOG LOAD
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

    // 3. MULTI-TIER INDEXING
    const localMap = new Map<string, any>(); // SKU|COL|STYLE
    const globalSkuMap = new Map<string, any>(); // Exact SKU
    const compressedMap = new Map<string, any>(); // Compressed SKU

    const normalizeHeader = (s: string) => String(s || "").trim().toUpperCase().split('(')[0].trim();

    allPricing.forEach(p => {
      const sku = String(p.sku || "").trim().toUpperCase();
      const col = normalizeHeader(p.collection_name);
      const sty = normalizeHeader(p.door_style);
      const comp = compressSku(sku);
      
      const fullKey = `${sku}|${col}|${sty}`;
      if (!localMap.has(fullKey)) localMap.set(fullKey, p);
      
      // Index for global fallback
      if (!globalSkuMap.has(sku) || sty === "UNIVERSAL") {
        globalSkuMap.set(sku, p);
      }
      
      if (!compressedMap.has(comp)) compressedMap.set(comp, p);
    });

    /**
     * RECURSIVE MATCHING ALGORITHM
     */
    function findBestMatch(itemCode: string, collection: string, style: string) {
      const target = String(itemCode || "").trim().toUpperCase();
      if (!target) return null;

      const col = normalizeHeader(collection);
      const sty = normalizeHeader(style);
      const targetComp = compressSku(target);

      // Search Variants
      const variants = [
        target,
        target.replace(/\s+/g, ''),
        target.replace(/\s*BUTT$/g, ''),
        target.replace(/\s*[HLR]$/g, ''),
        target.replace(/\s*FL$/g, ''),
        target.replace(/\s*(BUTT|H|L|R|FL)$/g, ''),
      ];

      const searchVariants = Array.from(new Set(variants.filter(Boolean)));

      // TIER 1: EXACT LOCAL
      for (const v of searchVariants) {
        const key = `${v}|${col}|${sty}`;
        if (localMap.has(key)) return { match: localMap.get(key), type: 'LOCAL_EXACT' };
      }

      // TIER 2: GLOBAL CATALOG (All Sheets)
      // This is crucial for items like UF3, RR120, etc. which might be on different sheets.
      for (const v of searchVariants) {
        if (globalSkuMap.has(v)) return { match: globalSkuMap.get(v), type: 'GLOBAL_CATALOG' };
      }

      // TIER 3: COMPRESSED FUZZY
      if (compressedMap.has(targetComp)) return { match: compressedMap.get(targetComp), type: 'GLOBAL_FUZZY' };

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

    // Atomic Update
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
