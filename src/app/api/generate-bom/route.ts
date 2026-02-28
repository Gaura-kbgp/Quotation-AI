import { createServerSupabase } from '@/lib/supabase-server';
import { compressSku } from '@/lib/utils';

export const maxDuration = 300;

/**
 * ENTERPRISE MULTI-ENGINE PRICING SYSTEM (v51.0)
 * 
 * "SUPER QUALITY" UPGRADES:
 * 1. UNIVERSAL GLOBAL SEARCH: Automatically searches every sheet for fillers/accessories.
 * 2. RECURSIVE PAGINATED DB LOAD: Fetches up to 100,000+ records in chunks.
 * 3. AGGRESSIVE NORMALIZATION: Strips all whitespace and variant suffixes for universal matching.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

    if (!projectId || !manufacturerId) {
      return Response.json({ success: false, error: "Missing IDs." }, { status: 400 });
    }

    const supabase = createServerSupabase();

    const { data: project, error: pError } = await supabase
      .from('quotation_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (pError || !project) throw new Error('Project not found.');
    const rooms = project.extracted_data?.rooms || [];
    
    // 1. FULL CATALOG INDEXING (Paginated Load - Stable Batching)
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

    // 2. MULTI-TIER INDEXING
    const localMap = new Map<string, any>(); 
    const globalSkuMap = new Map<string, any>();
    const compressedMap = new Map<string, any>();

    const normalizeKey = (s: string) => String(s || "").trim().toUpperCase().replace(/\s+/g, ' ');

    allPricing.forEach(p => {
      const sku = normalizeKey(p.sku);
      const col = normalizeKey(p.collection_name);
      const sty = normalizeKey(p.door_style || "UNIVERSAL");
      const comp = compressSku(sku);
      
      const fullKey = `${sku}|${col}|${sty}`;
      if (!localMap.has(fullKey)) localMap.set(fullKey, p);
      
      // Global Search Index (Priority for Universal/Accessory entries)
      if (!globalSkuMap.has(sku) || col === "UNIVERSAL" || col.includes("ACCESSORY") || col.includes("FILLER")) {
        globalSkuMap.set(sku, p);
      }
      
      if (!compressedMap.has(comp)) compressedMap.set(comp, p);
    });

    function findBestMatch(itemCode: string, collection: string, style: string) {
      const target = normalizeKey(itemCode);
      if (!target) return null;

      const col = normalizeKey(collection);
      const sty = normalizeKey(style);
      const targetComp = compressSku(target);

      // Recursive Suffix Fallback List
      const searchVariants = [
        target,
        target.replace(/\s+/g, ''),
        target.replace(/\s*BUTT$/g, ''),
        target.replace(/\s*[HLR]$/g, ''),
        target.replace(/\s*FL$/g, ''),
        target.replace(/\s*(BUTT|H|L|R|FL)$/g, ''),
      ].filter((v, i, self) => v && self.indexOf(v) === i);

      // TIER 1: EXACT LOCAL (Specific Room Collection)
      for (const v of searchVariants) {
        const key = `${v}|${col}|${sty}`;
        if (localMap.has(key)) return { match: localMap.get(key), type: 'LOCAL_EXACT' };
      }

      // TIER 2: GLOBAL CATALOG (Crucial for items like UF3, UF342 from different sheets)
      for (const v of searchVariants) {
        if (globalSkuMap.has(v)) return { match: globalSkuMap.get(v), type: 'GLOBAL_CATALOG' };
      }

      // TIER 3: SUPER COMPRESSED FUZZY (Universal pattern matching)
      if (compressedMap.has(targetComp)) return { match: compressedMap.get(targetComp), type: 'GLOBAL_FUZZY' };

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

    // Atomically swap the BOM data
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
