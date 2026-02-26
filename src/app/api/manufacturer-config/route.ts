
import { createServerSupabase } from '@/lib/supabase-server';

export const maxDuration = 30;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return Response.json({ error: 'Missing Manufacturer ID' }, { status: 400 });

  try {
    const supabase = createServerSupabase();
    
    const { data: pricing, error } = await supabase
      .from('manufacturer_pricing')
      .select('collection_name, door_style')
      .eq('manufacturer_id', id);

    if (error) throw error;

    if (!pricing || pricing.length === 0) {
      return Response.json({ collections: [], styles: [] });
    }

    const collectionSet = new Set<string>();
    const styleSet = new Set<string>();

    pricing.forEach(s => {
      const c = String(s.collection_name || '').trim();
      const st = String(s.door_style || '').trim();
      if (c) collectionSet.add(c);
      if (st) styleSet.add(st);
    });

    return Response.json({ 
      collections: Array.from(collectionSet).sort(), 
      styles: Array.from(styleSet).sort(),
      count: pricing.length 
    });

  } catch (err: any) {
    console.error('[API] Config Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
