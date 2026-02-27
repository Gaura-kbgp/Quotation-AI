import { createServerSupabase } from '@/lib/supabase-server';

export const maxDuration = 30;

/**
 * API to fetch structured Collection -> Door Styles mapping
 * for dynamic filtering in the UI.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return Response.json({ error: 'Missing Manufacturer ID' }, { status: 400 });

  try {
    const supabase = createServerSupabase();
    
    // Fetch distinct collection/style pairs
    const { data: pricing, error } = await supabase
      .from('manufacturer_pricing')
      .select('collection_name, door_style')
      .eq('manufacturer_id', id);

    if (error) throw error;

    if (!pricing || pricing.length === 0) {
      return Response.json({ mapping: {} });
    }

    // Build the hierarchical mapping: Collection -> [Styles]
    const mapping: Record<string, Set<string>> = {};

    pricing.forEach(record => {
      const c = String(record.collection_name || '').trim().toUpperCase();
      const st = String(record.door_style || '').trim().toUpperCase();
      
      if (c && c.length > 1 && st && st.length > 1) {
        if (!mapping[c]) mapping[c] = new Set<string>();
        mapping[c].add(st);
      }
    });

    // Convert sets to sorted arrays for JSON response
    const finalMapping: Record<string, string[]> = {};
    Object.keys(mapping).sort().forEach(collection => {
      finalMapping[collection] = Array.from(mapping[collection]).sort();
    });

    return Response.json({ 
      mapping: finalMapping,
      collections: Object.keys(finalMapping)
    });

  } catch (err: any) {
    console.error('[API] Config Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
