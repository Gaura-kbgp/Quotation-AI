import { createServerSupabase } from '@/lib/supabase-server';

export const maxDuration = 60;

/**
 * Aggressive SKU normalization for high-precision matching.
 */
function normalizeSku(sku: string): string {
  if (!sku) return '';
  return String(sku)
    .toUpperCase()
    // Remove anything in {}, [], () which are often estimator notes
    .replace(/\{.*?\}/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    // Remove specific cabinetry keywords and common suffixes used in takeoffs
    .replace(/\s(BUTT|LEFT|RIGHT|DOOR|HINGE|REVERSE|REV)\b/g, '')
    // Strip all non-alphanumeric for final matching
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

/**
 * Intelligent Base SKU identification.
 */
function getBaseSku(sku: string): string {
  const normalized = normalizeSku(sku);
  // Common cabinet suffixes: L (Left), R (Right), RD (Right Door), LD (Left Door), REV (Reverse), REV (Reverse)
  // These are often added in drawings but NOT in price books
  return normalized.replace(/(LD|RD|REV|L|R)$/, '');
}

/**
 * Smart Pricing Engine API.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

    console.log(`[BOM Engine] Initiating pricing for Project: ${projectId}, Manufacturer: ${manufacturerId}`);

    if (!projectId || !manufacturerId) {
      return Response.json({ success: false, error: "Missing required parameters." }, { status: 400 });
    }

    const supabase = createServerSupabase();

    // 1. Fetch project data
    const { data: project, error: pError } = await supabase
      .from('quotation_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (pError || !project) {
      return Response.json({ success: false, error: 'Project record retrieval failed.' }, { status: 404 });
    }

    const rooms = project.extracted_data?.rooms || [];
    
    // 2. Load ALL Manufacturer Specifications
    const { data: allSpecs, error: sError } = await supabase
      .from('manufacturer_specifications')
      .select('*')
      .eq('manufacturer_id', manufacturerId);

    if (sError) {
      console.error('[BOM Engine] Database error during specs fetch:', sError);
      return Response.json({ success: false, error: `Failed to fetch pricing guide from database.` }, { status: 500 });
    }

    console.log(`[BOM Engine] Loaded ${allSpecs?.length || 0} price book entries.`);

    // Pre-process specs into lookup maps
    const exactMap = new Map();
    const collectionMap = new Map();
    const baseModelMap = new Map();
    const globalSkuMap = new Map();

    (allSpecs || []).forEach(spec => {
      const cleanSku = spec.sku; // Already normalized by parser
      const collection = String(spec.collection_name || '').toUpperCase().trim();
      const style = String(spec.door_style || '').toUpperCase().trim();
      const price = Number(spec.price) || 0;

      if (price <= 0) return;

      exactMap.set(`${collection}|${style}|${cleanSku}`, price);
      
      if (!collectionMap.has(`${collection}|${cleanSku}`)) {
        collectionMap.set(`${collection}|${cleanSku}`, price);
      }

      const baseSku = getBaseSku(cleanSku);
      const existingBase = baseModelMap.get(baseSku);
      if (!existingBase || price < existingBase) {
        baseModelMap.set(baseSku, price);
      }

      if (!globalSkuMap.has(cleanSku)) {
        globalSkuMap.set(cleanSku, price);
      }
    });

    // 3. Match each extracted unit
    const bomItems: any[] = [];
    
    for (const room of rooms) {
      const selectedColl = String(room.collection || '').toUpperCase().trim();
      const selectedStyle = String(room.door_style || '').toUpperCase().trim();

      const sections = room.sections || {};
      for (const [sectionName, items] of Object.entries(sections)) {
        const cabinetItems = items as any[];
        for (const cab of cabinetItems) {
          if (!cab.code) continue;

          const rawCode = cab.code;
          const cleanCode = normalizeSku(rawCode);
          const baseCode = getBaseSku(rawCode);

          let price = 0;
          let source = 'NOT_FOUND';

          // Match Pipeline
          const exactKey = `${selectedColl}|${selectedStyle}|${cleanCode}`;
          const collKey = `${selectedColl}|${cleanCode}`;

          if (exactMap.has(exactKey)) {
            price = exactMap.get(exactKey);
            source = 'EXACT_MATCH';
          } else if (collectionMap.has(collKey)) {
            price = collectionMap.get(collKey);
            source = 'PARTIAL_MATCH';
          } else if (baseModelMap.has(baseCode)) {
            price = baseModelMap.get(baseCode);
            source = 'BASE_MODEL_MATCH';
          } else if (globalSkuMap.has(cleanCode)) {
            price = globalSkuMap.get(cleanCode);
            source = 'FALLBACK_COLLECTION_MATCH';
          }

          bomItems.push({
            project_id: projectId,
            sku: rawCode,
            qty: Number(cab.qty) || 1,
            unit_price: price,
            line_total: price * (Number(cab.qty) || 1),
            room: room.room_name,
            collection: room.collection,
            door_style: room.door_style,
            price_source: source,
            created_at: new Date().toISOString()
          });
        }
      }
    }

    // 4. Persistence
    await supabase.from('quotation_boms').delete().eq('project_id', projectId);
    if (bomItems.length > 0) {
      const { error: insertError } = await supabase.from('quotation_boms').insert(bomItems);
      if (insertError) {
        console.error('[BOM Engine] Persistence error:', insertError);
        return Response.json({ success: false, error: 'Failed to save BOM line items.' }, { status: 500 });
      }
    }

    await supabase.from('quotation_projects').update({ 
      manufacturer_id: manufacturerId,
      status: 'Priced' 
    }).eq('id', projectId);

    console.log(`[BOM Engine] Success: Generated ${bomItems.length} line items.`);
    return Response.json({ success: true, count: bomItems.length });

  } catch (err: any) {
    console.error('[BOM Engine] Critical Failure:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
