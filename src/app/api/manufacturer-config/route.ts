
import { createServerSupabase } from '@/lib/supabase-server';

/**
 * Fetches unique collections and door styles for a manufacturer.
 * Used to populate dropdowns in the quotation flow.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  console.log(`[API] Configuration request for Brand ID: ${id}`);

  if (!id) return Response.json({ error: 'Missing Manufacturer ID' }, { status: 400 });

  try {
    const supabase = createServerSupabase();
    
    // Fetch unique values from the specifications table
    const { data: specs, error } = await supabase
      .from('manufacturer_specifications')
      .select('collection_name, door_style')
      .eq('manufacturer_id', id);

    if (error) {
      console.error('[API] Supabase Query Error:', error);
      throw error;
    }

    if (!specs || specs.length === 0) {
      console.warn(`[API] DATABASE EMPTY: No specification records found for ID: ${id}. Please ensure a pricing file was uploaded and parsed in the Admin panel.`);
      return Response.json({ collections: [], styles: [] });
    }

    console.log(`[API] Retreived ${specs.length} raw specification records.`);

    // Extract unique values
    const collections = Array.from(new Set(specs.map(s => s.collection_name)))
      .filter((val): val is string => Boolean(val && val.trim().length > 0))
      .sort();
      
    const styles = Array.from(new Set(specs.map(s => s.door_style)))
      .filter((val): val is string => Boolean(val && val.trim().length > 0))
      .sort();

    console.log(`[API] Success: Found ${collections.length} Collections and ${styles.length} Styles.`);

    return Response.json({ collections, styles });

  } catch (err: any) {
    console.error('[API] Critical Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
