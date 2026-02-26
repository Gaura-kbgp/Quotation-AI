'use server';

import { createServerSupabase } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

/**
 * Normalizes cabinet codes and generates a priced BOM based on the room structure.
 * Supports per-room collection and door style configuration.
 */
export async function generateBOMAction(projectId: string, manufacturerId: string) {
  try {
    console.log(`[BOM] Starting generation for Project: ${projectId}`);
    const supabase = createServerSupabase();

    // 1. Fetch project data
    const { data: project, error: pError } = await supabase
      .from('quotation_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (pError || !project) throw new Error(pError?.message || 'Project not found');

    const rooms = project.extracted_data?.rooms || [];
    if (rooms.length === 0) throw new Error('No room data found in project extraction');
    
    // 2. Process each room and its sections
    const bomItems: any[] = [];
    
    for (const room of rooms) {
      const collection = room.collection;
      const doorStyle = room.door_style;

      if (!collection || !doorStyle) {
        console.warn(`[BOM] Skipping room ${room.room_name} - Missing collection or style`);
        continue;
      }

      // Fetch Pricing for this specific room's configuration
      const { data: pricing, error: prError } = await supabase
        .from('manufacturer_specifications')
        .select('sku, price')
        .eq('manufacturer_id', manufacturerId)
        .eq('collection_name', collection)
        .eq('door_style', doorStyle);

      if (prError) throw new Error(`Pricing fetch error for ${room.room_name}: ${prError.message}`);

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
      throw new Error('No priced items could be generated. Ensure all rooms have a collection and style selected.');
    }

    // 3. Clean up old BOM
    await supabase.from('quotation_bom').delete().eq('project_id', projectId);

    // 4. Insert new BOM
    const { error: insertError } = await supabase.from('quotation_bom').insert(bomItems);
    if (insertError) throw new Error(`BOM Insert error: ${insertError.message}`);

    // 5. Update project status
    const { error: updateError } = await supabase.from('quotation_projects').update({ 
      manufacturer_id: manufacturerId,
      status: 'Priced' 
    }).eq('id', projectId);

    if (updateError) throw new Error(`Project update error: ${updateError.message}`);

    revalidatePath(`/quotation-ai/bom/${projectId}`);
    return { success: true };

  } catch (err: any) {
    console.error('[BOM CRITICAL ERROR]:', err);
    return { success: false, error: err.message || 'An unexpected error occurred during BOM generation' };
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
    console.error('[Update Project Error]:', err);
    return { success: false, error: err.message };
  }
}
