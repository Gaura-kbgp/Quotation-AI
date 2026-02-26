
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
  SearchCode
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

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
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 px-8 h-20 flex items-center justify-between">
         <div className="flex items-center gap-6">
            <Link href={`/quotation-ai/review/${id}`}>
              <Button variant="ghost" size="icon" className="rounded-full h-12 w-12"><ArrowLeft className="w-6 h-6" /></Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{project.project_name}</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-sky-50 text-sky-600 rounded">Analysis Complete</span>
                • {manufacturerName}
              </p>
            </div>
         </div>
         <div className="flex items-center gap-3">
            <Button variant="outline" className="rounded-xl h-11 px-5 font-semibold text-slate-600"><Printer className="w-4 h-4 mr-2" /> Print</Button>
            <Button className="gradient-button rounded-xl px-8 h-11 shadow-sky-500/10"><Download className="w-4 h-4 mr-2" /> Export</Button>
         </div>
      </header>

      <div className="max-w-7xl mx-auto mt-12 px-6 grid grid-cols-1 lg:grid-cols-4 gap-10">
         <div className="lg:col-span-3 space-y-12">
            {rooms.map(room => (
              <div key={room} className="space-y-4">
                <div className="flex items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                      <Layout className="w-6 h-6 text-slate-900" />
                      <h2 className="text-xl font-black uppercase tracking-tight">{room}</h2>
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-xl">
                    <Table>
                      <TableHeader className="bg-slate-50/50">
                        <TableRow className="border-slate-100 h-16">
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 pl-8">Takeoff SKU</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400">Match Accuracy</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Qty</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Unit Price</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-right pr-8">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bom.filter(i => i.room === room).map(item => (
                          <TableRow key={item.id} className="border-slate-50 h-20 hover:bg-slate-50/20">
                            <TableCell className="pl-8">
                               <div>
                                  <p className="font-black text-slate-900 text-lg">{item.sku}</p>
                                  {item.matched_sku && item.matched_sku !== item.sku && (
                                    <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                       <SearchCode className="w-3 h-3" /> Matched: {item.matched_sku}
                                    </p>
                                  )}
                               </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={cn("text-[10px] font-black py-1 px-2 uppercase tracking-tighter border-none", getPrecisionColor(item.precision_level))}>
                                {item.precision_level === 'EXACT' ? <ShieldCheck className="w-3 h-3 mr-1" /> : <HelpCircle className="w-3 h-3 mr-1" />}
                                {item.precision_level}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center font-bold">{item.qty}</TableCell>
                            <TableCell className="text-right text-slate-500 font-mono">${(Number(item.unit_price) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-right font-black text-sky-600 pr-8 font-mono text-lg">${(Number(item.line_total) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                </div>
              </div>
            ))}
         </div>

         <div className="space-y-8">
            <Card className="rounded-[3rem] border-slate-200 shadow-2xl overflow-hidden sticky top-28 bg-white">
               <CardHeader className="bg-slate-900 text-white p-10">
                  <CardTitle className="text-xl flex items-center gap-3 font-black uppercase tracking-tight">
                     <DollarSign className="w-6 h-6 text-sky-400" /> Investment
                  </CardTitle>
               </CardHeader>
               <CardContent className="p-10 space-y-8">
                  <div className="space-y-4">
                     <div className="flex justify-between text-sm text-slate-500">
                        <span>Material Subtotal</span>
                        <span className="font-bold text-slate-900">${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                     </div>
                     <div className="flex justify-between text-sm text-slate-500">
                        <span>Sales Tax (8.25%)</span>
                        <span className="font-bold text-slate-900">${taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                     </div>
                     <div className="flex justify-between text-sm text-slate-500">
                        <span>Logistics & Delivery</span>
                        <span className="font-bold text-slate-900">${deliveryCharge.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                     </div>
                     <div className="h-px bg-slate-100 my-4" />
                     <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Final Total</span>
                        <span className="text-5xl font-black text-sky-600 font-mono">${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                     </div>
                  </div>
                  <Button className="w-full h-16 gradient-button rounded-2xl text-xl shadow-lg shadow-sky-500/20" asChild>
                     <Link href="/quotation-ai">New Quotation</Link>
                  </Button>
               </CardContent>
            </Card>
         </div>
      </div>
    </main>
  );
}
