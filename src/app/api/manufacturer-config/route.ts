
import { createServerSupabase } from '@/lib/supabase-server';

/**
 * Fetches unique collections and door styles for a manufacturer.
 * Used to populate dropdowns in the quotation flow.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  console.log(`[API] Fetching config for manufacturer: ${id}`);

  if (!id) return Response.json({ error: 'Missing Manufacturer ID' }, { status: 400 });

  try {
    const supabase = createServerSupabase();
    
    // Fetch unique collection and door style names
    const { data: specs, error } = await supabase
      .from('manufacturer_specifications')
      .select('collection_name, door_style')
      .eq('manufacturer_id', id);

    if (error) {
      console.error('[API] Supabase Query Error:', error);
      throw error;
    }

    if (!specs || specs.length === 0) {
      console.warn(`[API] No specifications found for manufacturer ID: ${id}`);
      return Response.json({ collections: [], styles: [] });
    }

    // Extract unique values
    const collections = Array.from(new Set(specs.map(s => s.collection_name))).filter(Boolean).sort();
    const styles = Array.from(new Set(specs.map(s => s.door_style))).filter(Boolean).sort();

    console.log(`[API] Returning ${collections.length} collections and ${styles.length} styles.`);

    return Response.json({ collections, styles });

  } catch (err: any) {
    console.error('[API] Manufacturer Config Catch:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
