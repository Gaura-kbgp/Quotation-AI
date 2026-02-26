import { createServerSupabase } from '@/lib/supabase-server';

export const maxDuration = 60;

/**
 * Aggressive SKU normalization for high-precision matching.
 * Handles suffixes, special chars, and cabinetry-specific notations.
 */
function normalizeSku(sku: string): string {
  if (!sku) return '';
  return String(sku)
    .toUpperCase()
    // Remove anything in {}, [], () which are often estimator notes like {R}
    .replace(/\{.*?\}/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    // Remove specific cabinetry keywords that are often in takeoffs but not price books
    .replace(/\s(BUTT|LEFT|RIGHT|DOOR|HINGE)\b/g, '')
    // Finally strip all non-alphanumeric
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

/**
 * Intelligent Base SKU identification.
 * Strips common suffixes used in takeoffs to find the core cabinet model.
 */
function getBaseSku(sku: string): string {
  const normalized = normalizeSku(sku);
  // Common cabinet suffixes: L (Left), R (Right), RD (Right Door), LD (Left Door), REV (Reverse)
  // We remove these from the END of the string
  return normalized.replace(/(LD|RD|REV|L|R)$/, '');
}

/**
 * Smart Pricing Engine API.
 * Uses multi-layered heuristic matching to find prices in messy architectural takeoffs.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

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
      return Response.json({ success: false, error: 'Project not found.' }, { status: 404 });
    }

    const rooms = project.extracted_data?.rooms || [];
    
    // 2. Load ALL Manufacturer Specifications for ultra-fast memory-cached matching
    const { data: allSpecs, error: sError } = await supabase
      .from('manufacturer_specifications')
      .select('*')
      .eq('manufacturer_id', manufacturerId);

    if (sError) {
      return Response.json({ success: false, error: `Database error: ${sError.message}` }, { status: 500 });
    }

    // Pre-process specs into lookup maps for Level 1-4 matching
    const exactMap = new Map(); // collection|style|sku
    const collectionMap = new Map(); // collection|sku
    const baseModelMap = new Map(); // sku (cheapest)
    const globalSkuMap = new Map(); // sku (fallback)

    (allSpecs || []).forEach(spec => {
      const cleanSku = spec.sku; // Already normalized by parser
      const baseSku = getBaseSku(cleanSku);
      const collection = String(spec.collection_name || '').toUpperCase();
      const style = String(spec.door_style || '').toUpperCase();
      const price = Number(spec.price) || 0;

      if (price <= 0) return;

      exactMap.set(`${collection}|${style}|${cleanSku}`, price);
      
      // For collection map, if multiple styles have different prices, we take the average or first? 
      // We'll store an array and take the first for now.
      if (!collectionMap.has(`${collection}|${cleanSku}`)) {
        collectionMap.set(`${collection}|${cleanSku}`, price);
      }

      // Base model: track the minimum price for this base SKU
      const existingBase = baseModelMap.get(baseSku);
      if (!existingBase || price < existingBase) {
        baseModelMap.set(baseSku, price);
      }

      // Global: first price found for this SKU
      if (!globalSkuMap.has(cleanSku)) {
        globalSkuMap.set(cleanSku, price);
      }
    });

    // 3. Match each extracted unit
    const bomItems: any[] = [];
    
    for (const room of rooms) {
      const selectedColl = String(room.collection || '').toUpperCase();
      const selectedStyle = String(room.door_style || '').toUpperCase();

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

          // LAYER 1: EXACT MATCH (Collection + Style + SKU)
          const exactKey = `${selectedColl}|${selectedStyle}|${cleanCode}`;
          if (exactMap.has(exactKey)) {
            price = exactMap.get(exactKey);
            source = 'EXACT_MATCH';
          } 
          // LAYER 2: COLLECTION MATCH (Collection + SKU)
          else if (collectionMap.has(`${selectedColl}|${cleanCode}`)) {
            price = collectionMap.get(`${selectedColl}|${cleanCode}`);
            source = 'PARTIAL_MATCH';
          }
          // LAYER 3: BASE SKU MATCH (Strips L/R/RD/LD)
          else if (baseModelMap.has(baseCode)) {
            price = baseModelMap.get(baseCode);
            source = 'BASE_MODEL_MATCH';
          }
          // LAYER 4: GLOBAL SEARCH (Find SKU in any other collection)
          else if (globalSkuMap.has(cleanCode)) {
            price = globalSkuMap.get(cleanCode);
            source = 'FALLBACK_COLLECTION_MATCH';
          }

          bomItems.push({
            project_id: projectId,
            sku: rawCode,
            qty: cab.qty || 1,
            unit_price: price,
            line_total: price * (cab.qty || 1),
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
      if (insertError) throw insertError;
    }

    await supabase.from('quotation_projects').update({ 
      manufacturer_id: manufacturerId,
      status: 'Priced' 
    }).eq('id', projectId);

    return Response.json({ success: true, count: bomItems.length });

  } catch (err: any) {
    console.error('[BOM Engine Error]:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
