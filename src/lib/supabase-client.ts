import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase Client: Environment variables NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.');
}

/**
 * Production-ready Supabase client.
 * Strictly uses environment variables from .env.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: {
    fetch: (url, options) => {
      // Configurable timeout to handle potential ERR_CONNECTION_TIMED_OUT issues
      const timeout = 15000; // 15 seconds
      return fetch(url, {
        ...options,
        signal: AbortSignal.timeout(timeout)
      });
    }
  }
});
