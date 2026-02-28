import { createServerSupabase } from '@/lib/supabase-server';
import { normalizeSku } from '@/lib/utils';

export const maxDuration = 120;

/**
 * ENTERPRISE PRICING ENGINE (v35.0)
 * Optimized for Accessory Fallbacks and Recursive Suffix Stripping.
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
    
    // PAGINATED FETCH: Load the entire manufacturer catalog without limits
    let allPricing: any[] = [];
    let from = 0;
    const step = 1000;
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

    // Build hierarchical lookup maps using SUPER-COMPRESSED keys
    const pricingMap = new Map<string, any>();
    const globalSkuMap = new Map<string, any>();

    allPricing.forEach(p => {
      const skuKey = normalizeSku(p.sku);
      const colKey = normalizeSku(p.collection_name);
      const styKey = normalizeSku(p.door_style);
      
      const key = `${skuKey}|${colKey}|${styKey}`;
      pricingMap.set(key, p);

      // Global map for accessories that might be in different sheets
      // We prefer non-zero prices if possible
      if (!globalSkuMap.has(skuKey) || (p.price > 0 && globalSkuMap.get(skuKey)?.price === 0)) {
        globalSkuMap.set(skuKey, p);
      }
    });

    const bomItems: any[] = [];
    let matchedCount = 0;

    /**
     * Advanced Recursive Matcher (v35.0)
     * Handles Handing (L/R/H), BUTT, and Dimensional Suffixes (DP/FL).
     */
    function findBestMatch(cabinetSKU: string, collection: string, style: string) {
      const normalized = normalizeSku(cabinetSKU);
      if (!normalized) return null;

      const col = normalizeSku(collection);
      const st = normalizeSku(style);

      // Generate variant chain for recursive checking
      const variants = [
        { s: normalized, type: 'EXACT' },
        { s: normalized.replace(/BUTT$/, ""), type: 'NO_BUTT' },
        { s: normalized.replace(/[LRH]$/, ""), type: 'NO_HANDING' },
        { s: normalized.replace(/(BUTT|[LRH])$/, ""), type: 'NO_VARIANT' },
        { s: normalized.replace(/FL$/, ""), type: 'NO_FL_SUFFIX' },
        { s: normalized.replace(/DP$/, ""), type: 'NO_DP_SUFFIX' },
        // Architectural specific: strip all trailing letters after numbers
        { s: normalized.replace(/^([A-Z]+[0-9]+)[A-Z]+$/, "$1"), type: 'BASE_SKU' },
        { s: normalized.replace(/(\d+)[A-Z]+$/, "$1"), type: 'BASE_MODEL' }
      ];

      // STAGE 1: Try exact collection/style match with all variants
      for (const variant of variants) {
        if (!variant.s) continue;
        const key = `${variant.s}|${col}|${st}`;
        const match = pricingMap.get(key);
        if (match) return { match, type: variant.type };
      }

      // STAGE 2: Global catalog match (Universal accessories/fillers/accessories)
      for (const variant of variants) {
        if (!variant.s) continue;
        const match = globalSkuMap.get(variant.s);
        if (match) return { match, type: `GLOBAL_${variant.type}` };
      }

      return null;
    }

    for (const room of rooms) {
      const collection = room.collection || "";
      const style = room.door_style || "";
      
      const allItems = [
        ...(room.primaryCabinets || []),
        ...(room.otherItems || [])
      ];

      for (const item of allItems) {
        if (!item.code) continue;
        const result = findBestMatch(item.code, collection, style);

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
            collection: collection || 'N/A',
            door_style: style || 'N/A',
            price_source: 'MISSING',
            precision_level: 'NOT_FOUND',
            created_at: new Date().toISOString()
          });
        }
      }
    }

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