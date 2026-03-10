import { createServerSupabase } from '@/lib/supabase-server';

export const maxDuration = 30;

/**
 * API to fetch structured Collection -> Door Styles mapping.
 * Optimized to handle multi-style strings and provide clean, independent dropdown options.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return Response.json({ error: 'Missing Manufacturer ID' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    
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

    // Build hierarchical map
    const mapping: Record<string, Set<string>> = {};

    pricing.forEach(record => {
      const rawC = String(record.collection_name || '').trim().toUpperCase();
      const rawSt = String(record.door_style || '').trim().toUpperCase();
      
      if (rawC && rawSt) {
        // Split by standard delimiters as a fallback for any legacy merged data
        const collections = rawC.split(/[\n\r,]+/).map(s => s.trim()).filter(Boolean);
        const styles = rawSt.split(/[\n\r,]+/).map(s => s.trim()).filter(Boolean);

        collections.forEach(c => {
          if (!mapping[c]) mapping[c] = new Set<string>();
          styles.forEach(st => {
            mapping[c].add(st);
          });
        });
      }
    });

    // Convert sets to sorted arrays
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
