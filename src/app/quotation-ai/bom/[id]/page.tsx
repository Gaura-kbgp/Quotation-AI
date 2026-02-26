
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
  HelpCircle,
  FileText,
  BadgePercent
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export default async function BomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerSupabase();

  let project = null;
  let bom: any[] = [];
  let error: string | null = null;

  try {
    // We await params and then fetch to ensure the ID is available for the database query
    const [pRes, bRes] = await Promise.all([
      supabase.from('quotation_projects').select('*, manufacturers(name)').eq('id', id).single(),
      supabase.from('quotation_boms').select('*').eq('project_id', id).order('room')
    ]);

    if (pRes.error) throw new Error(`Project record retrieval failed: ${pRes.error.message}`);
    if (bRes.error) throw new Error(`Pricing line items retrieval failed: ${bRes.error.message}`);

    project = pRes.data;
    bom = bRes.data || [];
  } catch (err: any) {
    console.error('[BOM Page Diagnostic]:', err.message);
    error = err.message;
  }

  // Instead of redirecting to the upload page, we show a professional error state to allow diagnosis
  if (error || !project) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <Card className="max-w-md w-full rounded-[2.5rem] border-red-100 shadow-2xl p-10 text-center space-y-6 bg-white">
          <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Quotation Unavailable</h2>
            <p className="text-slate-500 text-sm leading-relaxed">We encountered a system error while retrieving the pricing analysis. {error ? `Details: ${error}` : 'No project record found.'}</p>
          </div>
          <Button className="w-full h-14 gradient-button rounded-2xl text-lg shadow-sky-500/20" asChild>
            <Link href="/quotation-ai">Return to Start</Link>
          </Button>
        </Card>
      </main>
    );
  }

  const rooms = Array.from(new Set(bom.map(i => i.room)));
  const subtotal = bom.reduce((acc, curr) => acc + (Number(curr.line_total) || 0), 0);
  const taxRate = 0.0825; // 8.25% Tax
  const taxAmount = subtotal * taxRate;
  const deliveryCharge = subtotal > 0 ? 250 : 0; // Standardized logistics charge
  const total = subtotal + taxAmount + deliveryCharge;

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
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 px-8 h-20 flex items-center justify-between">
         <div className="flex items-center gap-6">
            <Link href={`/quotation-ai/review/${id}`}>
              <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-100 h-12 w-12 transition-colors">
                <ArrowLeft className="w-6 h-6" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">{project.project_name}</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-sky-50 text-sky-600 rounded">Analysis Complete</span>
                • {project.manufacturers?.name}
              </p>
            </div>
         </div>
         <div className="flex items-center gap-3">
            <Button variant="outline" className="rounded-xl border-slate-200 h-11 px-5 font-semibold text-slate-600">
               <Printer className="w-4 h-4 mr-2" />
               Print Quotation
            </Button>
            <Button className="gradient-button rounded-xl px-8 h-11 shadow-sky-500/10">
               <Download className="w-4 h-4 mr-2" />
               Export JSON
            </Button>
         </div>
      </header>

      <div className="max-w-7xl mx-auto mt-12 px-6 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
           {/* Detailed Cabinet Schedule */}
           <div className="lg:col-span-3 space-y-12">
              {rooms.length === 0 ? (
                <div className="bg-white p-24 rounded-[3rem] text-center border border-slate-100 shadow-xl">
                  <AlertCircle className="w-16 h-16 text-slate-100 mx-auto mb-6" />
                  <p className="text-slate-500 font-semibold text-lg">No pricing line items were generated.</p>
                  <p className="text-slate-400 text-sm mt-2">Please ensure cabinet codes were correctly extracted during the review step.</p>
                </div>
              ) : (
                rooms.map(room => (
                  <div key={room} className="space-y-4">
                    <div className="flex items-center justify-between px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white">
                            <Layout className="w-5 h-5" />
                          </div>
                          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{room}</h2>
                        </div>
                        <Badge variant="outline" className="text-[10px] bg-white text-slate-400 font-bold uppercase tracking-widest px-3 py-1">
                          {bom.filter(i => i.room === room).length} Units Identified
                        </Badge>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-2xl">
                        <Table>
                          <TableHeader className="bg-slate-50/50">
                            <TableRow className="border-slate-100 hover:bg-transparent">
                              <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 pl-8 h-16">Cabinet SKU / Code</TableHead>
                              <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400">Precision Level</TableHead>
                              <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Qty</TableHead>
                              <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Unit Pricing</TableHead>
                              <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-right pr-8">Ext. Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {bom.filter(i => i.room === room).map(item => (
                              <TableRow key={item.id} className="border-slate-50 hover:bg-slate-50/20 h-20 transition-colors">
                                <TableCell className="font-black text-slate-900 pl-8 text-lg">{item.sku}</TableCell>
                                <TableCell>
                                  <Badge className={cn("text-[10px] font-black py-1 px-2 uppercase tracking-tighter border-none", getSourceColor(item.price_source))}>
                                    {getSourceIcon(item.price_source)}
                                    {item.price_source.replace(/_/g, ' ')}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-center font-bold text-slate-700 text-base">{item.qty}</TableCell>
                                <TableCell className="text-right text-slate-500 font-mono text-base">${(Number(item.unit_price) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-right font-black text-sky-600 pr-8 font-mono text-lg">${(Number(item.line_total) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                    </div>
                  </div>
                ))
              )}
           </div>

           {/* High-Impact Investment Summary Sidebar */}
           <div className="space-y-8">
              <Card className="rounded-[3rem] border-slate-200 shadow-2xl overflow-hidden sticky top-28 bg-white transition-all hover:shadow-sky-500/10">
                 <CardHeader className="bg-slate-900 text-white p-10">
                    <CardTitle className="text-xl flex items-center gap-3 font-black uppercase tracking-tight">
                       <DollarSign className="w-6 h-6 text-sky-400" />
                       Investment Total
                    </CardTitle>
                 </CardHeader>
                 <CardContent className="p-10 space-y-10">
                    <div className="space-y-5">
                       <div className="flex justify-between text-sm text-slate-400 font-medium">
                          <span className="flex items-center gap-2.5">
                            <FileText className="w-4 h-4 text-slate-300" />
                            Material Subtotal
                          </span>
                          <span className="font-bold text-slate-900">${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                       </div>
                       <div className="flex justify-between text-sm text-slate-400 font-medium">
                          <span className="flex items-center gap-2.5">
                            <BadgePercent className="w-4 h-4 text-slate-300" />
                            Sales Tax (8.25%)
                          </span>
                          <span className="font-bold text-slate-900">${taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                       </div>
                       <div className="flex justify-between text-sm text-slate-400 font-medium">
                          <span className="flex items-center gap-2.5">
                            <Layout className="w-4 h-4 text-slate-300" />
                            Logistics & Delivery
                          </span>
                          <span className="font-bold text-slate-900">${deliveryCharge.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                       </div>
                       
                       <div className="h-px bg-slate-100 my-6" />
                       
                       <div className="flex flex-col items-end">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2">Final Quotation Investment</span>
                          <span className="text-5xl font-black text-sky-600 leading-none tracking-tighter font-mono">
                            ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                       </div>
                    </div>
                    
                    <div className="p-6 rounded-[2rem] bg-slate-50 border border-slate-100 space-y-5">
                       <div>
                          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">Manufacturer Partner</p>
                          <p className="text-base font-black text-slate-900">{project.manufacturers?.name || 'Standard Production'}</p>
                       </div>
                       <div className="grid grid-cols-1 gap-4">
                          <div className="flex justify-between items-center">
                             <span className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Match Accuracy</span>
                             <Badge className="bg-emerald-100 text-emerald-700 border-none font-black px-3 py-1">
                                {bom.length > 0 ? ((bom.filter(i => i.price_source !== 'NOT_FOUND').length / bom.length) * 100).toFixed(0) : 0}%
                             </Badge>
                          </div>
                          <div className="flex justify-between items-center">
                             <span className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Manual Price Required</span>
                             <Badge className={cn("border-none font-black px-3 py-1", bom.filter(i => i.price_source === 'NOT_FOUND').length > 0 ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-400")}>
                                {bom.filter(i => i.price_source === 'NOT_FOUND').length}
                             </Badge>
                          </div>
                       </div>
                    </div>

                    <Button className="w-full h-16 gradient-button rounded-2xl text-xl shadow-lg shadow-sky-500/20 group" asChild>
                       <Link href="/quotation-ai" className="flex items-center justify-center gap-3">
                         New Quotation
                       </Link>
                    </Button>
                 </CardContent>
              </Card>

              <div className="p-8 rounded-[2.5rem] bg-sky-50 border border-sky-100 text-center space-y-2">
                 <p className="text-[10px] font-black text-sky-600 uppercase tracking-[0.2em]">Precision Guarantee</p>
                 <p className="text-xs text-sky-700 font-medium leading-relaxed">AI-verified architectural takeoff cross-referenced with production pricing matrix for maximum estimator confidence.</p>
              </div>
           </div>
        </div>
      </div>
    </main>
  );
}
