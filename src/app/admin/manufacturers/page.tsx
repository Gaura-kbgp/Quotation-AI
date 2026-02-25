import { createServerSupabase } from '@/lib/supabase-server';
import { ManufacturersList } from './manufacturers-list';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default async function ManufacturersPage() {
  const supabase = createServerSupabase();
  
  const { data: manufacturers, error } = await supabase
    .from('manufacturers')
    .select('*')
    .order('name');

  if (error) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Server Connection Error</AlertTitle>
          <AlertDescription className="mt-2 text-red-700">
            Could not fetch manufacturers from the database. {error.message}
          </AlertDescription>
        </Alert>
        <div className="mt-6 flex justify-center">
          <Link href="/admin/manufacturers">
            <Button variant="outline">
              <RefreshCcw className="w-4 h-4 mr-2" />
              Retry Server Request
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <ManufacturersList initialManufacturers={manufacturers || []} />
    </div>
  );
}
