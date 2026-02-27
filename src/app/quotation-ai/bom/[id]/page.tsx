
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
  BadgePercent,
  Factory,
  SearchCode,
  Calendar,
  User,
  Hash
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export default async function BomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerSupabase();

  let project = null;
  let manufacturerName = 'Standard Production';
  let bom: any[] = [];
  let error: string | null = null;

  try {
    const [pRes, bRes] = await Promise.all([
      supabase.from('quotation_projects').select('*').eq('id', id).single(),
      supabase.from('quotation_boms').select('*').eq('project_id', id).order('room')
    ]);

    if (pRes.error) throw new Error(pRes.error.message);
    project = pRes.data;
    bom = bRes.data || [];

    if (project?.manufacturer_id) {
      const { data: mData } = await supabase
        .from('manufacturers')
        .select('name')
        .eq('id', project.manufacturer_id)
        .single();
      if (mData) manufacturerName = mData.name;
    }
  } catch (err: any) {
    error = err.message;
  }

  if (error || !project) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-8 text-center">
        <Card className="max-w-md p-12 rounded-[3rem]">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Quotation Error</h2>
          <p className="text-slate-500 mb-6">{error}</p>
          <Button asChild className="gradient-button rounded-xl"><Link href="/quotation-ai">Back to Home</Link></Button>
        </Card>
      </main>
    );
  }

  const rooms = Array.from(new Set(bom.map(i => i.room)));
  const subtotal = bom.reduce((acc, curr) => acc + (Number(curr.line_total) || 0), 0);
  const taxAmount = subtotal * 0.0825;
  const deliveryCharge = subtotal > 0 ? 250 : 0;
  const total = subtotal + taxAmount + deliveryCharge;

  const getPrecisionColor = (level: string) => {
    switch(level) {
      case 'EXACT': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'PARTIAL': return 'bg-sky-50 text-sky-700 border-sky-100';
      case 'FUZZY': return 'bg-purple-50 text-purple-700 border-purple-100';
      default: return 'bg-red-50 text-red-700 border-red-100';
    }
  };

  return (
    <main className="min-h-screen bg-white text-slate-900 pb-32">
      {/* Sticky Top Bar for Navigation Actions */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-100 px-8 h-20 flex items-center justify-between print:hidden">
         <div className="flex items-center gap-6">
            <Link href={`/quotation-ai/review/${id}`}>
              <Button variant="ghost" size="icon" className="rounded-full h-12 w-12"><ArrowLeft className="w-6 h-6" /></Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{project.project_name}</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-2">
                Quotation Preview • {manufacturerName}
              </p>
            </div>
         </div>
         <div className="flex items-center gap-3">
            <Button variant="outline" className="rounded-xl h-11 px-5 font-semibold text-slate-600" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" /> Print PDF
            </Button>
            <Button className="gradient-button rounded-xl px-8 h-11 shadow-sky-500/10">
              <Download className="w-4 h-4 mr-2" /> Export XLSX
            </Button>
         </div>
      </header>

      <div className="max-w-5xl mx-auto px-8 mt-16 space-y-16">
        {/* Invoice Header Information */}
        <section className="flex flex-col md:flex-row justify-between items-start gap-12 bg-slate-50/50 p-12 rounded-[2.5rem] border border-slate-100">
           <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-sky-600 flex items-center justify-center text-white font-black text-xl">K</div>
                <span className="font-bold text-2xl tracking-tight">KABS Quotation</span>
              </div>
              
              <div className="space-y-1">
                 <h2 className="text-4xl font-black text-slate-900 tracking-tighter">{project.project_name}</h2>
                 <p className="text-slate-500 font-medium">Professional Cabinetry Takeoff & Estimation</p>
              </div>

              <div className="flex flex-wrap gap-8 pt-4">
                 <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-bold text-slate-600">{new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-bold text-slate-600 uppercase tracking-wider">{id.substring(0, 8)}</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <Factory className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-bold text-slate-600">{manufacturerName}</span>
                 </div>
              </div>
           </div>

           <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm w-full md:w-72">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-3">Total Investment</p>
              <p className="text-4xl font-black text-sky-600 font-mono tracking-tighter">
                ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <Separator className="my-4" />
              <p className="text-xs text-slate-500 leading-relaxed font-medium">Includes material subtotal, logistics, and applicable taxes.</p>
           </div>
        </section>

        {/* Line Items by Room */}
        <section className="space-y-20">
          {rooms.map(room => (
            <div key={room} className="space-y-6">
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4">
                <div className="flex items-center gap-4">
                  <Layout className="w-6 h-6 text-slate-900" />
                  <h3 className="text-2xl font-black uppercase tracking-tight text-slate-900">{room}</h3>
                </div>
                <Badge variant="outline" className="rounded-full px-4 border-slate-200 text-slate-500 font-bold uppercase tracking-widest text-[10px]">
                  {bom.filter(i => i.room === room).length} Units
                </Badge>
              </div>

              <Table className="border-collapse">
                <TableHeader>
                  <TableRow className="h-14 border-b border-slate-200 hover:bg-transparent">
                    <TableHead className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 w-1/2">Takeoff Description / SKU</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 text-center">Qty</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 text-right">Unit Price</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 text-right pr-6">Line Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bom.filter(i => i.room === room).map((item, idx) => (
                    <TableRow key={item.id} className={cn(
                      "h-20 border-b border-slate-50 hover:bg-slate-50/50 transition-colors",
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                    )}>
                      <TableCell className="py-6">
                         <div className="space-y-1">
                            <p className="font-black text-slate-900 text-lg">{item.sku}</p>
                            <div className="flex items-center gap-3">
                               {item.matched_sku && item.matched_sku !== item.sku && (
                                 <p className="text-[10px] text-slate-400 flex items-center gap-1 font-bold">
                                    <SearchCode className="w-3 h-3" /> MATCH: {item.matched_sku}
                                 </p>
                               )}
                               <Badge className={cn("text-[9px] font-black py-0.5 px-1.5 uppercase tracking-tighter border-none rounded-sm", getPrecisionColor(item.precision_level))}>
                                  {item.precision_level}
                               </Badge>
                            </div>
                         </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-black text-slate-900">{item.qty}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-500">
                        ${(Number(item.unit_price) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-black text-slate-900 pr-6 font-mono text-lg">
                        ${(Number(item.line_total) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </section>

        {/* Grand Total Invoice Summary */}
        <section className="pt-16 border-t-2 border-slate-900">
           <div className="flex flex-col md:flex-row justify-between items-start gap-16">
              <div className="flex-1 space-y-4 max-w-md">
                 <h4 className="text-sm font-black uppercase tracking-widest text-slate-900">Terms & Conditions</h4>
                 <p className="text-xs text-slate-500 leading-relaxed">
                    This quotation is valid for 30 days. Pricing is based on the architectural takeoff provided. 
                    Any structural changes to floor plans or interior elevations after the date of this quotation 
                    may result in pricing adjustments. Delivery logistics assume clear site access.
                 </p>
                 <div className="flex gap-4 pt-4 print:hidden">
                    <Button variant="outline" className="rounded-xl font-bold h-12 px-8" asChild>
                       <Link href="/quotation-ai">Create New Project</Link>
                    </Button>
                 </div>
              </div>

              <div className="w-full md:w-96 space-y-6">
                 <div className="space-y-3">
                    <div className="flex justify-between items-center text-slate-500">
                       <span className="text-xs font-bold uppercase tracking-widest">Material Subtotal</span>
                       <span className="font-mono text-lg font-bold text-slate-900">${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-500">
                       <span className="text-xs font-bold uppercase tracking-widest">Logistics & Handling</span>
                       <span className="font-mono text-lg font-bold text-slate-900">${deliveryCharge.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-500">
                       <span className="text-xs font-bold uppercase tracking-widest">Estimated Sales Tax (8.25%)</span>
                       <span className="font-mono text-lg font-bold text-slate-900">${taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                 </div>

                 <div className="bg-slate-900 p-8 rounded-[2rem] text-white space-y-2">
                    <div className="flex justify-between items-baseline">
                       <span className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-400">Grand Total</span>
                       <span className="text-4xl font-black font-mono tracking-tighter">
                          ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                       </span>
                    </div>
                 </div>
                 
                 <div className="text-center pt-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">Authorized Quotation Engine v21.4</p>
                 </div>
              </div>
           </div>
        </section>
      </div>

      <footer className="mt-32 border-t border-slate-100 py-12 text-center text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 print:hidden">
        &copy; {new Date().getFullYear()} KABS Inc. Precision Architectural Estimating.
      </footer>
    </main>
  );
}
