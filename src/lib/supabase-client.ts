import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('CRITICAL: Supabase credentials missing. Check .env file.');
}

// Production-ready Supabase client
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    },
    global: {
      fetch: (url, options) => {
        return fetch(url, {
          ...options,
          // Add a timeout signal to help diagnose ERR_CONNECTION_TIMED_OUT
          signal: AbortSignal.timeout(10000) 
        });
      }
    }
  }
);
