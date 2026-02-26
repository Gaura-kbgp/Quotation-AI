
import { createServerSupabase } from '@/lib/supabase-server';

export const maxDuration = 60;

/**
 * Aggressive SKU normalization for matching.
 * Strips all non-alphanumeric characters.
 */
function normalizeSku(sku: string): string {
  return String(sku || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Strips cabinet suffixes to find base models.
 * Example: B24L -> B24, W3042RD -> W3042
 */
function getBaseSku(sku: string): string {
  const normalized = normalizeSku(sku);
  // Common cabinet suffixes: L (Left), R (Right), RD (Right Door), LD (Left Door)
  return normalized.replace(/(LD|RD|L|R)$/, '');
}

/**
 * Smart Pricing Engine API.
 * Implements multi-level matching logic for architectural takeoffs.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

    console.log(`[BOM API] Initiating Smart Pricing for Project: ${projectId}`);
    
    if (!projectId || !manufacturerId) {
      return Response.json({ 
        success: false, 
        error: "Missing required project or manufacturer parameters." 
      }, { status: 400 });
    }

    const supabase = createServerSupabase();

    // 1. Fetch project data
    const { data: project, error: pError } = await supabase
      .from('quotation_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (pError || !project) {
      console.error('[BOM API] Project fetch error:', pError);
      return Response.json({ success: false, error: 'Project not found.' }, { status: 404 });
    }

    const rooms = project.extracted_data?.rooms || [];
    if (rooms.length === 0) {
      return Response.json({ success: false, error: 'No takeoff data found in project. Please review the extraction.' }, { status: 400 });
    }

    // 2. Load ALL Manufacturer Specifications for memory-cached matching
    // We select all columns to be resilient to schema variations (price vs unit_price)
    const { data: allSpecs, error: sError } = await supabase
      .from('manufacturer_specifications')
      .select('*')
      .eq('manufacturer_id', manufacturerId);

    if (sError) {
      console.error('[BOM API] Database error during specifications fetch:', sError);
      return Response.json({ 
        success: false, 
        error: `Database error during pricing fetch: ${sError.message}` 
      }, { status: 500 });
    }

    console.log(`[BOM API] Loaded ${(allSpecs || []).length} specification records.`);

    // Create lookup maps for different matching levels
    const exactMap = new Map(); // Key: Collection|Style|SKU
    const collectionMap = new Map(); // Key: Collection|SKU
    const baseModelMap = new Map(); // Key: BaseSKU (best price found)
    const globalSkuMap = new Map(); // Key: SKU (any collection)

    (allSpecs || []).forEach(spec => {
      const cleanSku = normalizeSku(spec.sku);
      const baseSku = getBaseSku(spec.sku);
      const collection = String(spec.collection_name || '').toUpperCase();
      const style = String(spec.door_style || '').toUpperCase();
      
      // Handle schema variation for price/unit_price
      const price = spec.price !== undefined ? spec.price : (spec.unit_price || 0);

      exactMap.set(`${collection}|${style}|${cleanSku}`, price);
      collectionMap.set(`${collection}|${cleanSku}`, price);
      
      // For base model, keep the lowest valid price
      const existingBase = baseModelMap.get(baseSku);
      if (!existingBase || price < existingBase) {
        baseModelMap.set(baseSku, price);
      }

      globalSkuMap.set(cleanSku, price);
    });

    // 3. Process each room and match SKUs using the Smart Pipeline
    const bomItems: any[] = [];
    
    for (const room of rooms) {
      const selectedColl = String(room.collection || '').toUpperCase();
      const selectedStyle = String(room.door_style || '').toUpperCase();

      if (!selectedColl) continue;

      const sections = room.sections || {};
      Object.entries(sections).forEach(([sectionName, items]: [string, any]) => {
        (items || []).forEach((cab: any) => {
          if (!cab.code) return;

          const rawCode = cab.code;
          const cleanCode = normalizeSku(rawCode);
          const baseCode = getBaseSku(rawCode);

          let price = 0;
          let source = 'NOT_FOUND';

          // LEVEL 1: EXACT MATCH (Collection + Style + SKU)
          const exactPrice = exactMap.get(`${selectedColl}|${selectedStyle}|${cleanCode}`);
          if (exactPrice !== undefined) {
            price = exactPrice;
            source = 'EXACT_MATCH';
          } 
          // LEVEL 2: PARTIAL MATCH (Collection + SKU)
          else {
            const partialPrice = collectionMap.get(`${selectedColl}|${cleanCode}`);
            if (partialPrice !== undefined) {
              price = partialPrice;
              source = 'PARTIAL_MATCH';
            } 
            // LEVEL 3: BASE MODEL MATCH (Remove L/R suffixes)
            else {
              const basePrice = baseModelMap.get(baseCode);
              if (basePrice !== undefined) {
                price = basePrice;
                source = 'BASE_MODEL_MATCH';
              }
              // LEVEL 4: FALLBACK MATCH (Any collection with this SKU)
              else {
                const fallbackPrice = globalSkuMap.get(cleanCode);
                if (fallbackPrice !== undefined) {
                  price = fallbackPrice;
                  source = 'FALLBACK_COLLECTION_MATCH';
                }
              }
            }
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
        });
      });
    }

    // 4. Persistence
    const { error: deleteError } = await supabase.from('quotation_bom').delete().eq('project_id', projectId);
    if (deleteError) {
      console.error('[BOM API] Error clearing existing BOM:', deleteError);
    }

    const { error: insertError } = await supabase.from('quotation_bom').insert(bomItems);
    if (insertError) {
      console.error('[BOM API] Error inserting new BOM:', insertError);
      throw new Error(`Failed to persist BOM items: ${insertError.message}`);
    }

    const { error: updateError } = await supabase.from('quotation_projects').update({ 
      manufacturer_id: manufacturerId,
      status: 'Priced' 
    }).eq('id', projectId);

    if (updateError) {
      console.error('[BOM API] Error updating project status:', updateError);
    }

    return Response.json({ success: true, count: bomItems.length });

  } catch (err: any) {
    console.error('[BOM API CRITICAL ERROR]:', err);
    return Response.json({ success: false, error: err.message || 'Internal processing error during BOM generation.' }, { status: 500 });
  }
}
