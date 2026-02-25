
import { createServerSupabase } from '@/lib/supabase-server';
import { ReviewClient } from './review-client';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default async function ReviewProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerSupabase();

  try {
    const [pRes, mRes] = await Promise.all([
      supabase.from('quotation_projects').select('*').eq('id', id).single(),
      supabase.from('manufacturers').select('id, name').order('name')
    ]);

    if (pRes.error) throw pRes.error;

    const project = pRes.data;
    const manufacturers = mRes.data || [];

    return (
      <main className="min-h-screen bg-[#020617] text-slate-100 p-8">
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_var(--tw-gradient-stops))] from-sky-500/5 via-transparent to-transparent -z-10" />
         
         <div className="max-w-6xl mx-auto space-y-12">
            <div className="flex justify-between items-end">
               <div>
                  <Link href="/quotation-ai">
                     <Button variant="ghost" className="text-slate-500 hover:text-sky-400 p-0 mb-4">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Upload
                     </Button>
                  </Link>
                  <h1 className="text-4xl font-extrabold tracking-tight">Review AI Extraction</h1>
                  <p className="text-slate-400 mt-2">Project: <span className="text-sky-400 font-semibold">{project.project_name}</span></p>
               </div>
               <div className="px-4 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-sm font-bold uppercase tracking-widest">
                  Extraction Mode: Accurate
               </div>
            </div>

            <ReviewClient project={project} manufacturers={manufacturers} />
         </div>
      </main>
    );

  } catch (err: any) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center p-8">
        <Alert variant="destructive" className="max-w-xl bg-red-500/10 border-red-500/20 text-red-400">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="font-bold">Project Loading Error</AlertTitle>
          <AlertDescription className="mt-2">{err.message}</AlertDescription>
          <Link href="/quotation-ai" className="block mt-4">
             <Button variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10">Return to Upload</Button>
          </Link>
        </Alert>
      </div>
    );
  }
}
