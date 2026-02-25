
import { createServerSupabase } from '@/lib/supabase-server';

/**
 * Fetches unique collections and door styles for a manufacturer.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return Response.json({ error: 'Missing ID' }, { status: 400 });

  try {
    const supabase = createServerSupabase();
    
    // Get unique collection names
    const { data: specs, error } = await supabase
      .from('manufacturer_specifications')
      .select('collection_name, door_style')
      .eq('manufacturer_id', id);

    if (error) throw error;

    const collections = Array.from(new Set(specs.map(s => s.collection_name))).filter(Boolean).sort();
    const styles = Array.from(new Set(specs.map(s => s.door_style))).filter(Boolean).sort();

    return Response.json({ collections, styles });

  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
