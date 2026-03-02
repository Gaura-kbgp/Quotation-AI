"use client";

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
  ArrowLeft, 
  Layout, 
  UserCircle, 
  Calculator,
  Save,
  ArrowRight,
  ShieldCheck,
  Layers,
  Box,
  Package,
  ChevronDown,
  AlertCircle,
  Phone,
  RefreshCcw,
  ArrowDownCircle,
  ArrowUpCircle,
  Loader2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn, isPrimaryCabinet } from '@/lib/utils';
import { updateBomItemAction, updateProjectAction } from '../../actions';
import { useToast } from '@/hooks/use-toast';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface BomItem {
  id: string;
  sku: string;
  matched_sku: string;
  qty: number;
  unit_price: number;
  line_total: number;
  room: string;
  precision_level: string;
  is_billable?: boolean;
  manual_classification?: 'primary' | 'other';
}

interface BomManagerClientProps {
  id: string;
  project: any;
  initialBom: BomItem[];
  manufacturerName: string;
}

type WorkflowStep = 'pricing' | 'customer' | 'preview';

export function BomManagerClient({ id, project, initialBom, manufacturerName }: BomManagerClientProps) {
  const { toast } = useToast();
  const router = useRouter();
  
  const [bom, setBom] = useState<BomItem[]>(() => 
    initialBom.map(item => ({
      ...item,
      is_billable: item.is_billable ?? (isPrimaryCabinet(item.sku) && item.precision_level !== 'NOT_FOUND')
    }))
  );

  const [step, setStep] = useState<WorkflowStep>('pricing');
  const allRooms = useMemo(() => Array.from(new Set(bom.map(i => i.room))), [bom]);
  const [selectedRooms, setSelectedRooms] = useState<string[]>(project.bom_data?.selectedRooms || allRooms);
  const [discount, setDiscount] = useState(project.bom_data?.discount || 0);
  const [shipping, setShipping] = useState(project.bom_data?.shipping || 0);
  const [fuel, setFuel] = useState(project.bom_data?.fuel || 0);
  const [taxRate, setTaxRate] = useState(project.bom_data?.taxRate || 8.25);

  const [customer, setCustomer] = useState({
    name: project.bom_data?.customerName || '',
    address: project.bom_data?.customerAddress || '',
    phone: project.bom_data?.customerPhone || '',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isPricing, setIsPricing] = useState(false);

  const financials = useMemo(() => {
    const subtotal = bom
      .filter(item => selectedRooms.includes(item.room) && item.is_billable)
      .reduce((acc, curr) => acc + (Number(curr.unit_price) * Number(curr.qty) || 0), 0);

    const discountAmt = subtotal * (Number(discount) / 100);
    const afterDiscount = subtotal - discountAmt;
    const logisticsFees = Number(shipping) + Number(fuel);
    const taxableAmount = afterDiscount + logisticsFees;
    const taxes = taxableAmount * (Number(taxRate) / 100);
    const total = taxableAmount + taxes;

    return { subtotal, discountAmt, afterDiscount, logisticsFees, taxableAmount, taxes, total };
  }, [bom, selectedRooms, discount, shipping, fuel, taxRate]);

  const handleUpdateItem = (idx: number, updates: Partial<BomItem>) => {
    const newBom = [...bom];
    const item = { ...newBom[idx], ...updates };
    if ('unit_price' in updates || 'qty' in updates) {
      item.line_total = (Number(item.unit_price) || 0) * (Number(item.qty) || 0);
    }
    newBom[idx] = item;
    setBom(newBom);
  };

  const handleReprice = async () => {
    setIsPricing(true);
    try {
      const res = await fetch('/api/generate-bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, manufacturerId: project.manufacturer_id })
      });
      const result = await res.json();
      if (result.success) {
        toast({ title: 'Prices Updated' });
        router.refresh();
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Pricing Error', description: err.message });
    } finally {
      setIsPricing(false);
    }
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      await Promise.all(bom.map(item => 
        updateBomItemAction(item.id, { 
          sku: item.sku,
          qty: item.qty,
          unit_price: item.unit_price, 
          line_total: item.unit_price * item.qty,
          room: item.room,
          is_billable: item.is_billable
        })
      ));
      await updateProjectAction(id, {
        bom_data: {
          discount, shipping, fuel, taxRate,
          customerName: customer.name,
          customerAddress: customer.address,
          customerPhone: customer.phone,
          selectedRooms,
          materialSubtotal: financials.subtotal,
          grandTotal: financials.total
        }
      });
      toast({ title: 'Saved' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Save Failed', description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 pb-32 print:bg-white print:pb-0">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 px-8 h-20 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-6">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => router.back()}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{project.project_name}</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{manufacturerName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 mr-4">
            <button onClick={() => setStep('pricing')} className={cn("px-4 py-1.5 rounded-lg text-xs font-bold", step === 'pricing' ? "bg-white text-sky-600 shadow-sm" : "text-slate-400")}>1. Pricing</button>
            <button onClick={() => setStep('customer')} className={cn("px-4 py-1.5 rounded-lg text-xs font-bold", step === 'customer' ? "bg-white text-sky-600 shadow-sm" : "text-slate-400")}>2. Customer</button>
            <button onClick={() => setStep('preview')} className={cn("px-4 py-1.5 rounded-lg text-xs font-bold", step === 'preview' ? "bg-white text-sky-600 shadow-sm" : "text-slate-400")}>3. Preview</button>
          </div>
          <Button variant="outline" className="rounded-xl h-11 px-4 border-slate-200" onClick={handleReprice} disabled={isPricing}>
             {isPricing ? <Loader2 className="animate-spin w-4 h-4" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
             Match Prices
          </Button>
          <Button variant="outline" className="rounded-xl h-11 px-5 border-slate-200 font-bold" onClick={handleSaveAll} disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" /> Save
          </Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-8 mt-12 space-y-12 print:mt-0 print:px-0 print:max-w-none">
        {step === 'pricing' && (
          <div className="space-y-12 animate-in fade-in duration-500">
            {allRooms.map(room => {
              const roomItems = bom.filter(i => i.room === room);
              const primaryItems = roomItems.filter(i => isPrimaryCabinet(i.sku));
              const otherItems = roomItems.filter(i => !isPrimaryCabinet(i.sku));

              return (
                <section key={room} className={cn("space-y-6", !selectedRooms.includes(room) && "opacity-40 grayscale")}>
                  <div className="flex items-center gap-4 border-b border-slate-200 pb-4">
                    <Checkbox checked={selectedRooms.includes(room)} onCheckedChange={() => setSelectedRooms(prev => prev.includes(room) ? prev.filter(r => r !== room) : [...prev, room])} />
                    <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">{room}</h3>
                  </div>

                  <Table>
                    <TableHeader className="bg-slate-50/50">
                       <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Cabinets</TableHead>
                          <TableHead className="text-center w-24">Qty</TableHead>
                          <TableHead className="text-right w-32">Unit Price</TableHead>
                          <TableHead className="text-right w-32">Total</TableHead>
                       </TableRow>
                    </TableHeader>
                    <TableBody>
                      {primaryItems.map((item) => {
                        const itemIdx = bom.findIndex(b => b.id === item.id);
                        return (
                          <TableRow key={item.id} className={cn("h-16 border-b border-slate-50", !item.is_billable && "opacity-40")}>
                            <TableCell className="w-10">
                              <Checkbox checked={item.is_billable} onCheckedChange={(c) => handleUpdateItem(itemIdx, { is_billable: !!c })} />
                            </TableCell>
                            <TableCell className="w-1/2">
                              <div className="font-bold text-slate-900">{item.sku}</div>
                              <div className="text-[10px] font-bold text-sky-600 uppercase tracking-widest">{item.matched_sku}</div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Input type="number" value={item.qty} onChange={(e) => handleUpdateItem(itemIdx, { qty: parseInt(e.target.value) || 0 })} className="w-16 mx-auto text-center" />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input type="number" value={item.unit_price} onChange={(e) => handleUpdateItem(itemIdx, { unit_price: parseFloat(e.target.value) || 0 })} className="w-24 ml-auto text-right font-mono" />
                            </TableCell>
                            <TableCell className="text-right font-black font-mono">
                              ${item.line_total.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  {otherItems.length > 0 && (
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="other" className="border-none">
                        <AccordionTrigger className="px-4 py-3 bg-slate-50 rounded-xl hover:no-underline">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Accessories And Others ({otherItems.length})</span>
                        </AccordionTrigger>
                        <AccordionContent className="pt-4">
                           <Table>
                             <TableBody>
                                {otherItems.map((item) => {
                                  const itemIdx = bom.findIndex(b => b.id === item.id);
                                  return (
                                    <TableRow key={item.id} className="h-10 border-b border-slate-50">
                                      <TableCell className="w-10">
                                        <Checkbox checked={item.is_billable} onCheckedChange={(c) => handleUpdateItem(itemIdx, { is_billable: !!c })} />
                                      </TableCell>
                                      <TableCell className="text-xs font-bold">{item.sku}</TableCell>
                                      <TableCell className="text-right font-mono text-xs">${item.line_total.toFixed(2)}</TableCell>
                                    </TableRow>
                                  );
                                })}
                             </TableBody>
                           </Table>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                </section>
              );
            })}

            <section className="bg-slate-900 p-12 rounded-[2.5rem] shadow-xl text-white">
               <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-sky-400">Discount (%)</Label>
                    <Input type="number" value={discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} className="bg-white/10 border-none text-white h-12" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-sky-400">Logistics ($)</Label>
                    <Input type="number" value={shipping} onChange={e => setShipping(parseFloat(e.target.value) || 0)} className="bg-white/10 border-none text-white h-12" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-sky-400">Tax (%)</Label>
                    <Input type="number" value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} className="bg-white/10 border-none text-white h-12" />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={() => setStep('customer')} className="w-full h-12 gradient-button">Client Details</Button>
                  </div>
               </div>
               <div className="flex justify-end pt-8 border-t border-white/10 text-right">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-400 mb-2">Grand Total</p>
                    <p className="text-5xl font-black font-mono tracking-tighter">${financials.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
               </div>
            </section>
          </div>
        )}

        {step === 'customer' && (
          <div className="max-w-md mx-auto py-20 animate-in fade-in duration-500">
             <Card className="p-8 rounded-[2rem] shadow-2xl bg-white border border-slate-100">
                <h2 className="text-xl font-black text-slate-900 mb-6">Client Information</h2>
                <div className="space-y-5">
                   <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-slate-400">Contact Name</Label>
                      <Input value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})} className="h-11 bg-slate-50 border-none px-4" placeholder="Name" />
                   </div>
                   <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-slate-400">Address</Label>
                      <Input value={customer.address} onChange={e => setCustomer({...customer, address: e.target.value})} className="h-11 bg-slate-50 border-none px-4" placeholder="Address" />
                   </div>
                   <Button className="w-full h-12 gradient-button mt-4" onClick={() => setStep('preview')}>
                     Preview Proposal
                     <ArrowRight className="w-4 h-4 ml-2" />
                   </Button>
                </div>
             </Card>
          </div>
        )}

        {step === 'preview' && (
          <div className="animate-in fade-in duration-500 pb-20">
             <div className="flex justify-between items-center mb-10 print:hidden">
                <Button variant="ghost" onClick={() => setStep('customer')} className="font-bold text-slate-500"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
                <Button size="lg" className="gradient-button px-10 rounded-2xl font-bold" onClick={() => window.print()}><Printer className="w-5 h-5 mr-3" /> Print Proposal</Button>
             </div>
             
             <div className="print-container bg-white text-slate-900 p-20 shadow-2xl rounded-3xl">
                <div className="flex justify-between border-b-2 border-slate-900 pb-10 mb-10">
                   <h2 className="text-2xl font-black text-sky-600">KABS PRO</h2>
                   <div className="text-right">
                      <h1 className="text-4xl font-black tracking-tighter">QUOTATION</h1>
                      <p className="text-[11px] font-bold text-slate-500 uppercase">{manufacturerName}</p>
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-20 mb-20">
                   <div className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase text-sky-600">Customer</h4>
                      <p className="text-xl font-bold">{customer.name || '---'}</p>
                      <p className="text-slate-500 text-sm whitespace-pre-line">{customer.address || '---'}</p>
                   </div>
                   <div className="text-right">
                      <h4 className="text-[10px] font-black uppercase text-sky-600">Total</h4>
                      <p className="text-3xl font-black font-mono">${financials.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                   </div>
                </div>

                <div className="space-y-12">
                   {selectedRooms.map(room => {
                      const billableItems = bom.filter(i => i.room === room && i.is_billable);
                      if (billableItems.length === 0) return null;
                      return (
                        <div key={room} className="avoid-break">
                           <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 mb-4 border-b border-slate-100 pb-2">{room}</h3>
                           <Table>
                              <TableBody>
                                 {billableItems.map(item => (
                                    <TableRow key={item.id} className="border-b border-slate-50 h-10">
                                       <TableCell className="font-bold text-[11px]">{item.sku}</TableCell>
                                       <TableCell className="text-center text-[11px] w-12">{item.qty}</TableCell>
                                       <TableCell className="text-right font-mono text-[11px] font-bold">${item.unit_price.toFixed(2)}</TableCell>
                                       <TableCell className="text-right font-mono text-[11px] font-bold">${(item.unit_price * item.qty).toFixed(2)}</TableCell>
                                    </TableRow>
                                 ))}
                              </TableBody>
                           </Table>
                        </div>
                      )
                   })}
                </div>

                <div className="mt-20 pt-10 border-t-2 border-slate-900 flex justify-end text-right">
                   <div className="w-64 space-y-2">
                      <div className="flex justify-between text-[11px] font-bold uppercase text-slate-400">
                         <span>Subtotal</span>
                         <span className="text-slate-900 font-mono">${financials.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[13px] font-black uppercase text-slate-900 pt-3 border-t border-slate-100">
                         <span>Grand Total</span>
                         <span className="font-mono">${financials.total.toFixed(2)}</span>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>
    </main>
  );
}
