import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client for Server Components and Server Actions.
 * Uses service role key for full database access.
 */
export const createServerSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables for server client.');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
};