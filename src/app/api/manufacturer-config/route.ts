
import { createServerSupabase } from '@/lib/supabase-server';

export const maxDuration = 30;

/**
 * Fetches unique collections and door styles for a manufacturer.
 * Optimized for large datasets.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return Response.json({ error: 'Missing Manufacturer ID' }, { status: 400 });

  try {
    const supabase = createServerSupabase();
    
    // Fetch unique values from the specifications table
    // We only select the necessary columns to reduce payload size
    const { data: specs, error } = await supabase
      .from('manufacturer_specifications')
      .select('collection_name, door_style')
      .eq('manufacturer_id', id);

    if (error) {
      console.error('[API] Supabase Query Error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    if (!specs || specs.length === 0) {
      return Response.json({ collections: [], styles: [] });
    }

    // Use a Set to extract unique values efficiently
    const collectionSet = new Set<string>();
    const styleSet = new Set<string>();

    specs.forEach(s => {
      const c = String(s.collection_name || '').trim();
      const st = String(s.door_style || '').trim();
      if (c) collectionSet.add(c);
      if (st) styleSet.add(st);
    });

    return Response.json({ 
      collections: Array.from(collectionSet).sort(), 
      styles: Array.from(styleSet).sort(),
      count: specs.length 
    });

  } catch (err: any) {
    console.error('[API] Critical Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
