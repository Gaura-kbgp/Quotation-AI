
import { createServerSupabase } from '@/lib/supabase-server';
import { ManufacturerDetailClient } from './manufacturer-detail-client';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, ArrowLeft, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default async function ManufacturerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  let manufacturer = null;
  let files: any[] = [];
  let specsSummary = null;
  let error: string | null = null;

  try {
    const supabase = createServerSupabase();
    
    const [mRes, fRes, sRes] = await Promise.all([
      supabase.from('manufacturers').select('*').eq('id', id).single(),
      supabase.from('manufacturer_files').select('*').eq('manufacturer_id', id).order('created_at', { ascending: false }),
      supabase.from('manufacturer_specifications').select('collection_name, door_style').eq('manufacturer_id', id)
    ]);

    if (mRes.error) throw new Error(mRes.error.message);
    
    manufacturer = mRes.data;
    files = fRes.data || [];
    
    if (sRes.data) {
      const collections = new Set(sRes.data.map(s => s.collection_name));
      const styles = new Set(sRes.data.map(s => s.door_style));
      specsSummary = {
        collections: collections.size,
        styles: styles.size,
        count: sRes.data.length
      };
    }
  } catch (err: any) {
    console.error(`Manufacturer Detail Page Error [${id}]:`, err.message);
    error = err.message;
  }

  if (error) {
    return (
      <div className="p-8 max-w-2xl mx-auto space-y-6">
        <Link href="/admin/manufacturers">
           <Button variant="ghost" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Manufacturers
           </Button>
        </Link>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="font-bold">System Connection Error</AlertTitle>
          <AlertDescription className="mt-2 text-red-700 leading-relaxed">
            The server encountered an error while loading this manufacturer: {error}
          </AlertDescription>
        </Alert>
        <div className="flex justify-center pt-4">
          <Link href={`/admin/manufacturers/${id}`}>
            <Button className="gradient-button px-8">
              <RefreshCcw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!manufacturer) {
    return (
      <div className="p-20 text-center">
        <h2 className="text-2xl font-bold text-slate-900">Manufacturer not found</h2>
        <p className="text-slate-500 mt-2">The requested ID does not exist in our database.</p>
        <Link href="/admin/manufacturers">
           <Button variant="outline" className="mt-6">Return to List</Button>
        </Link>
      </div>
    );
  }

  return (
    <ManufacturerDetailClient 
      id={id} 
      manufacturer={manufacturer} 
      initialFiles={files} 
      initialSpecsSummary={specsSummary} 
    />
  );
}
