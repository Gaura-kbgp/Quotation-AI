import { createClient } from '@supabase/supabase-js';

/**
 * Standard Client-side Supabase client for Browser components.
 * This client is used in 'use client' components for interactive features.
 */
export const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
