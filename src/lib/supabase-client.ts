import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase Client: Configuration is missing! Please check your .env file.');
}

/**
 * Standard Client-side Supabase client for Browser components.
 */
export const supabaseClient = createClient(
  supabaseUrl || '', 
  supabaseAnonKey || ''
);
