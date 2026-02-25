import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client (Secure)
 * Uses the SERVICE_ROLE key to bypass RLS for administrative operations.
 * This function should ONLY be called in Server Components or Server Actions.
 */
export const createServerSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase Server: Required environment variables are missing.');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};
