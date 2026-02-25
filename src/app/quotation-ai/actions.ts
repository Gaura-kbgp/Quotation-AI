
'use server';

import { createServerSupabase } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

/**
 * Normalizes cabinet codes and generates a priced BOM.
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

    const extractedData = project.extracted_data;
    const rooms = extractedData.rooms || [];
    
    // 2. Fetch Pricing Matrix for selected configuration
    const { data: pricing, error: prError } = await supabase
      .from('manufacturer_specifications')
      .select('sku, price')
      .eq('manufacturer_id', manufacturerId)
      .eq('collection_name', collection)
      .eq('door_style', doorStyle);

    if (prError) throw prError;

    const pricingMap = new Map(pricing.map(p => [p.sku.toUpperCase().replace(/\s/g, ''), p.price]));

    // 3. Process each room and cabinet
    const bomItems: any[] = [];
    
    rooms.forEach((room: any) => {
      room.cabinets.forEach((cab: any) => {
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

    // 4. Batch delete old BOM for this project
    await supabase.from('quotation_bom').delete().eq('project_id', projectId);

    // 5. Insert new BOM
    const { error: insertError } = await supabase.from('quotation_bom').insert(bomItems);
    if (insertError) throw insertError;

    // 6. Update project status
    await supabase.from('quotation_projects').update({ 
      manufacturer_id: manufacturerId,
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
 * Updates project name or extraction details.
 */
export async function updateProjectAction(id: string, data: any) {
  const supabase = createServerSupabase();
  const { error } = await supabase.from('quotation_projects').update(data).eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/quotation-ai/review/${id}`);
  return { success: true };
}
