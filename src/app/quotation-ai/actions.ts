
'use server';

import { createServerSupabase } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

/**
 * Generic project update for extracted_data and metadata.
 * Uses 'use server' for lightweight data persistence during the review process.
 */
export async function updateProjectAction(id: string, data: any) {
  try {
    const supabase = createServerSupabase();
    const { error } = await supabase.from('quotation_projects').update(data).eq('id', id);
    if (error) throw error;
    
    // Revalidate paths to ensure server-side data is fresh
    revalidatePath(`/quotation-ai/review/${id}`);
    revalidatePath(`/quotation-ai/bom/${id}`);
    
    return { success: true };
  } catch (err: any) {
    console.error('[Update Project Error]:', err);
    return { success: false, error: err.message || 'Failed to update project data.' };
  }
}
