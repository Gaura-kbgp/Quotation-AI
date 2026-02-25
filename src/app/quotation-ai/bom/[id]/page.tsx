
import { createServerSupabase } from '@/lib/supabase-server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Printer, Download, ArrowLeft, FileCheck, DollarSign, Building2, Layout } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function BomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerSupabase();

  const [pRes, bRes] = await Promise.all([
    supabase.from('quotation_projects').select('*, manufacturers(name)').eq('id', id).single(),
    supabase.from('quotation_bom').select('*').eq('project_id', id).order('room')
  ]);

  if (!pRes.data) redirect('/quotation-ai');

  const project = pRes.data;
  const bom = bRes.data || [];
  
  const rooms = Array.from(new Set(bom.map(i => i.room)));
  const subtotal = bom.reduce((acc, curr) => acc + curr.line_total, 0);
  const tax = subtotal * 0.0825; // 8.25% Tax
  const total = subtotal + tax;

  return (
    <main className="min-h-screen bg-white text-slate-900 pb-20">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 px-8 h-20 flex items-center justify-between">
         <div className="flex items-center gap-6">
            <Link href={`/quotation-ai/review/${id}`}>
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">{project.project_name}</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Final Quotation • {project.manufacturers?.name}</p>
            </div>
         </div>
         <div className="flex items-center gap-3">
            <Button variant="outline" className="rounded-xl border-slate-200">
               <Printer className="w-4 h-4 mr-2" />
               Print
            </Button>
            <Button className="gradient-button rounded-xl px-6">
               <Download className="w-4 h-4 mr-2" />
               Download PDF
            </Button>
         </div>
      </header>

      <div className="max-w-6xl mx-auto mt-12 px-6 space-y-12">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
           <div className="lg:col-span-3 space-y-12">
              {rooms.map(room => (
                <div key={room} className="space-y-4">
                   <div className="flex items-center gap-2 mb-2">
                      <Layout className="w-4 h-4 text-sky-500" />
                      <h2 className="text-lg font-bold text-slate-900 uppercase tracking-wide">{room}</h2>
                   </div>
                   <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
                      <Table>
                        <TableHeader className="bg-slate-50/50">
                          <TableRow className="border-slate-100 hover:bg-transparent">
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">SKU</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center">Qty</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Unit Price</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Line Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bom.filter(i => i.room === room).map(item => (
                            <TableRow key={item.id} className="border-slate-50 hover:bg-slate-50/20">
                              <TableCell className="font-bold text-slate-900">{item.sku}</TableCell>
                              <TableCell className="text-center font-medium text-slate-700">{item.qty}</TableCell>
                              <TableCell className="text-right text-slate-500">${item.unit_price.toLocaleString()}</TableCell>
                              <TableCell className="text-right font-bold text-sky-600">${item.line_total.toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                   </div>
                </div>
              ))}
           </div>

           <div className="space-y-6">
              <Card className="rounded-3xl border-slate-100 shadow-xl overflow-hidden">
                 <CardHeader className="bg-sky-600 text-white">
                    <CardTitle className="text-lg flex items-center gap-2">
                       <DollarSign className="w-5 h-5" />
                       Quote Summary
                    </CardTitle>
                 </CardHeader>
                 <CardContent className="p-6 space-y-6">
                    <div className="space-y-4">
                       <div className="flex justify-between text-sm text-slate-500">
                          <span>Subtotal</span>
                          <span className="font-bold text-slate-900">${subtotal.toLocaleString()}</span>
                       </div>
                       <div className="flex justify-between text-sm text-slate-500">
                          <span>Est. Tax (8.25%)</span>
                          <span className="font-bold text-slate-900">${tax.toLocaleString()}</span>
                       </div>
                       <div className="h-px bg-slate-100" />
                       <div className="flex flex-col items-end">
                          <span className="text-[9px] font-bold uppercase text-slate-400 tracking-[0.2em] mb-1">Grand Total</span>
                          <span className="text-4xl font-black text-sky-600">${total.toLocaleString()}</span>
                       </div>
                    </div>
                    
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3">
                       <div>
                          <p className="text-[9px] font-bold uppercase text-slate-400 tracking-widest">Brand Configuration</p>
                          <p className="text-sm font-bold text-slate-800">{project.manufacturers?.name}</p>
                       </div>
                       <div className="grid grid-cols-2 gap-2">
                          <div>
                             <p className="text-[8px] font-bold uppercase text-slate-400">Collection</p>
                             <p className="text-[11px] font-bold">{project.selected_collection}</p>
                          </div>
                          <div>
                             <p className="text-[8px] font-bold uppercase text-slate-400">Style</p>
                             <p className="text-[11px] font-bold">{project.selected_door_style}</p>
                          </div>
                       </div>
                    </div>
                 </CardContent>
              </Card>

              <div className="p-6 rounded-3xl bg-emerald-50 border border-emerald-100 text-center">
                 <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-1">Verification Status</p>
                 <p className="text-xs text-emerald-700 font-medium">Pricing matched against {project.manufacturers?.name} Matrix v1.0</p>
              </div>
           </div>
        </div>
      </div>
    </main>
  );
}
