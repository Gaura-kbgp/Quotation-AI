
"use client";

import { use } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Factory, FileText, Table as TableIcon, Upload, Trash2, ExternalLink, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useDoc, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection } from 'firebase/firestore';

export default function ManufacturerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { db } = useFirestore();

  const manufacturerRef = useMemoFirebase(() => {
    if (!db || !id) return null;
    return doc(db, 'manufacturers', id);
  }, [db, id]);

  const { data: manufacturer, loading } = useDoc(manufacturerRef);

  const pricingSheetsQuery = useMemoFirebase(() => {
    if (!db || !id) return null;
    return collection(db, 'manufacturers', id, 'pricingSheets');
  }, [db, id]);

  const { data: pricingSheets, loading: loadingSheets } = useCollection(pricingSheetsQuery);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }

  if (!manufacturer) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-slate-900">Manufacturer not found</h2>
        <Link href="/admin/manufacturers" className="text-sky-600 hover:underline mt-4 block">Return to list</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/manufacturers">
           <Button variant="ghost" size="icon" className="text-slate-400 hover:text-sky-600">
              <ArrowLeft className="w-6 h-6" />
           </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{manufacturer.name}</h1>
          <p className="text-slate-500">ID: {id}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Specification Book Section */}
        <Card className="glass-card border-slate-200">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl flex items-center gap-2 text-slate-900">
                  <FileText className="w-5 h-5 text-sky-600" />
                  Specification Book
                </CardTitle>
                <CardDescription className="text-slate-500">PDF documentation for catalog and specs</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 flex flex-col items-center justify-center text-center">
              <Upload className="w-10 h-10 text-slate-300 mb-4" />
              <p className="text-slate-500 mb-4">Upload PDF catalogs (Coming Soon)</p>
              <Button variant="secondary" disabled className="bg-white border border-slate-200">Select File</Button>
            </div>
          </CardContent>
        </Card>

        {/* Pricing Sheet Section */}
        <Card className="glass-card border-slate-200">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl flex items-center gap-2 text-emerald-600">
                  <TableIcon className="w-5 h-5 text-emerald-600" />
                  Pricing Sheets
                </CardTitle>
                <CardDescription className="text-slate-500">XLSX, CSV or Google Sheet integration</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="p-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 flex flex-col items-center justify-center text-center">
                <Upload className="w-10 h-10 text-slate-300 mb-4" />
                <p className="text-slate-500 mb-4">Spreadsheet upload is disabled in prototype</p>
                <Button variant="secondary" disabled className="bg-white border border-slate-200">Select Spreadsheet</Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-slate-50 px-2 text-slate-400 font-bold">Or Connect URL</span>
                </div>
              </div>

              <div className="flex gap-2">
                 <Input placeholder="https://docs.google.com/spreadsheets/d/..." className="bg-white border-slate-200" disabled />
                 <Button disabled className="shrink-0 bg-emerald-600 hover:bg-emerald-700">Connect</Button>
              </div>
            </div>

            <div className="space-y-3">
               <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Active Configuration</h4>
               {pricingSheets?.length === 0 ? (
                 <p className="text-sm text-slate-400 italic">No pricing sheets connected.</p>
               ) : (
                 pricingSheets?.map((sheet: any) => (
                   <div key={sheet.id} className="flex items-center justify-between p-4 rounded-xl bg-white border border-slate-200">
                      <div className="flex items-center gap-3">
                         <div className="p-2 bg-emerald-50 rounded-lg">
                            <TableIcon className="w-5 h-5 text-emerald-600" />
                         </div>
                         <div>
                            <p className="text-sm font-medium text-slate-900">{sheet.fileName}</p>
                            <p className="text-xs text-slate-400">Last synced: {sheet.lastSynced || 'Never'}</p>
                         </div>
                      </div>
                      <div className="flex gap-2">
                         <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-900">
                            <ExternalLink className="w-4 h-4" />
                         </Button>
                         <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                         </Button>
                      </div>
                   </div>
                 ))
               )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
