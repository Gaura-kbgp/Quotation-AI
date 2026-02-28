import { createServerSupabase } from '@/lib/supabase-server';
import { normalizeSku } from '@/lib/utils';

export const maxDuration = 120;

/**
 * ENTERPRISE PRICING ENGINE (v33.1)
 * Optimized for Accessory Sheets and exhaustive global fallback matching.
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
    
    // PAGINATED FETCH: Load the entire manufacturer catalog
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

    console.log(`[Pricing Engine] Loaded ${allPricing.length} records for ${mRes.data?.name}`);

    // Build hierarchical lookup maps
    const pricingMap = new Map<string, any>();
    const globalSkuMap = new Map<string, any>();

    allPricing.forEach(p => {
      const skuKey = String(p.sku || "").toUpperCase().trim();
      const colKey = String(p.collection_name || "").toUpperCase().trim();
      const styKey = String(p.door_style || "").toUpperCase().trim();
      
      // Spec-specific key (Primary)
      const key = `${skuKey}|${colKey}|${styKey}`;
      pricingMap.set(key, p);

      // Global SKU index (Accessory Fallback)
      // We prioritize the most expensive or first found variant for universal items
      if (!globalSkuMap.has(skuKey) || p.price > (globalSkuMap.get(skuKey)?.price || 0)) {
        globalSkuMap.set(skuKey, p);
      }
    });

    const bomItems: any[] = [];
    let matchedCount = 0;

    /**
     * Recursive Matcher with Accessory Fallbacks
     */
    function findBestMatch(cabinetSKU: string, collection: string, style: string) {
      const normalized = cabinetSKU.trim().toUpperCase();
      const col = collection.trim().toUpperCase();
      const st = style.trim().toUpperCase();

      // Fallback Chain
      const noButt = normalized.replace(/\s?BUTT$/i, "").trim();
      const noH = noButt.replace(/H$/, "").trim();
      const cleaned = noH.replace(/ X .*$/, "").trim();

      const variants = [
        { s: normalized, type: 'EXACT' },
        { s: noButt, type: 'FALLBACK_BUTT' },
        { s: noH, type: 'FALLBACK_H' },
        { s: cleaned, type: 'FALLBACK_CLEAN' }
      ];

      // STAGE 1: Check variants within specific room collection
      for (const variant of variants) {
        if (!variant.s) continue;
        const key = `${variant.s}|${col}|${st}`;
        const match = pricingMap.get(key);
        if (match) return { match, type: variant.type };
      }

      // STAGE 2: Global Search (Crucial for Accessory Sheets)
      // Items like UF3, UF342 are often not collection-specific
      for (const variant of variants) {
        if (!variant.s) continue;
        const match = globalSkuMap.get(variant.s);
        if (match) return { match, type: `UNIVERSAL_${variant.type}` };
      }

      return null;
    }

    for (const room of rooms) {
      const selectedCollection = (room.collection || "").trim().toUpperCase();
      const selectedStyle = (room.door_style || "").trim().toUpperCase();
      
      const sections = [
        ...(room.primaryCabinets || []),
        ...(room.otherItems || [])
      ];

      for (const cab of sections) {
        if (!cab.code) continue;
        const result = findBestMatch(cab.code, selectedCollection, selectedStyle);

        if (result) {
          matchedCount++;
          const { match, type } = result;
          const price = Number(match.price) || 0;
          
          bomItems.push({
            project_id: projectId,
            sku: cab.code,
            matched_sku: match.sku,
            qty: Number(cab.qty) || 1,
            unit_price: price,
            line_total: price * (Number(cab.qty) || 1),
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
            sku: cab.code,
            matched_sku: 'SKU not present in pricing guide',
            qty: Number(cab.qty) || 1,
            unit_price: 0,
            line_total: 0,
            room: room.room_name,
            collection: selectedCollection || 'N/A',
            door_style: selectedStyle || 'N/A',
            price_source: 'MISSING',
            precision_level: 'NOT_FOUND',
            created_at: new Date().toISOString()
          });
        }
      }
    }

    // Save Results
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
    console.error('[Pricing Engine] Error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
