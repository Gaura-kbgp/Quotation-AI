import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables are missing! Requests will fail.');
} else {
  console.log('Supabase client initialized for:', supabaseUrl);
}

// We use a safe fallback to prevent crashes, but connections will fail until .env is correct
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      headers: { 'x-application-name': 'kabs-quotation-ai' },
    },
    // Adding custom fetch to handle timeouts or logging if needed
  }
);
