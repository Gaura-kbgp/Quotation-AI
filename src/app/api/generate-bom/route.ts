import { createServerSupabase } from '@/lib/supabase-server';
import { normalizeSku, calculateSimilarity, getBaseSku } from '@/lib/utils';

export const maxDuration = 120;

/**
 * SMART PRICING ENGINE (v28.0)
 * Implements full-catalog lookup and recursive matching.
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
    
    // Fetch ALL pricing records for this manufacturer across all sheets
    const { data: allPricing, error: sError } = await supabase
      .from('manufacturer_pricing')
      .select('*')
      .eq('manufacturer_id', manufacturerId);

    if (sError) throw new Error(`Database error: ${sError.message}`);

    // Build Global SKU -> Price Map for O(1) matching
    const pricingMap = new Map<string, any>();
    allPricing?.forEach(p => {
      const key = `${normalizeSku(p.sku)}|${String(p.collection_name || "").toUpperCase()}|${String(p.door_style || "").toUpperCase()}`;
      pricingMap.set(key, p);
    });

    const bomItems: any[] = [];
    let matchedCount = 0;
    let totalCount = 0;

    for (const room of rooms) {
      const selectedCollection = (room.collection || "").trim().toUpperCase();
      const selectedStyle = (room.door_style || "").trim().toUpperCase();
      const sections = {
        'Wall Cabinets': room.primaryCabinets || [],
        'Other Items': room.otherItems || []
      };

      for (const [sectionName, items] of Object.entries(sections)) {
        const cabinetItems = items as any[];
        for (const cab of cabinetItems) {
          if (!cab.code) continue;
          totalCount++;

          const rawInput = String(cab.code).trim();
          const normInput = normalizeSku(rawInput);
          const baseInput = getBaseSku(rawInput);
          
          let match = null;
          let matchType = 'NOT_FOUND';

          // 1. Target Specification Match (Exact)
          const specKey = `${normInput}|${selectedCollection}|${selectedStyle}`;
          match = pricingMap.get(specKey);
          
          if (match) {
            matchType = 'EXACT_SPEC';
          } else {
            // 2. Target Specification Match (Base SKU)
            const baseSpecKey = `${baseInput}|${selectedCollection}|${selectedStyle}`;
            match = pricingMap.get(baseSpecKey);
            if (match) matchType = 'BASE_SPEC';
          }

          // 3. Global Fallback (Entire Catalog Search)
          if (!match && allPricing) {
             match = allPricing.find(p => normalizeSku(p.sku) === normInput);
             if (match) {
               matchType = 'GLOBAL_EXACT';
             } else {
               match = allPricing.find(p => normalizeSku(p.sku) === baseInput);
               if (match) matchType = 'GLOBAL_BASE';
             }
          }

          if (match) {
            matchedCount++;
            const price = Number(match.price) || 0;
            
            bomItems.push({
              project_id: projectId,
              sku: rawInput,
              matched_sku: match.sku,
              qty: Number(cab.qty) || 1,
              unit_price: price,
              line_total: price * (Number(cab.qty) || 1),
              room: room.room_name,
              collection: room.collection || match.collection_name,
              door_style: room.door_style || match.door_style,
              price_source: `Catalog (${matchType})`,
              precision_level: matchType,
              created_at: new Date().toISOString()
            });
          } else {
            // Price Not Found
            bomItems.push({
              project_id: projectId,
              sku: rawInput,
              matched_sku: 'PRICE NOT FOUND',
              qty: Number(cab.qty) || 1,
              unit_price: 0,
              line_total: 0,
              room: room.room_name,
              collection: room.collection || 'N/A',
              door_style: room.door_style || 'N/A',
              price_source: 'MISSING',
              precision_level: 'NOT_FOUND',
              created_at: new Date().toISOString()
            });
          }
        }
      }
    }

    // Persist Results
    await supabase.from('quotation_boms').delete().eq('project_id', projectId);
    if (bomItems.length > 0) {
      await supabase.from('quotation_boms').insert(bomItems);
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
