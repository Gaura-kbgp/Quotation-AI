import { createServerSupabase } from '@/lib/supabase-server';
import { normalizeSku } from '@/lib/utils';

export const maxDuration = 120;

/**
 * STRICT EXACT PRICING ENGINE (v30.0)
 * Implements "Match EXACT SKU" rule across all catalog sheets.
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
    
    // Fetch ALL pricing records for this manufacturer (Global Multi-Sheet Scan Result)
    const { data: allPricing, error: sError } = await supabase
      .from('manufacturer_pricing')
      .select('*')
      .eq('manufacturer_id', manufacturerId);

    if (sError) throw new Error(`Database error: ${sError.message}`);

    // Build EXACT lookup map for performance
    const pricingMap = new Map<string, any>();
    allPricing?.forEach(p => {
      // Key: SKU (Exact) | COLLECTION | STYLE
      const key = `${p.sku.toUpperCase().trim()}|${String(p.collection_name || "").toUpperCase().trim()}|${String(p.door_style || "").toUpperCase().trim()}`;
      pricingMap.set(key, p);
    });

    const bomItems: any[] = [];
    let matchedCount = 0;
    let totalCount = 0;

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

        const pdfSku = cab.code.toUpperCase().trim();
        const lookupKey = `${pdfSku}|${selectedCollection}|${selectedStyle}`;
        
        let match = pricingMap.get(lookupKey);
        let matchType = 'EXACT';

        // GLOBAL FALLBACK (Strict SKU match across any collection if exact spec lookup fails)
        if (!match && allPricing) {
           match = allPricing.find(p => p.sku.toUpperCase().trim() === pdfSku);
           if (match) matchType = 'GLOBAL_EXACT';
        }

        if (match) {
          matchedCount++;
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
            price_source: `Guide (${matchType})`,
            precision_level: matchType,
            created_at: new Date().toISOString()
          });
        } else {
          // NO MATCH FOUND - Surfacing descriptive error
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

    // Persist Results
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
