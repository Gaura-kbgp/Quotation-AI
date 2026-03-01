
import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client for Server Components and Server Actions.
 * Uses service role key for full database access.
 */
export const createServerSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // For build-time static generation, we don't want to crash if keys are missing
  if (!supabaseUrl || !supabaseServiceKey) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('Supabase keys missing. This is expected during static build if no dynamic routes are accessed.');
    }
    // Return a dummy client or handle gracefully
    return createClient('https://placeholder.supabase.co', 'placeholder');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
};
