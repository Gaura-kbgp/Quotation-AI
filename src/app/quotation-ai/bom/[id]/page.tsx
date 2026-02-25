
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
import { Printer, Download, ArrowLeft, FileCheck, DollarSign, Building2 } from 'lucide-react';
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
  const tax = subtotal * 0.0825; // Example 8.25%
  const total = subtotal + tax;

  return (
    <main className="min-h-screen bg-[#020617] text-slate-100 p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,_var(--tw-gradient-stops))] from-sky-500/5 via-transparent to-transparent -z-10" />

      <div className="max-w-6xl mx-auto space-y-12">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <Link href={`/quotation-ai/review/${id}`}>
              <Button variant="ghost" className="text-slate-500 hover:text-sky-400 p-0 mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Review
              </Button>
            </Link>
            <h1 className="text-5xl font-black tracking-tighter">Final Quotation</h1>
            <div className="flex items-center gap-6 pt-2">
               <div className="flex items-center gap-2 text-sky-400">
                  <Building2 className="w-4 h-4" />
                  <span className="text-sm font-bold uppercase tracking-widest">Brand: {project.manufacturers?.name}</span>
               </div>
               <div className="flex items-center gap-2 text-emerald-400">
                  <FileCheck className="w-4 h-4" />
                  <span className="text-sm font-bold uppercase tracking-widest">Ref: {id.substring(0, 8).toUpperCase()}</span>
               </div>
            </div>
          </div>
          <div className="flex gap-4">
             <Button variant="outline" className="border-white/10 hover:bg-white/5 bg-transparent">
                <Printer className="w-4 h-4 mr-2" />
                Print
             </Button>
             <Button className="gradient-button">
                <Download className="w-4 h-4 mr-2" />
                Download PDF
             </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
           <div className="lg:col-span-3 space-y-12">
              {rooms.map(room => (
                <div key={room} className="space-y-6">
                   <h2 className="text-2xl font-bold border-l-4 border-sky-500 pl-4">{room}</h2>
                   <Card className="dark-glass border-white/5 overflow-hidden">
                      <Table>
                        <TableHeader className="bg-white/5">
                          <TableRow className="border-white/10 hover:bg-transparent">
                            <TableHead className="text-slate-400 font-bold uppercase tracking-widest text-xs">SKU</TableHead>
                            <TableHead className="text-slate-400 font-bold uppercase tracking-widest text-xs text-center">Qty</TableHead>
                            <TableHead className="text-slate-400 font-bold uppercase tracking-widest text-xs text-right">Unit Price</TableHead>
                            <TableHead className="text-slate-400 font-bold uppercase tracking-widest text-xs text-right">Line Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bom.filter(i => i.room === room).map(item => (
                            <TableRow key={item.id} className="border-white/5 hover:bg-white/5 transition-colors">
                              <TableCell className="font-bold text-slate-200">{item.sku}</TableCell>
                              <TableCell className="text-center font-medium">{item.qty}</TableCell>
                              <TableCell className="text-right text-slate-400">${item.unit_price.toLocaleString()}</TableCell>
                              <TableCell className="text-right font-bold text-sky-400">${item.line_total.toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                   </Card>
                </div>
              ))}
           </div>

           <div className="space-y-6">
              <Card className="dark-glass border-emerald-500/20 shadow-[0_0_50px_rgba(16,185,129,0.1)]">
                 <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                       <DollarSign className="w-5 h-5 text-emerald-400" />
                       Summary
                    </CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-6">
                    <div className="space-y-4">
                       <div className="flex justify-between text-sm text-slate-400">
                          <span>Subtotal</span>
                          <span>${subtotal.toLocaleString()}</span>
                       </div>
                       <div className="flex justify-between text-sm text-slate-400">
                          <span>Estimated Tax (8.25%)</span>
                          <span>${tax.toLocaleString()}</span>
                       </div>
                       <div className="h-px bg-white/10" />
                       <div className="flex justify-between items-end">
                          <span className="text-xs font-bold uppercase text-slate-500 tracking-widest">Total Price</span>
                          <span className="text-3xl font-black text-emerald-400">${total.toLocaleString()}</span>
                       </div>
                    </div>
                    <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 text-center font-bold tracking-widest">
                       PRICING GUARANTEED FOR 30 DAYS
                    </div>
                 </CardContent>
              </Card>

              <Card className="dark-glass border-white/5">
                 <CardContent className="p-6">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Specifications</p>
                    <div className="space-y-1">
                       <p className="text-sm font-bold text-sky-400">{bom[0]?.collection}</p>
                       <p className="text-xs text-slate-400">{bom[0]?.door_style}</p>
                    </div>
                 </CardContent>
              </Card>
           </div>
        </div>
      </div>
    </main>
  );
}
