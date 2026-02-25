
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
    // We fetch raw columns to ensure we get exactly what's in the DB
    const { data: specs, error } = await supabase
      .from('manufacturer_specifications')
      .select('collection_name, door_style')
      .eq('manufacturer_id', id);

    if (error) {
      console.error('[API] Supabase Query Error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    if (!specs || specs.length === 0) {
      console.warn(`[API] DATABASE EMPTY: No specification records found for ID: ${id}.`);
      return Response.json({ collections: [], styles: [] });
    }

    console.log(`[API] Retrieved ${specs.length} raw specification records for processing.`);

    // Extract unique values with cleaning
    const collections = Array.from(new Set(specs.map(s => String(s.collection_name || '').trim())))
      .filter(val => val.length > 0)
      .sort();
      
    const styles = Array.from(new Set(specs.map(s => String(s.door_style || '').trim())))
      .filter(val => val.length > 0)
      .sort();

    console.log(`[API] Found ${collections.length} unique Collections and ${styles.length} unique Styles.`);

    return Response.json({ 
      collections, 
      styles,
      count: specs.length 
    });

  } catch (err: any) {
    console.error('[API] Critical Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
