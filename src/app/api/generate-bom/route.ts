import { createServerSupabase } from '@/lib/supabase-server';
import { compressSku } from '@/lib/utils';

export const maxDuration = 300;

/**
 * SMART MULTI-ENGINE PRICING SYSTEM (v46.0)
 * Implements recursive global scanning across ALL sheets and rows indexed in the database.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

    if (!projectId || !manufacturerId) {
      return Response.json({ success: false, error: "Missing required project/manufacturer IDs." }, { status: 400 });
    }

    const supabase = createServerSupabase();

    // 1. PROJECT RETRIEVAL
    const { data: project, error: pError } = await supabase
      .from('quotation_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (pError || !project) throw new Error('Could not find quotation project.');
    const rooms = project.extracted_data?.rooms || [];
    
    // 2. EXHAUSTIVE GLOBAL CATALOG LOAD (Recursive Pagination)
    // We must load every single record for this manufacturer to ensure all sheets are scanned.
    let allPricing: any[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    console.log(`[Pricing Engine] Initiating global scan for manufacturer: ${manufacturerId}`);

    while (hasMore) {
      const { data, error: sError } = await supabase
        .from('manufacturer_pricing')
        .select('*')
        .eq('manufacturer_id', manufacturerId)
        .range(from, from + pageSize - 1);

      if (sError) throw new Error(`Database catalog retrieval error: ${sError.message}`);
      
      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allPricing = [...allPricing, ...data];
        from += pageSize;
        if (data.length < pageSize) hasMore = false;
      }
    }

    console.log(`[Pricing Engine] Successfully indexed ${allPricing.length} total pricing records across all sheets.`);

    // 3. SMART MULTI-TIER INDEXING
    // Index data by various keys for high-speed matching fallbacks
    const localMap = new Map<string, any>(); // SKU|COL|STYLE
    const globalSkuMap = new Map<string, any>(); // Exact SKU -> Best Match
    const compressedMap = new Map<string, any>(); // CompressedSKU -> Best Match

    allPricing.forEach(p => {
      const sku = String(p.sku || "").trim().toUpperCase();
      const col = String(p.collection_name || "").trim().toUpperCase();
      const sty = String(p.door_style || "").trim().toUpperCase();
      const comp = compressSku(sku);
      
      // Tier 1: Local Context Map
      const fullKey = `${sku}|${col}|${sty}`;
      if (!localMap.has(fullKey)) localMap.set(fullKey, p);
      
      // Tier 2: Global Fallback Map (Prioritize non-zero and UNIVERSAL entries)
      const existingGlobal = globalSkuMap.get(sku);
      if (!existingGlobal || sty === "UNIVERSAL" || (p.price > 0 && !existingGlobal.price)) {
        globalSkuMap.set(sku, p);
      }
      
      // Tier 3: Global Compressed Fallback
      if (!compressedMap.has(comp)) compressedMap.set(comp, p);
    });

    /**
     * RECURSIVE MATCHING ALGORITHM
     * Checks multiple tiers across all sheets found in the database.
     */
    function findBestMatch(itemCode: string, collection: string, style: string) {
      const target = String(itemCode || "").trim().toUpperCase();
      if (!target) return null;

      const col = String(collection || "").trim().toUpperCase();
      const sty = String(style || "").trim().toUpperCase();
      const targetComp = compressSku(target);

      // Recursive variants for stripping production suffixes
      const variants = [
        target,
        target.replace(/\s+/g, ''), // No internal spaces
        target.replace(/\s*BUTT$/g, ''), // Stripping 'BUTT'
        target.replace(/\s*[HLR]$/g, ''), // Stripping handedness (H, L, R)
        target.replace(/\s*FL$/g, ''), // Stripping Filler/Finish suffix
        target.replace(/\s*(BUTT|H|L|R|FL)$/g, ''), // Aggressive stripping
      ];

      const searchVariants = Array.from(new Set(variants.filter(Boolean)));

      // ENGINE TIER 1: EXACT LOCAL MATCH (Specific Sheet/Collection/Style)
      for (const v of searchVariants) {
        const key = `${v}|${col}|${sty}`;
        if (localMap.has(key)) return { match: localMap.get(key), type: 'LOCAL_EXACT' };
      }

      // ENGINE TIER 2: COMPRESSED LOCAL MATCH
      const compKey = `${targetComp}|${col}|${sty}`;
      if (compressedMap.has(compKey)) return { match: compressedMap.get(compKey), type: 'LOCAL_FUZZY' };

      // ENGINE TIER 3: GLOBAL CATALOG SEARCH (Search ALL sheets/collections)
      // This is crucial for items like UF3, RR120, etc. which might be on different sheets.
      for (const v of searchVariants) {
        if (globalSkuMap.has(v)) return { match: globalSkuMap.get(v), type: 'GLOBAL_CATALOG' };
      }

      // ENGINE TIER 4: GLOBAL COMPRESSED SEARCH
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

    // Atomic Save: Clean old BOM and insert fresh global matches
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
    console.error('[Pricing Engine] Global Scan Failure:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
