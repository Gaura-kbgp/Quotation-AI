
import { createServerSupabase } from '@/lib/supabase-server';

export const maxDuration = 30;

/**
 * API to fetch structured Collection -> Door Styles mapping
 * Ensures unique, individual style strings are returned as a flat array.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return Response.json({ error: 'Missing Manufacturer ID' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    
    // Fetch distinct collection/style pairs directly from the normalized records
    const { data: pricing, error } = await supabase
      .from('manufacturer_pricing')
      .select('collection_name, door_style')
      .eq('manufacturer_id', id);

    if (error) {
      console.error('[API] Supabase Fetch Error:', error);
      return Response.json({ error: `Database error: ${error.message}` }, { status: 500 });
    }

    if (!pricing || pricing.length === 0) {
      return Response.json({ mapping: {}, collections: [] });
    }

    // Build the hierarchical mapping: Collection -> Array of UNIQUE Styles
    const mapping: Record<string, Set<string>> = {};

    pricing.forEach(record => {
      const c = String(record.collection_name || '').trim().toUpperCase();
      const st = String(record.door_style || '').trim().toUpperCase();
      
      if (c && c.length > 1 && st && st.length > 1) {
        if (!mapping[c]) mapping[c] = new Set<string>();
        mapping[c].add(st);
      }
    });

    // Convert sets to sorted arrays for final response
    const finalMapping: Record<string, string[]> = {};
    const sortedCollections = Object.keys(mapping).sort();
    
    sortedCollections.forEach(collection => {
      finalMapping[collection] = Array.from(mapping[collection]).sort();
    });

    return Response.json({ 
      mapping: finalMapping,
      collections: sortedCollections
    });

  } catch (err: any) {
    console.error('[API] Config Handler Critical Error:', err);
    return Response.json({ error: err.message || 'An unexpected server error occurred.' }, { status: 500 });
  }
}
