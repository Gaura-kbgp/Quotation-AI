'use server';

import { createServerSupabase } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

/**
 * Generic project update for extracted_data and metadata.
 */
export async function updateProjectAction(id: string, data: any) {
  try {
    const supabase = createServerSupabase();
    const { error } = await supabase.from('quotation_projects').update(data).eq('id', id);
    if (error) throw error;
    
    revalidatePath(`/quotation-ai/review/${id}`);
    revalidatePath(`/quotation-ai/bom/${id}`);
    
    return { success: true };
  } catch (err: any) {
    console.error('[Update Project Error]:', err);
    return { success: false, error: err.message || 'Failed to update project data.' };
  }
}

/**
 * Updates an individual BOM line item.
 */
export async function updateBomItemAction(id: string, updates: any) {
  try {
    const supabase = createServerSupabase();
    const { error } = await supabase.from('quotation_boms').update(updates).eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error('[Update BOM Error]:', err);
    return { success: false, error: err.message };
  }
}
