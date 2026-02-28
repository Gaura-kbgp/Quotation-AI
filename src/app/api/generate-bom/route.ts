import { createServerSupabase } from '@/lib/supabase-server';
import { normalizeSku } from '@/lib/utils';

export const maxDuration = 120;

/**
 * ENTERPRISE PRICING ENGINE (v33.0)
 * Implements recursive multi-stage fallback matching and paginated data fetching.
 * Fixes the 1000-record limit issue for large catalogs.
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
    
    // PAGINATED FETCH: Supabase defaults to 1000 records. 
    // We must fetch ALL pricing records for this manufacturer recursively.
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

    console.log(`[Pricing Engine] Loaded ${allPricing.length} price points for lookup.`);

    // Build hierarchical lookup maps for performance
    const pricingMap = new Map<string, any>();
    const globalSkuMap = new Map<string, any>();

    allPricing.forEach(p => {
      const skuKey = String(p.sku || "").toUpperCase().trim();
      const colKey = String(p.collection_name || "").toUpperCase().trim();
      const styKey = String(p.door_style || "").toUpperCase().trim();
      
      // Spec-specific key (Primary)
      const key = `${skuKey}|${colKey}|${styKey}`;
      pricingMap.set(key, p);

      // Global SKU index (Fallback - first occurrence wins)
      if (!globalSkuMap.has(skuKey)) {
        globalSkuMap.set(skuKey, p);
      }
    });

    const bomItems: any[] = [];
    let matchedCount = 0;
    let totalCount = 0;

    /**
     * Recursive Matcher with Deep Fallbacks
     */
    function findBestMatch(cabinetSKU: string, collection: string, style: string) {
      const normalized = cabinetSKU.trim().toUpperCase();
      const col = collection.trim().toUpperCase();
      const st = style.trim().toUpperCase();

      // Define Fallback Chain
      const noButt = normalized.replace(/\s?BUTT$/i, "").trim();
      const noH = noButt.replace(/H$/, "").trim();
      const cleaned = noH.replace(/ X .*$/, "").trim();

      const variants = [
        { s: normalized, type: 'EXACT' },
        { s: noButt, type: 'FALLBACK_BUTT' },
        { s: noH, type: 'FALLBACK_H' },
        { s: cleaned, type: 'FALLBACK_CLEAN' }
      ];

      // STAGE 1: Check variants within the specific selected room spec
      for (const variant of variants) {
        if (!variant.s) continue;
        const key = `${variant.s}|${col}|${st}`;
        const match = pricingMap.get(key);
        if (match) return { match, type: variant.type };
      }

      // STAGE 2: Global Fallback Search (Across all collections)
      for (const variant of variants) {
        if (!variant.s) continue;
        const match = globalSkuMap.get(variant.s);
        if (match) return { match, type: `GLOBAL_${variant.type}` };
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
        totalCount++;

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

    // Purge old BOM and save new results
    await supabase.from('quotation_boms').delete().eq('project_id', projectId);
    if (bomItems.length > 0) {
      const { error: insertError } = await supabase.from('quotation_boms').insert(bomItems);
      if (insertError) throw insertError;
    }

    await supabase.from('quotation_projects').update({ 
      manufacturer_id: manufacturerId,
      status: 'Priced' 
    }).eq('id', projectId);

    return Response.json({ success: true, matched: matchedCount, total: totalCount });

  } catch (err: any) {
    console.error('[Pricing Engine] Error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
