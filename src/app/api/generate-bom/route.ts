
import { createServerSupabase } from '@/lib/supabase-server';

export const maxDuration = 60;

/**
 * Professional BOM Generation API.
 * Handles pricing lookups and line item aggregation with strict JSON responses.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, manufacturerId } = body;

    console.log(`[BOM API] Initiating generation for Project: ${projectId}`);
    console.log(`[BOM API] Selected Manufacturer: ${manufacturerId}`);

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
      return Response.json({ success: false, error: 'Project not found in database.' }, { status: 404 });
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
        console.warn(`[BOM API] Skipping room ${room.room_name} - Missing collection or style`);
        return Response.json({ 
          success: false, 
          error: `Room "${room.room_name}" is missing configuration. Please select a collection and style.` 
        }, { status: 400 });
      }

      // Fetch Pricing for this specific room's configuration
      // We look up the exact SKU/Price mapping from the matrix
      const { data: pricing, error: prError } = await supabase
        .from('manufacturer_specifications')
        .select('sku, price')
        .eq('manufacturer_id', manufacturerId)
        .eq('collection_name', collection)
        .eq('door_style', doorStyle);

      if (prError) {
        console.error(`[BOM API] Pricing fetch error for ${room.room_name}:`, prError);
        return Response.json({ success: false, error: `Database error during pricing fetch for ${room.room_name}.` }, { status: 500 });
      }

      const pricingMap = new Map(
        (pricing || []).map(p => [String(p.sku).toUpperCase().replace(/\s/g, ''), p.price])
      );

      const sections = room.sections || {};
      Object.keys(sections).forEach((sectionKey) => {
        const cabinets = sections[sectionKey] || [];
        cabinets.forEach((cab: any) => {
          if (!cab.code) return;

          const normalizedSku = String(cab.code).toUpperCase().replace(/\s/g, '');
          const unitPrice = pricingMap.get(normalizedSku) || 0;
          
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
        error: 'No priced items could be generated. Ensure your takeoff codes match the manufacturer price matrix.' 
      }, { status: 400 });
    }

    // 3. Clean up old BOM for this project
    await supabase.from('quotation_bom').delete().eq('project_id', projectId);

    // 4. Insert new BOM line items
    const { error: insertError } = await supabase.from('quotation_bom').insert(bomItems);
    if (insertError) {
      console.error('[BOM API] BOM Insert error:', insertError);
      return Response.json({ success: false, error: 'Failed to persist generated BOM items.' }, { status: 500 });
    }

    // 5. Update project status to Priced
    const { error: updateError } = await supabase.from('quotation_projects').update({ 
      manufacturer_id: manufacturerId,
      status: 'Priced' 
    }).eq('id', projectId);

    if (updateError) {
      console.error('[BOM API] Project status update error:', updateError);
    }

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
