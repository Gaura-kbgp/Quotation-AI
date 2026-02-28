
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
  ChevronDown
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn, isPrimaryCabinet, detectCategory } from '@/lib/utils';
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
  is_billable?: boolean; // Local state for optional items
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
  
  // Initialize BOM with billable flag based on SKU prefix
  const [bom, setBom] = useState<BomItem[]>(() => 
    initialBom.map(item => ({
      ...item,
      is_billable: item.is_billable ?? isPrimaryCabinet(item.sku)
    }))
  );

  const [step, setStep] = useState<WorkflowStep>('pricing');
  
  // Unique rooms from BOM
  const allRooms = useMemo(() => Array.from(new Set(bom.map(i => i.room))), [bom]);
  
  // Selection state
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

  // Financial Calculations - STRICT FILTERING
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

    return {
      subtotal,
      discountAmt,
      afterDiscount,
      logisticsFees,
      taxableAmount,
      taxes,
      total
    };
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

  const handleToggleRoom = (room: string) => {
    setSelectedRooms(prev => 
      prev.includes(room) ? prev.filter(r => r !== room) : [...prev, room]
    );
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedRooms(checked ? allRooms : []);
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
          room: item.room
        })
      ));

      await updateProjectAction(id, {
        bom_data: {
          discount,
          shipping,
          fuel,
          taxRate,
          customerName: customer.name,
          customerAddress: customer.address,
          customerPhone: customer.phone,
          selectedRooms,
          materialSubtotal: financials.subtotal,
          grandTotal: financials.total
        }
      });

      toast({ title: 'Quotation Saved' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Save Failed', description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const validateWorkflow = () => {
    if (selectedRooms.length === 0) {
      toast({ 
        variant: 'destructive', 
        title: 'Selection Error', 
        description: 'Select at least one room.' 
      });
      return false;
    }
    return true;
  };

  return (
    <main className="min-h-screen bg-slate-50 pb-32 print:bg-white print:pb-0">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 px-8 h-20 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-6">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => {
            if (step === 'customer') setStep('pricing');
            else if (step === 'preview') setStep('customer');
            else router.back();
          }}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{project.project_name}</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              Manager • {manufacturerName}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 mr-4">
            <button onClick={() => setStep('pricing')} className={cn("px-4 py-1.5 rounded-lg text-xs font-bold", step === 'pricing' ? "bg-white text-sky-600 shadow-sm" : "text-slate-400")}>1. Pricing</button>
            <button onClick={() => { if(validateWorkflow()) setStep('customer') }} className={cn("px-4 py-1.5 rounded-lg text-xs font-bold", step === 'customer' ? "bg-white text-sky-600 shadow-sm" : "text-slate-400")}>2. Customer</button>
            <button onClick={() => { if(validateWorkflow()) setStep('preview') }} className={cn("px-4 py-1.5 rounded-lg text-xs font-bold", step === 'preview' ? "bg-white text-sky-600 shadow-sm" : "text-slate-400")}>3. Preview</button>
          </div>
          
          <Button variant="outline" className="rounded-xl h-11 px-5 border-slate-200 font-bold" onClick={handleSaveAll} disabled={isSaving}>
            {isSaving ? <Calculator className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Progress
          </Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-8 mt-12 space-y-12 print:mt-0 print:px-0 print:max-w-none">
        {step === 'pricing' && (
          <div className="space-y-12 animate-in fade-in duration-500">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Price Review</h2>
                <p className="text-slate-500">Only Primary Cabinets affect the subtotal by default.</p>
              </div>
              <Button onClick={() => { if(validateWorkflow()) setStep('customer') }} className="gradient-button h-12 px-8 rounded-2xl group">
                Customer Info
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>

            <div className="flex items-center justify-between bg-white px-8 py-4 rounded-2xl border border-slate-200 shadow-sm">
               <div className="flex items-center gap-3">
                  <Layers className="w-5 h-5 text-sky-500" />
                  <span className="text-sm font-bold text-slate-700">Project Areas ({allRooms.length})</span>
               </div>
               <div className="flex items-center gap-3">
                  <Checkbox 
                    id="global-select-all" 
                    checked={selectedRooms.length === allRooms.length}
                    onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                  />
                  <Label htmlFor="global-select-all" className="text-xs font-black uppercase tracking-widest text-slate-500 cursor-pointer">
                    {selectedRooms.length === allRooms.length ? 'Unselect All' : 'Select All Areas'}
                  </Label>
               </div>
            </div>

            {allRooms.map(room => {
              const roomItems = bom.filter(i => i.room === room);
              const primaryItems = roomItems.filter(i => isPrimaryCabinet(i.sku));
              const otherItems = roomItems.filter(i => !isPrimaryCabinet(i.sku));

              return (
                <section key={room} className={cn("space-y-6 transition-all", !selectedRooms.includes(room) && "opacity-40 grayscale")}>
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div className="flex items-center gap-4 w-full">
                      <Checkbox checked={selectedRooms.includes(room)} onCheckedChange={() => handleToggleRoom(room)} />
                      <div className="flex items-center gap-3">
                        <Layout className={cn("w-5 h-5", selectedRooms.includes(room) ? "text-sky-500" : "text-slate-300")} />
                        <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">{room}</h3>
                      </div>
                    </div>
                  </div>

                  <div className={cn(!selectedRooms.includes(room) && "pointer-events-none")}>
                    {/* Billable Section */}
                    <div className="space-y-2 mb-8">
                      <div className="flex items-center gap-2 text-sky-600 font-bold text-xs uppercase tracking-widest ml-4 mb-2">
                        <Box className="w-4 h-4" /> Billable Cabinets
                      </div>
                      <Table>
                        <TableBody>
                          {primaryItems.map((item) => {
                            const itemIdx = bom.findIndex(b => b.id === item.id);
                            return (
                              <TableRow key={item.id} className="h-16 hover:bg-white border-b border-slate-50">
                                <TableCell className="w-1/2">
                                   <Input 
                                     value={item.sku}
                                     onChange={(e) => handleUpdateItem(itemIdx, { sku: e.target.value.toUpperCase() })}
                                     className="font-bold text-slate-900 border-none bg-transparent h-auto p-0"
                                   />
                                   <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Ref: {item.matched_sku}</p>
                                </TableCell>
                                <TableCell className="text-center font-bold">
                                   <Input 
                                     type="number"
                                     value={item.qty}
                                     onChange={(e) => handleUpdateItem(itemIdx, { qty: parseInt(e.target.value) || 0 })}
                                     className="w-16 mx-auto text-center font-bold border-none bg-slate-50 h-9"
                                   />
                                </TableCell>
                                <TableCell className="text-right">
                                   <Input 
                                     type="number" 
                                     value={item.unit_price} 
                                     onChange={(e) => handleUpdateItem(itemIdx, { unit_price: parseFloat(e.target.value) || 0 })}
                                     className="w-24 ml-auto text-right font-mono font-bold bg-white h-9 border-slate-200"
                                   />
                                </TableCell>
                                <TableCell className="text-right font-black text-slate-900 pr-6 font-mono">
                                  ${(item.unit_price * item.qty).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Accessories Accordion */}
                    {otherItems.length > 0 && (
                      <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="other" className="border-none">
                          <AccordionTrigger className="px-4 py-3 bg-slate-50 rounded-xl hover:no-underline group">
                            <div className="flex items-center gap-3">
                              <Package className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Other Items ({otherItems.length})</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-4">
                            <Table>
                              <TableHeader>
                                <TableRow className="hover:bg-transparent border-b border-slate-100">
                                  <TableHead className="text-[9px] uppercase font-black pl-4">Charge</TableHead>
                                  <TableHead className="text-[9px] uppercase font-black">SKU</TableHead>
                                  <TableHead className="text-[9px] uppercase font-black text-center">Qty</TableHead>
                                  <TableHead className="text-[9px] uppercase font-black text-right">Price</TableHead>
                                  <TableHead className="text-[9px] uppercase font-black text-right pr-6">Total</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {otherItems.map((item) => {
                                  const itemIdx = bom.findIndex(b => b.id === item.id);
                                  return (
                                    <TableRow key={item.id} className={cn("h-12 border-b border-slate-50/50", !item.is_billable && "text-slate-400")}>
                                      <TableCell className="pl-4">
                                        <Checkbox 
                                          checked={item.is_billable} 
                                          onCheckedChange={(checked) => handleUpdateItem(itemIdx, { is_billable: !!checked })}
                                        />
                                      </TableCell>
                                      <TableCell className="font-bold">{item.sku}</TableCell>
                                      <TableCell className="text-center font-mono">{item.qty}</TableCell>
                                      <TableCell className="text-right">
                                        <Input 
                                          type="number" 
                                          value={item.unit_price}
                                          onChange={(e) => handleUpdateItem(itemIdx, { unit_price: parseFloat(e.target.value) || 0 })}
                                          className="w-20 ml-auto h-7 text-right text-xs font-mono"
                                        />
                                      </TableCell>
                                      <TableCell className="text-right font-bold pr-6">
                                        ${(item.unit_price * item.qty).toFixed(2)}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    )}
                  </div>
                </section>
              );
            })}

            <section className="bg-white p-12 rounded-[2.5rem] border border-slate-200 shadow-xl space-y-12">
               <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Dealer Discount (%)</Label>
                    <Input type="number" value={discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} className="h-12 rounded-xl font-bold bg-slate-50 border-none" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Shipping Charge ($)</Label>
                    <Input type="number" value={shipping} onChange={e => setShipping(parseFloat(e.target.value) || 0)} className="h-12 rounded-xl font-bold bg-slate-50 border-none" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Fuel Surcharge ($)</Label>
                    <Input type="number" value={fuel} onChange={e => setFuel(parseFloat(e.target.value) || 0)} className="h-12 rounded-xl font-bold bg-slate-50 border-none" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Sales Tax Rate (%)</Label>
                    <Input type="number" value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} className="h-12 rounded-xl font-bold bg-slate-50 border-none" />
                  </div>
               </div>

               <div className="flex justify-end pt-8 border-t border-slate-100">
                  <div className="w-full md:w-96 space-y-4">
                     <div className="space-y-3">
                        <div className="flex justify-between items-center text-slate-500">
                           <span className="text-[10px] font-bold uppercase">Material Subtotal</span>
                           <span className="font-mono text-lg font-bold text-slate-900">${financials.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        {discount > 0 && (
                          <div className="flex justify-between items-center text-emerald-600">
                             <span className="text-[10px] font-bold uppercase">Discount ({discount}%)</span>
                             <span className="font-mono text-lg font-bold">-${financials.discountAmt.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center text-slate-500">
                           <span className="text-[10px] font-bold uppercase">Logistics Fees</span>
                           <span className="font-mono text-lg font-bold text-slate-900">${financials.logisticsFees.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-500">
                           <span className="text-[10px] font-bold uppercase">Taxes ({taxRate}%)</span>
                           <span className="font-mono text-lg font-bold text-slate-900">${financials.taxes.toFixed(2)}</span>
                        </div>
                     </div>

                     <div className="bg-slate-900 p-8 rounded-[2rem] text-white">
                        <div className="flex justify-between items-baseline">
                           <span className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-400">Total Investment</span>
                           <span className="text-4xl font-black font-mono tracking-tighter">
                              ${financials.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                           </span>
                        </div>
                     </div>
                  </div>
               </div>
            </section>
          </div>
        )}

        {step === 'customer' && (
          <div className="max-w-3xl mx-auto py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <Card className="rounded-[3rem] p-12 border-slate-100 shadow-2xl bg-white text-center">
                <div className="w-20 h-20 rounded-3xl bg-sky-50 flex items-center justify-center text-sky-600 mx-auto mb-6"><UserCircle className="w-12 h-12" /></div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Customer Intake</h2>
                <div className="space-y-8 text-left mt-12">
                   <div className="space-y-3">
                      <Label className="text-xs font-black uppercase text-slate-400">Client Name</Label>
                      <Input placeholder="John & Jane Doe" value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})} className="h-16 rounded-2xl bg-slate-50 border-none font-bold text-xl px-6" />
                   </div>
                   <div className="space-y-3">
                      <Label className="text-xs font-black uppercase text-slate-400">Site Address</Label>
                      <Input placeholder="123 Cabinetry Way" value={customer.address} onChange={e => setCustomer({...customer, address: e.target.value})} className="h-16 rounded-2xl bg-slate-50 border-none font-bold text-xl px-6" />
                   </div>
                   <div className="space-y-3">
                      <Label className="text-xs font-black uppercase text-slate-400">Phone</Label>
                      <Input placeholder="(555) 0123-4567" value={customer.phone} onChange={e => setCustomer({...customer, phone: e.target.value})} className="h-16 rounded-2xl bg-slate-50 border-none font-bold text-xl px-6" />
                   </div>
                   <div className="flex gap-4 pt-6">
                     <Button variant="ghost" className="h-16 px-8 rounded-[2rem] font-bold text-slate-500" onClick={() => setStep('pricing')}>Back</Button>
                     <Button className="flex-1 h-16 rounded-[2rem] gradient-button text-xl group" onClick={() => { if(validateWorkflow()) setStep('preview') }}>
                        Preview Final Bill
                        <ArrowRight className="w-6 h-6 ml-3 group-hover:translate-x-1 transition-transform" />
                     </Button>
                   </div>
                </div>
             </Card>
          </div>
        )}

        {step === 'preview' && (
          <div className="animate-in fade-in duration-500">
             <div className="flex justify-between items-center mb-6 print:hidden">
                <Button variant="ghost" onClick={() => setStep('customer')} className="font-bold text-slate-500"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-lg font-bold" onClick={handleSaveAll}><Save className="w-4 h-4 mr-2" /> Save</Button>
                  <Button size="sm" className="gradient-button px-6 rounded-lg font-bold" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> Print PDF</Button>
                </div>
             </div>

             <div className="print-container bg-white font-body text-slate-900">
                <div className="grid grid-cols-2 gap-8 border-b-2 border-slate-900 pb-4 mb-6 items-start">
                   <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-slate-900 flex items-center justify-center text-white font-black text-2xl">{manufacturerName.charAt(0)}</div>
                        <h2 className="text-[16px] font-bold text-slate-900 uppercase">{manufacturerName} ORDER</h2>
                      </div>
                      <div className="pt-2">
                         <p className="text-[11px] font-bold text-slate-900">KABS Premium Cabinetry Co.</p>
                         <p className="text-[10px] text-slate-500">102 West Montgomery St, TX • (800) 555-0199</p>
                      </div>
                   </div>
                   <div className="text-right space-y-4">
                      <h1 className="text-[18px] font-black text-slate-900 uppercase">QUOTATION</h1>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-left ml-auto max-w-[240px]">
                         <h4 className="text-[9px] font-bold uppercase text-slate-400">Bill To</h4>
                         <p className="text-[11px] font-bold text-slate-900">{customer.name || 'Client'}</p>
                         <p className="text-[10px] text-slate-600">{customer.address || 'N/A'}</p>
                      </div>
                   </div>
                </div>

                {selectedRooms.map(room => {
                  const billableItems = bom.filter(i => i.room === room && i.is_billable);
                  const roomTotal = billableItems.reduce((acc, i) => acc + (i.unit_price * i.qty), 0);
                  if (billableItems.length === 0) return null;

                  return (
                    <div key={room} className="mb-8 avoid-break">
                      <h3 className="bg-slate-100 px-3 py-1.5 rounded text-[14px] font-bold text-slate-900 uppercase mb-3">{room}</h3>
                      <Table className="border-collapse">
                        <TableHeader>
                          <TableRow className="h-6 border-b-2 border-slate-200 hover:bg-transparent">
                            <TableHead className="font-bold text-slate-900 text-[11px] uppercase px-2 w-1/2">Product Code</TableHead>
                            <TableHead className="font-bold text-slate-900 text-[11px] uppercase px-2 text-center w-16">Qty</TableHead>
                            <TableHead className="font-bold text-slate-900 text-[11px] uppercase px-2 text-right">Price</TableHead>
                            <TableHead className="font-bold text-slate-900 text-[11px] uppercase px-2 text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {billableItems.map(item => (
                            <TableRow key={item.id} className="h-6 border-b border-slate-100 hover:bg-transparent">
                              <TableCell className="font-bold text-slate-800 py-1 px-2 text-[9.5px] uppercase">{item.sku}</TableCell>
                              <TableCell className="text-center font-bold text-slate-600 py-1 px-2 text-[9.5px]">{item.qty}</TableCell>
                              <TableCell className="text-right font-mono text-[9.5px] text-slate-500 py-1 px-2">${item.unit_price.toFixed(2)}</TableCell>
                              <TableCell className="text-right font-mono font-bold text-slate-900 py-1 px-2 text-[9.5px]">${(item.unit_price * item.qty).toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <div className="flex justify-end pt-2 border-t border-slate-200">
                         <span className="text-[10px] font-bold uppercase text-slate-400 mr-4">Area Total</span>
                         <span className="text-[12px] font-bold font-mono text-slate-900">${roomTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}

                <div className="mt-12 pt-6 border-t-2 border-slate-900 avoid-break flex justify-end">
                   <div className="w-72 space-y-3">
                      <div className="flex justify-between items-center text-slate-500 text-[10px] font-bold uppercase">
                         <span>Subtotal</span>
                         <span className="font-mono text-[11px]">${financials.subtotal.toFixed(2)}</span>
                      </div>
                      {discount > 0 && (
                        <div className="flex justify-between items-center text-emerald-600 text-[10px] font-bold uppercase">
                           <span>Discount ({discount}%)</span>
                           <span className="font-mono text-[11px]">-${financials.discountAmt.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-slate-500 text-[10px] font-bold uppercase">
                         <span>Logistics</span>
                         <span className="font-mono text-[11px]">${financials.logisticsFees.toFixed(2)}</span>
                      </div>
                      <div className="bg-slate-900 p-5 rounded-lg text-white">
                         <div className="flex justify-between items-baseline">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-400">Grand Total</span>
                            <span className="text-[18px] font-black font-mono">${financials.total.toFixed(2)}</span>
                         </div>
                      </div>
                   </div>
                </div>
                <div className="print-footer">Powered by KABS AI</div>
             </div>
          </div>
        )}
      </div>
    </main>
  );
}
