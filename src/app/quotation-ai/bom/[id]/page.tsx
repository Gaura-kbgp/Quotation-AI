
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
import { 
  Printer, 
  Download, 
  ArrowLeft, 
  DollarSign, 
  Layout, 
  ShieldCheck, 
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

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

  const getSourceColor = (source: string) => {
    switch(source) {
      case 'EXACT_MATCH': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'PARTIAL_MATCH': return 'bg-sky-50 text-sky-700 border-sky-100';
      case 'BASE_MODEL_MATCH': return 'bg-purple-50 text-purple-700 border-purple-100';
      case 'FALLBACK_COLLECTION_MATCH': return 'bg-amber-50 text-amber-700 border-amber-100';
      default: return 'bg-red-50 text-red-700 border-red-100';
    }
  };

  const getSourceIcon = (source: string) => {
    switch(source) {
      case 'EXACT_MATCH': return <ShieldCheck className="w-3 h-3 mr-1" />;
      case 'NOT_FOUND': return <AlertCircle className="w-3 h-3 mr-1" />;
      default: return <HelpCircle className="w-3 h-3 mr-1" />;
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 px-8 h-20 flex items-center justify-between">
         <div className="flex items-center gap-6">
            <Link href={`/quotation-ai/review/${id}`}>
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">{project.project_name}</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Pricing Analysis • {project.manufacturers?.name}</p>
            </div>
         </div>
         <div className="flex items-center gap-3">
            <Button variant="outline" className="rounded-xl border-slate-200">
               <Printer className="w-4 h-4 mr-2" />
               Print
            </Button>
            <Button className="gradient-button rounded-xl px-6">
               <Download className="w-4 h-4 mr-2" />
               Export JSON
            </Button>
         </div>
      </header>

      <div className="max-w-7xl mx-auto mt-12 px-6 space-y-12">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
           <div className="lg:col-span-3 space-y-12">
              {rooms.map(room => (
                <div key={room} className="space-y-4">
                   <div className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-2">
                        <Layout className="w-4 h-4 text-sky-500" />
                        <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">{room}</h2>
                      </div>
                      <Badge variant="outline" className="text-[10px] bg-white text-slate-500">
                        {bom.filter(i => i.room === room).length} Items
                      </Badge>
                   </div>
                   <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-xl">
                      <Table>
                        <TableHeader className="bg-slate-50/50">
                          <TableRow className="border-slate-100 hover:bg-transparent">
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400 pl-6">Cabinet Code</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Match Accuracy</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center">Qty</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Unit Price</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right pr-6">Line Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bom.filter(i => i.room === room).map(item => (
                            <TableRow key={item.id} className="border-slate-50 hover:bg-slate-50/20">
                              <TableCell className="font-bold text-slate-900 pl-6">{item.sku}</TableCell>
                              <TableCell>
                                <Badge className={cn("text-[9px] font-bold py-0.5", getSourceColor(item.price_source))}>
                                  {getSourceIcon(item.price_source)}
                                  {item.price_source.replace(/_/g, ' ')}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center font-medium text-slate-700">{item.qty}</TableCell>
                              <TableCell className="text-right text-slate-500 font-mono">${(item.unit_price || 0).toLocaleString()}</TableCell>
                              <TableCell className="text-right font-black text-sky-600 pr-6 font-mono">${(item.line_total || 0).toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                   </div>
                </div>
              ))}
           </div>

           <div className="space-y-6">
              <Card className="rounded-[2rem] border-slate-100 shadow-2xl overflow-hidden sticky top-28">
                 <CardHeader className="bg-slate-900 text-white p-8">
                    <CardTitle className="text-lg flex items-center gap-2">
                       <DollarSign className="w-5 h-5 text-sky-400" />
                       Quote Analysis
                    </CardTitle>
                 </CardHeader>
                 <CardContent className="p-8 space-y-8">
                    <div className="space-y-4">
                       <div className="flex justify-between text-sm text-slate-500">
                          <span>Takeoff Subtotal</span>
                          <span className="font-bold text-slate-900">${subtotal.toLocaleString()}</span>
                       </div>
                       <div className="flex justify-between text-sm text-slate-500">
                          <span>Sales Tax (8.25%)</span>
                          <span className="font-bold text-slate-900">${tax.toLocaleString()}</span>
                       </div>
                       <div className="h-px bg-slate-100 my-4" />
                       <div className="flex flex-col items-end">
                          <span className="text-[9px] font-bold uppercase text-slate-400 tracking-[0.2em] mb-1">Final Investment</span>
                          <span className="text-4xl font-black text-sky-600 leading-none">${total.toLocaleString()}</span>
                       </div>
                    </div>
                    
                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-4">
                       <div>
                          <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Manufacturer</p>
                          <p className="text-sm font-black text-slate-900">{project.manufacturers?.name}</p>
                       </div>
                       <div className="grid grid-cols-1 gap-3">
                          <div className="flex justify-between items-center">
                             <span className="text-[9px] font-bold uppercase text-slate-400">Exact Matches</span>
                             <Badge className="bg-emerald-100 text-emerald-700 border-none font-bold">
                                {bom.filter(i => i.price_source === 'EXACT_MATCH').length}
                             </Badge>
                          </div>
                          <div className="flex justify-between items-center">
                             <span className="text-[9px] font-bold uppercase text-slate-400">Smart Match Hits</span>
                             <Badge className="bg-sky-100 text-sky-700 border-none font-bold">
                                {bom.filter(i => ['PARTIAL_MATCH', 'BASE_MODEL_MATCH'].includes(i.price_source)).length}
                             </Badge>
                          </div>
                          <div className="flex justify-between items-center">
                             <span className="text-[9px] font-bold uppercase text-slate-400">Missing Price</span>
                             <Badge className="bg-red-100 text-red-700 border-none font-bold">
                                {bom.filter(i => i.price_source === 'NOT_FOUND').length}
                             </Badge>
                          </div>
                       </div>
                    </div>

                    <Button className="w-full h-14 gradient-button rounded-2xl">
                       Finalize & Close
                    </Button>
                 </CardContent>
              </Card>

              <div className="p-6 rounded-3xl bg-sky-50 border border-sky-100 text-center">
                 <p className="text-[10px] font-black text-sky-600 uppercase tracking-[0.2em] mb-1">Production Status</p>
                 <p className="text-xs text-sky-700 font-medium leading-relaxed">Smart Pricing matched {((bom.filter(i => i.price_source !== 'NOT_FOUND').length / bom.length) * 100).toFixed(0)}% of items against production matrices.</p>
              </div>
           </div>
        </div>
      </div>
    </main>
  );
}
