
'use server';

import { createServerSupabase } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

/**
 * Normalizes cabinet codes and generates a priced BOM based on the new room structure.
 */
export async function generateBOMAction(projectId: string, manufacturerId: string, collection: string, doorStyle: string) {
  try {
    const supabase = createServerSupabase();

    // 1. Fetch project data
    const { data: project, error: pError } = await supabase
      .from('quotation_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (pError) throw pError;

    const rooms = project.extracted_data?.rooms || [];
    
    // 2. Fetch Pricing Matrix
    const { data: pricing, error: prError } = await supabase
      .from('manufacturer_specifications')
      .select('sku, price')
      .eq('manufacturer_id', manufacturerId)
      .eq('collection_name', collection)
      .eq('door_style', doorStyle);

    if (prError) throw prError;

    const pricingMap = new Map(pricing.map(p => [p.sku.toUpperCase().replace(/\s/g, ''), p.price]));

    // 3. Process each room and its sections
    const bomItems: any[] = [];
    
    rooms.forEach((room: any) => {
      Object.keys(room.sections || {}).forEach((sectionKey) => {
        const cabinets = room.sections[sectionKey] || [];
        cabinets.forEach((cab: any) => {
          const normalizedSku = cab.code.toUpperCase().replace(/\s/g, '');
          const unitPrice = pricingMap.get(normalizedSku) || 0;
          
          bomItems.push({
            project_id: projectId,
            sku: cab.code,
            qty: cab.qty,
            unit_price: unitPrice,
            line_total: unitPrice * cab.qty,
            room: room.room_name,
            collection,
            door_style: doorStyle,
            created_at: new Date().toISOString()
          });
        });
      });
    });

    // 4. Clean up old BOM
    await supabase.from('quotation_bom').delete().eq('project_id', projectId);

    // 5. Insert new BOM
    if (bomItems.length > 0) {
      const { error: insertError } = await supabase.from('quotation_bom').insert(bomItems);
      if (insertError) throw insertError;
    }

    // 6. Update project with final selection metadata
    await supabase.from('quotation_projects').update({ 
      manufacturer_id: manufacturerId,
      selected_collection: collection,
      selected_door_style: doorStyle,
      status: 'Priced' 
    }).eq('id', projectId);

    revalidatePath(`/quotation-ai/bom/${projectId}`);
    return { success: true };

  } catch (err: any) {
    console.error('BOM Generation Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Generic project update for extracted_data and metadata.
 */
export async function updateProjectAction(id: string, data: any) {
  try {
    const supabase = createServerSupabase();
    const { error } = await supabase.from('quotation_projects').update(data).eq('id', id);
    if (error) throw error;
    revalidatePath(`/quotation-ai/review/${id}`);
    return { success: true };
  } catch (err: any) {
    console.error('Update Project Error:', err);
    return { success: false, error: err.message };
  }
}
