
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
    <main className="min-h-screen bg-slate-50 text-slate-900 p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,_var(--tw-gradient-stops))] from-sky-500/5 via-transparent to-transparent -z-10" />

      <div className="max-w-6xl mx-auto space-y-12">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <Link href={`/quotation-ai/review/${id}`}>
              <Button variant="ghost" className="text-slate-500 hover:text-sky-600 p-0 mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Review
              </Button>
            </Link>
            <h1 className="text-5xl font-black tracking-tighter text-slate-900">Final Quotation</h1>
            <div className="flex items-center gap-6 pt-2">
               <div className="flex items-center gap-2 text-sky-600">
                  <Building2 className="w-4 h-4" />
                  <span className="text-sm font-bold uppercase tracking-widest">Brand: {project.manufacturers?.name}</span>
               </div>
               <div className="flex items-center gap-2 text-emerald-600">
                  <FileCheck className="w-4 h-4" />
                  <span className="text-sm font-bold uppercase tracking-widest">Ref: {id.substring(0, 8).toUpperCase()}</span>
               </div>
            </div>
          </div>
          <div className="flex gap-4">
             <Button variant="outline" className="border-slate-200 hover:bg-white bg-transparent text-slate-600">
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
                   <h2 className="text-2xl font-bold border-l-4 border-sky-500 pl-4 text-slate-900">{room}</h2>
                   <Card className="bg-white border-slate-200 shadow-md overflow-hidden">
                      <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow className="border-slate-100 hover:bg-transparent">
                            <TableHead className="text-slate-500 font-bold uppercase tracking-widest text-xs">SKU</TableHead>
                            <TableHead className="text-slate-500 font-bold uppercase tracking-widest text-xs text-center">Qty</TableHead>
                            <TableHead className="text-slate-500 font-bold uppercase tracking-widest text-xs text-right">Unit Price</TableHead>
                            <TableHead className="text-slate-500 font-bold uppercase tracking-widest text-xs text-right">Line Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bom.filter(i => i.room === room).map(item => (
                            <TableRow key={item.id} className="border-slate-50 hover:bg-slate-50/50 transition-colors">
                              <TableCell className="font-bold text-slate-900">{item.sku}</TableCell>
                              <TableCell className="text-center font-medium text-slate-700">{item.qty}</TableCell>
                              <TableCell className="text-right text-slate-500">${item.unit_price.toLocaleString()}</TableCell>
                              <TableCell className="text-right font-bold text-sky-600">${item.line_total.toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                   </Card>
                </div>
              ))}
           </div>

           <div className="space-y-6">
              <Card className="bg-white border-emerald-100 shadow-xl border-t-4 border-t-emerald-500">
                 <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
                       <DollarSign className="w-5 h-5 text-emerald-600" />
                       Summary
                    </CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-6">
                    <div className="space-y-4">
                       <div className="flex justify-between text-sm text-slate-500">
                          <span>Subtotal</span>
                          <span className="font-medium text-slate-900">${subtotal.toLocaleString()}</span>
                       </div>
                       <div className="flex justify-between text-sm text-slate-500">
                          <span>Estimated Tax (8.25%)</span>
                          <span className="font-medium text-slate-900">${tax.toLocaleString()}</span>
                       </div>
                       <div className="h-px bg-slate-100" />
                       <div className="flex justify-between items-end">
                          <span className="text-xs font-bold uppercase text-slate-400 tracking-widest">Total Price</span>
                          <span className="text-3xl font-black text-emerald-600">${total.toLocaleString()}</span>
                       </div>
                    </div>
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 text-center font-bold tracking-widest">
                       PRICING GUARANTEED FOR 30 DAYS
                    </div>
                 </CardContent>
              </Card>

              <Card className="bg-white border-slate-200">
                 <CardContent className="p-6">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Specifications</p>
                    <div className="space-y-1">
                       <p className="text-sm font-bold text-sky-600">{bom[0]?.collection}</p>
                       <p className="text-xs text-slate-500 font-medium">{bom[0]?.door_style}</p>
                    </div>
                 </CardContent>
              </Card>
           </div>
        </div>
      </div>
    </main>
  );
}
