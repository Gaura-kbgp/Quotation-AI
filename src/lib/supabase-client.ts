import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Standard Client-side Supabase client for Browser components.
 * Uses the Anon key for restricted access.
 */
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
