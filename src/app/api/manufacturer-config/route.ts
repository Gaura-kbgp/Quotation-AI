
import { createServerSupabase } from '@/lib/supabase-server';

/**
 * Fetches unique collections and door styles for a manufacturer.
 * Used to populate dropdowns in the quotation flow.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  console.log(`[API] Fetching configuration for brand: ${id}`);

  if (!id) return Response.json({ error: 'Missing Manufacturer ID' }, { status: 400 });

  try {
    const supabase = createServerSupabase();
    
    // Fetch unique collection and door style names directly from the specifications matrix
    const { data: specs, error } = await supabase
      .from('manufacturer_specifications')
      .select('collection_name, door_style')
      .eq('manufacturer_id', id);

    if (error) {
      console.error('[API] Supabase Database Query Error:', error);
      throw error;
    }

    if (!specs || specs.length === 0) {
      console.warn(`[API] DATABASE WARNING: Found 0 specification records for manufacturer ID: ${id}. Ensure the pricing file was uploaded and parsed successfully.`);
      return Response.json({ collections: [], styles: [] });
    }

    console.log(`[API] Successfully retrieved ${specs.length} raw records for matching.`);

    // Extract unique values and filter out empty strings/nulls
    const collections = Array.from(new Set(specs.map(s => s.collection_name)))
      .filter((val): val is string => Boolean(val && val.trim().length > 0))
      .sort();
      
    const styles = Array.from(new Set(specs.map(s => s.door_style)))
      .filter((val): val is string => Boolean(val && val.trim().length > 0))
      .sort();

    console.log(`[API] Result Summary: ${collections.length} unique collections, ${styles.length} unique styles.`);

    return Response.json({ collections, styles });

  } catch (err: any) {
    console.error('[API] Critical Config Fetch Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
