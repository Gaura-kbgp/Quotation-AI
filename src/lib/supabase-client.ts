import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Production-ready Supabase client.
 * Strictly uses environment variables from .env.
 */
export const supabase = createClient(
  supabaseUrl || '', 
  supabaseAnonKey || '', 
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

// Debug helper to verify environment variables are loaded in the browser
if (typeof window !== 'undefined') {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase Client: Missing environment variables! Check your .env file.');
  } else {
    console.log('Supabase Client: Initialized for project:', supabaseUrl);
  }
}
