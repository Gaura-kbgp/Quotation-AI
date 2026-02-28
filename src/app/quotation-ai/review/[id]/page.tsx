
import { createServerSupabase } from '@/lib/supabase-server';
import { EstimatorClient } from './estimator-client';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function ReviewProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerSupabase();

  try {
    const [pRes, mRes] = await Promise.all([
      supabase.from('quotation_projects').select('*').eq('id', id).single(),
      supabase.from('manufacturers').select('id, name').eq('status', 'Active').order('name')
    ]);

    if (pRes.error || !pRes.data) {
      console.error('Project Fetch Error:', pRes.error);
      redirect('/quotation-ai');
    }

    const project = pRes.data;
    const manufacturers = mRes.data || [];

    return (
      <main className="min-h-screen bg-white text-slate-900">
         {/* Compact Sticky Header */}
         <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-100 px-6 h-16 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4">
              <Link href="/quotation-ai">
                <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-base font-bold tracking-tight text-slate-900 line-clamp-1 max-w-[300px] md:max-w-md">{project.project_name}</h1>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Project ID: {id.substring(0, 8).toUpperCase()}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
               <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-100">
                  <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Live Sync</span>
               </div>
            </div>
         </header>

         <div className="p-6">
            <EstimatorClient project={project} manufacturers={manufacturers} />
         </div>
      </main>
    );

  } catch (err: any) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <Alert variant="destructive" className="max-w-xl bg-red-50 border-red-200 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="font-bold">Project Loading Error</AlertTitle>
          <AlertDescription className="mt-2">{err.message}</AlertDescription>
          <Link href="/quotation-ai" className="block mt-4">
             <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50">Return to Upload</Button>
          </Link>
        </Alert>
      </div>
    );
  }
}
