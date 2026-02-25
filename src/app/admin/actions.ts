
"use server";

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

export async function createSession(token: string) {
  (await cookies()).set('kabs_admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  });
}

export async function logout() {
  (await cookies()).delete('kabs_admin_session');
  redirect('/admin/login');
}

/**
 * Adds a new manufacturer to the database.
 */
export async function addManufacturer(name: string) {
  try {
    const supabase = createServerSupabase();
    
    const { data, error } = await supabase
      .from('manufacturers')
      .insert([{ name, status: 'Active' }])
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/admin/manufacturers');
    return { success: true, data };
  } catch (err: any) {
    console.error('Add Manufacturer Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Deletes a manufacturer from the database.
 */
export async function deleteManufacturer(id: string) {
  try {
    const supabase = createServerSupabase();
    
    const { error } = await supabase
      .from('manufacturers')
      .delete()
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/admin/manufacturers');
    return { success: true };
  } catch (err: any) {
    console.error('Delete Manufacturer Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Deletes a manufacturer file and its associated storage.
 */
export async function deleteManufacturerFileAction(fileId: string, fileUrl: string, manufacturerId: string) {
  try {
    const supabase = createServerSupabase();
    
    // Extract path from public URL for deletion
    // Example: .../public/manufacturer-docs/uuid/spec-books/filename.pdf
    const pathParts = fileUrl.split('/public/manufacturer-docs/');
    const path = pathParts.length > 1 ? pathParts[1] : null;
    
    if (path) {
      await supabase.storage.from('manufacturer-docs').remove([path]);
    }
    
    await supabase.from('manufacturer_files').delete().eq('id', fileId);
    
    revalidatePath(`/admin/manufacturers/${manufacturerId}`);
    return { success: true };
  } catch (err: any) {
    console.error('Delete File Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Deletes an NKBA rule from the nkba_files table.
 */
export async function deleteNkbaRuleAction(id: string, fileUrl: string) {
  try {
    const supabase = createServerSupabase();
    const pathParts = fileUrl.split('/public/manufacturer-docs/');
    const path = pathParts.length > 1 ? pathParts[1] : null;
    
    if (path) {
      await supabase.storage.from('manufacturer-docs').remove([path]);
    }
    
    await supabase.from('nkba_files').delete().eq('id', id);
    
    revalidatePath('/admin/nkba');
    return { success: true };
  } catch (err: any) {
    console.error('Delete NKBA Error:', err);
    return { success: false, error: err.message };
  }
}
