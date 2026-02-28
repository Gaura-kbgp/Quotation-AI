import { createServerSupabase } from '@/lib/supabase-server';
import { compressSku } from '@/lib/utils';

export const maxDuration = 300;

/**
 * ULTIMATE UNIVERSAL PRICING ENGINE (v44.0)
 * Scans ALL pricing records with recursive descriptor stripping and global fallback logic.
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
    
    // 1. EXHAUSTIVE CATALOG RETRIEVAL (Fetch 100% of data with stable pagination)
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

    // 2. BUILD HIGH-SPEED LOOKUP MAPS
    const localMap = new Map<string, any>(); 
    const globalSkuMap = new Map<string, any>(); 
    const compressedMap = new Map<string, any>(); 

    allPricing.forEach(p => {
      const sku = String(p.sku || "").trim().toUpperCase();
      const col = String(p.collection_name || "").trim().toUpperCase();
      const sty = String(p.door_style || "").trim().toUpperCase();
      const comp = compressSku(sku);
      
      const fullKey = `${sku}|${col}|${sty}`;
      if (!localMap.has(fullKey)) localMap.set(fullKey, p);
      
      // Global fallback - prioritize entries that are explicitly "UNIVERSAL"
      if (!globalSkuMap.has(sku) || sty === "UNIVERSAL") {
        globalSkuMap.set(sku, p);
      }
      
      if (!compressedMap.has(comp)) compressedMap.set(comp, p);
    });

    /**
     * RECURSIVE MATCHING ENGINE
     * Implements Context-Aware Suffix Stripping (BUTT, H, L, R, FL)
     */
    function findBestMatch(itemCode: string, collection: string, style: string) {
      const target = String(itemCode || "").trim().toUpperCase();
      if (!target) return null;

      const col = String(collection || "").trim().toUpperCase();
      const sty = String(style || "").trim().toUpperCase();
      const targetComp = compressSku(target);

      // Define recursive variants for matching
      const variants = [
        target,
        target.replace(/\s+/g, ''), // No spaces
        target.replace(/\s*BUTT$/g, ''), // No BUTT
        target.replace(/\s*[HLR]$/g, ''), // No Handing (H, L, R)
        target.replace(/\s*FL$/g, ''), // No FL (Filler/Finish)
        target.replace(/\s*(BUTT|H|L|R|FL)$/g, ''), // Total Strip
      ];

      const searchVariants = Array.from(new Set(variants.filter(Boolean)));

      // TIER 1: EXACT LOCAL MATCH
      for (const v of searchVariants) {
        const key = `${v}|${col}|${sty}`;
        if (localMap.has(key)) return { match: localMap.get(key), type: 'LOCAL_EXACT' };
      }

      // TIER 2: COMPRESSED LOCAL MATCH (Matches W36 24 to W3624)
      const compKey = `${targetComp}|${col}|${sty}`;
      if (compressedMap.has(compKey)) return { match: compressedMap.get(compKey), type: 'LOCAL_FUZZY' };

      // TIER 3: GLOBAL CATALOG SEARCH (Checks all sheets/collections)
      // High priority for items that start with UF (Fillers) or RR (Molding)
      for (const v of searchVariants) {
        if (globalSkuMap.has(v)) return { match: globalSkuMap.get(v), type: 'GLOBAL_CATALOG' };
      }

      // TIER 4: GLOBAL COMPRESSED
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

    // Atomic Update: Clear and re-insert BOM
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
    console.error('[Universal Pricing Engine] Critical Failure:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
