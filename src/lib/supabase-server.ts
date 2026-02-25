
import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client for Server Components and Server Actions.
 * Uses service role key for full database access.
 */
export const createServerSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    console.error('CRITICAL: SUPABASE_URL is missing in server environment.');
  }
  if (!supabaseServiceKey) {
    console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing in server environment.');
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Database configuration incomplete. Please check server environment variables.');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
};
