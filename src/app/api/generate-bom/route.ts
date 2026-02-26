
import { createServerSupabase } from '@/lib/supabase-server';

export const maxDuration = 60;

/**
 * Aggressive SKU normalization for matching.
 */
function normalizeSku(sku: string): string {
  return String(sku || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Professional BOM Generation API.
 * Handles pricing lookups and line item aggregation with strict JSON responses.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

    console.log(`[BOM API] Initiating generation for Project: ${projectId}`);
    
    if (!projectId || !manufacturerId) {
      return Response.json({ 
        success: false, 
        error: "Missing required project or manufacturer parameters." 
      }, { status: 400 });
    }

    const supabase = createServerSupabase();

    // 1. Fetch project data to get latest extractions
    const { data: project, error: pError } = await supabase
      .from('quotation_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (pError || !project) {
      console.error('[BOM API] Project fetch error:', pError);
      return Response.json({ success: false, error: `Project not found: ${pError?.message || 'Unknown'}` }, { status: 404 });
    }

    const rooms = project.extracted_data?.rooms || [];
    if (rooms.length === 0) {
      return Response.json({ success: false, error: 'No room data found in project extraction.' }, { status: 400 });
    }

    console.log(`[BOM API] Processing ${rooms.length} rooms...`);

    // 2. Process each room and its sections
    const bomItems: any[] = [];
    
    for (const room of rooms) {
      const collection = room.collection;
      const doorStyle = room.door_style;

      if (!collection || !doorStyle) {
        console.warn(`[BOM API] Skipping room ${room.room_name} - Missing configuration`);
        continue;
      }

      // Fetch Pricing for this specific room's configuration
      const { data: pricing, error: prError } = await supabase
        .from('manufacturer_specifications')
        .select('sku, price')
        .eq('manufacturer_id', manufacturerId)
        .eq('collection_name', collection)
        .eq('door_style', doorStyle);

      if (prError) {
        console.error(`[BOM API] Database error during pricing fetch for ${room.room_name}:`, prError);
        return Response.json({ 
          success: false, 
          error: `Database error for ${room.room_name}: ${prError.message}. Ensure the specifications are uploaded correctly.` 
        }, { status: 500 });
      }

      // Map SKUs using aggressive normalization for high-precision matching
      const pricingMap = new Map(
        (pricing || []).map(p => [normalizeSku(p.sku), p.price])
      );

      const sections = room.sections || {};
      Object.keys(sections).forEach((sectionKey) => {
        const cabinets = sections[sectionKey] || [];
        cabinets.forEach((cab: any) => {
          if (!cab.code) return;

          const cleanSku = normalizeSku(cab.code);
          const unitPrice = pricingMap.get(cleanSku) || 0;
          
          bomItems.push({
            project_id: projectId,
            sku: cab.code,
            qty: cab.qty || 1,
            unit_price: unitPrice,
            line_total: unitPrice * (cab.qty || 1),
            room: room.room_name,
            collection,
            door_style: doorStyle,
            created_at: new Date().toISOString()
          });
        });
      });
    }

    if (bomItems.length === 0) {
      return Response.json({ 
        success: false, 
        error: 'No priced items could be generated. Please ensure collections and door styles are selected for all areas.' 
      }, { status: 400 });
    }

    // 3. Clean up old BOM for this project
    await supabase.from('quotation_bom').delete().eq('project_id', projectId);

    // 4. Insert new BOM line items
    const { error: insertError } = await supabase.from('quotation_bom').insert(bomItems);
    if (insertError) {
      console.error('[BOM API] BOM Insert error:', insertError);
      return Response.json({ success: false, error: `BOM Persist error: ${insertError.message}` }, { status: 500 });
    }

    // 5. Update project status to Priced
    await supabase.from('quotation_projects').update({ 
      manufacturer_id: manufacturerId,
      status: 'Priced' 
    }).eq('id', projectId);

    console.log(`[BOM API] Success! Generated ${bomItems.length} line items.`);
    return Response.json({ success: true, count: bomItems.length });

  } catch (err: any) {
    console.error('[BOM API CRITICAL ERROR]:', err);
    return Response.json({ 
      success: false, 
      error: err.message || 'An internal server error occurred during BOM generation.' 
    }, { status: 500 });
  }
}
