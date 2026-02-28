"use client";

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
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
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  ShieldCheck,
  Building2,
  Phone,
  MapPin,
  CalendarDays,
  FileText,
  Box
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn, detectCategory } from '@/lib/utils';
import { updateBomItemAction, updateProjectAction } from '../../actions';
import { useToast } from '@/hooks/use-toast';

interface BomItem {
  id: string;
  sku: string;
  matched_sku: string;
  qty: number;
  unit_price: number;
  line_total: number;
  room: string;
  precision_level: string;
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
  const [bom, setBom] = useState<BomItem[]>(initialBom);
  const [step, setStep] = useState<WorkflowStep>('pricing');
  
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

  const materialSubtotal = useMemo(() => 
    bom.reduce((acc, curr) => acc + (Number(curr.unit_price) * Number(curr.qty) || 0), 0),
    [bom]
  );

  const discountAmount = useMemo(() => 
    materialSubtotal * (Number(discount) / 100),
    [materialSubtotal, discount]
  );

  const adjustedSubtotal = materialSubtotal - discountAmount;
  const taxAmount = (adjustedSubtotal + Number(shipping) + Number(fuel)) * (Number(taxRate) / 100);
  const grandTotal = adjustedSubtotal + Number(shipping) + Number(fuel) + taxAmount;

  const handleUpdateItem = (idx: number, updates: Partial<BomItem>) => {
    const newBom = [...bom];
    const item = { ...newBom[idx], ...updates };
    if ('unit_price' in updates || 'qty' in updates) {
      item.line_total = (Number(item.unit_price) || 0) * (Number(item.qty) || 0);
    }
    newBom[idx] = item;
    setBom(newBom);
  };

  const handleUpdateRoomName = (oldName: string, newName: string) => {
    setBom(prev => prev.map(item => 
      item.room === oldName ? { ...item, room: newName } : item
    ));
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
          materialSubtotal,
          grandTotal
        }
      });

      toast({ title: 'Quotation Saved', description: 'All changes and customer data synced.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Save Failed', description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const rooms = Array.from(new Set(bom.map(i => i.room)));

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
            <button 
              onClick={() => setStep('pricing')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                step === 'pricing' ? "bg-white text-sky-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              1. Pricing
            </button>
            <button 
              onClick={() => setStep('customer')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                step === 'customer' ? "bg-white text-sky-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              2. Customer
            </button>
            <button 
              onClick={() => setStep('preview')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                step === 'preview' ? "bg-white text-sky-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              3. Preview
            </button>
          </div>
          
          <Button 
            variant="outline" 
            className="rounded-xl h-11 px-5 border-slate-200 font-bold" 
            onClick={handleSaveAll}
            disabled={isSaving}
          >
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
                <p className="text-slate-500">Edit SKU, quantities, and pricing details for each project area.</p>
              </div>
              <Button onClick={() => setStep('customer')} className="gradient-button h-12 px-8 rounded-2xl group">
                Customer Info
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>

            {rooms.map(room => (
              <section key={room} className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                  <div className="flex items-center gap-3 w-full max-w-sm">
                    <Layout className="w-5 h-5 text-sky-500 shrink-0" />
                    <Input 
                      value={room}
                      onChange={(e) => handleUpdateRoomName(room, e.target.value)}
                      className="text-xl font-black uppercase tracking-tight text-slate-900 border-none bg-transparent focus-visible:ring-1 focus-visible:ring-sky-100 p-0 h-auto no-truncate"
                    />
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow className="h-12 border-b border-slate-200 hover:bg-transparent">
                      <TableHead className="text-[10px] font-black uppercase text-slate-400 w-1/2">Cabinet Code</TableHead>
                      <TableHead className="text-[10px] font-black uppercase text-slate-400 text-center">Qty</TableHead>
                      <TableHead className="text-[10px] font-black uppercase text-slate-400 text-right">Unit Price ($)</TableHead>
                      <TableHead className="text-[10px] font-black uppercase text-slate-400 text-right pr-6">Line Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bom.filter(i => i.room === room).map((item) => {
                      const itemIdx = bom.findIndex(b => b.id === item.id);
                      return (
                        <TableRow key={item.id} className="h-20 hover:bg-white border-b border-slate-50">
                          <TableCell className="py-4">
                             <Input 
                               value={item.sku}
                               onChange={(e) => handleUpdateItem(itemIdx, { sku: e.target.value.toUpperCase() })}
                               className="font-bold text-slate-900 border-none bg-transparent focus-visible:ring-1 focus-visible:ring-sky-100 p-0 h-auto"
                             />
                             <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Ref: {item.matched_sku}</p>
                          </TableCell>
                          <TableCell className="text-center font-bold">
                             <Input 
                               type="number"
                               value={item.qty}
                               onChange={(e) => handleUpdateItem(itemIdx, { qty: parseInt(e.target.value) || 0 })}
                               className="w-16 mx-auto text-center font-bold border-none bg-slate-50 rounded-lg h-9 focus-visible:ring-1 focus-visible:ring-sky-500"
                             />
                          </TableCell>
                          <TableCell className="text-right">
                             <Input 
                               type="number" 
                               value={item.unit_price} 
                               onChange={(e) => handleUpdateItem(itemIdx, { unit_price: parseFloat(e.target.value) || 0 })}
                               className="w-24 ml-auto text-right font-mono font-bold bg-white h-9 rounded-lg border-slate-200 shadow-sm"
                             />
                          </TableCell>
                          <TableCell className="text-right font-black text-slate-900 pr-6 font-mono">
                            ${(item.unit_price * item.qty).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </section>
            ))}

            <section className="bg-white p-12 rounded-[2.5rem] border border-slate-200 shadow-xl space-y-12">
               <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dealer Discount (%)</Label>
                    <Input 
                      type="number" 
                      value={discount} 
                      onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                      className="h-12 rounded-xl font-bold bg-slate-50 border-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Shipping Charge ($)</Label>
                    <Input 
                      type="number" 
                      value={shipping} 
                      onChange={e => setShipping(parseFloat(e.target.value) || 0)}
                      className="h-12 rounded-xl font-bold bg-slate-50 border-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fuel Surcharge ($)</Label>
                    <Input 
                      type="number" 
                      value={fuel} 
                      onChange={e => setFuel(parseFloat(e.target.value) || 0)}
                      className="h-12 rounded-xl font-bold bg-slate-50 border-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sales Tax Rate (%)</Label>
                    <Input 
                      type="number" 
                      value={taxRate} 
                      onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                      className="h-12 rounded-xl font-bold bg-slate-50 border-none"
                    />
                  </div>
               </div>

               <div className="flex flex-col md:flex-row justify-between items-start gap-12 pt-8 border-t border-slate-100">
                  <div className="flex-1 space-y-4 max-w-md">
                     <h4 className="text-sm font-black uppercase tracking-widest text-slate-900">Live Recalculation</h4>
                     <p className="text-xs text-slate-500 leading-relaxed font-medium">
                        Material subtotal is adjusted by dealer discount before logistics and taxes are applied.
                     </p>
                  </div>

                  <div className="w-full md:w-96 space-y-4">
                     <div className="space-y-3">
                        <div className="flex justify-between items-center text-slate-500">
                           <span className="text-[10px] font-bold uppercase tracking-widest">Subtotal</span>
                           <span className="font-mono text-lg font-bold text-slate-900">${materialSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        {discount > 0 && (
                          <div className="flex justify-between items-center text-emerald-600">
                             <span className="text-[10px] font-bold uppercase tracking-widest">Discount ({discount}%)</span>
                             <span className="font-mono text-lg font-bold">-${discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center text-slate-500">
                           <span className="text-[10px] font-bold uppercase tracking-widest">Logistics Fees</span>
                           <span className="font-mono text-lg font-bold text-slate-900">${(Number(shipping) + Number(fuel)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-500">
                           <span className="text-[10px] font-bold uppercase tracking-widest">Taxes ({taxRate}%)</span>
                           <span className="font-mono text-lg font-bold text-slate-900">${taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                     </div>

                     <div className="bg-slate-900 p-8 rounded-[2rem] text-white">
                        <div className="flex justify-between items-baseline">
                           <span className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-400">Total Investment</span>
                           <span className="text-4xl font-black font-mono tracking-tighter">
                              ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                <div className="w-20 h-20 rounded-3xl bg-sky-50 flex items-center justify-center text-sky-600 mx-auto mb-6">
                   <UserCircle className="w-12 h-12" />
                </div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Customer Intake</h2>
                <p className="text-slate-500 mb-12">These details will appear on the final bill header.</p>

                <div className="space-y-8 text-left">
                   <div className="space-y-3">
                      <Label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Client Name / Attention To</Label>
                      <Input 
                        placeholder="e.g. John & Jane Doe" 
                        value={customer.name}
                        onChange={e => setCustomer({...customer, name: e.target.value})}
                        className="h-16 rounded-2xl bg-slate-50 border-none font-bold text-xl px-6 focus-visible:ring-sky-500"
                      />
                   </div>
                   <div className="space-y-3">
                      <Label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Project Site Address</Label>
                      <Input 
                        placeholder="e.g. 123 Cabinetry Way, Suite 400" 
                        value={customer.address}
                        onChange={e => setCustomer({...customer, address: e.target.value})}
                        className="h-16 rounded-2xl bg-slate-50 border-none font-bold text-xl px-6 focus-visible:ring-sky-500"
                      />
                   </div>
                   <div className="space-y-3">
                      <Label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Contact Phone</Label>
                      <Input 
                        placeholder="e.g. (555) 0123-4567" 
                        value={customer.phone}
                        onChange={e => setCustomer({...customer, phone: e.target.value})}
                        className="h-16 rounded-2xl bg-slate-50 border-none font-bold text-xl px-6 focus-visible:ring-sky-500"
                      />
                   </div>

                   <div className="flex gap-4 pt-6">
                     <Button variant="ghost" className="h-16 px-8 rounded-[2rem] font-bold text-slate-500" onClick={() => setStep('pricing')}>
                        Back to Pricing
                     </Button>
                     <Button className="flex-1 h-16 rounded-[2rem] gradient-button text-xl group" onClick={() => setStep('preview')}>
                        Preview Final Bill
                        <ArrowRight className="w-6 h-6 ml-3 group-hover:translate-x-1 transition-transform" />
                     </Button>
                   </div>
                </div>
             </Card>
          </div>
        )}

        {step === 'preview' && (
          <div className="animate-in fade-in duration-500 print:bg-white print:p-0">
             <div className="flex justify-between items-center mb-6 print:hidden">
                <Button variant="ghost" onClick={() => setStep('customer')} className="font-bold text-slate-500">
                   <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-lg font-bold" onClick={handleSaveAll}>
                    <Save className="w-4 h-4 mr-2" /> Save
                  </Button>
                  <Button size="sm" className="gradient-button px-6 rounded-lg font-bold" onClick={() => window.print()}>
                    <Printer className="w-4 h-4 mr-2" /> Print PDF (A4)
                  </Button>
                </div>
             </div>

             <div className="bg-white print:p-0 font-body text-slate-900 max-w-none">
                <div className="flex justify-between items-start gap-8 border-b-2 border-slate-900 pb-4 mb-4">
                   <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-12 h-12 rounded-lg bg-slate-900 flex items-center justify-center text-white font-black text-2xl">
                          {manufacturerName.charAt(0)}
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-slate-900 uppercase tracking-tight">{manufacturerName} ORDER</h2>
                          <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-slate-500">
                             <ShieldCheck className="w-3 h-3 text-sky-600" />
                             Authorized Facility
                          </div>
                        </div>
                      </div>
                      <div className="space-y-0.5">
                         <h4 className="text-[10px] font-bold uppercase text-slate-900">Dealer</h4>
                         <p className="text-[11px] font-medium text-slate-700">KABS Premium Cabinetry Co.</p>
                         <p className="text-[10px] text-slate-500">102 West Montgomery St, TX • (800) 555-0199</p>
                      </div>
                   </div>

                   <div className="text-right space-y-4 flex-1">
                      <div>
                        <h1 className="text-2xl font-black text-slate-900 uppercase">QUOTATION</h1>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-normal">Ref: {project.project_name}</p>
                      </div>
                      
                      <div className="flex justify-end gap-6">
                        <div className="text-left">
                          <h4 className="text-[9px] font-bold uppercase text-slate-400">Date</h4>
                          <p className="text-[11px] font-bold text-slate-900">{new Date().toLocaleDateString()}</p>
                        </div>
                        <div className="text-left">
                          <h4 className="text-[9px] font-bold uppercase text-slate-400">Project Type</h4>
                          <p className="text-[11px] font-bold text-slate-900">Takeoff</p>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-left ml-auto max-w-[240px]">
                         <h4 className="text-[9px] font-bold uppercase text-slate-400 mb-0.5">Ship To / Attention</h4>
                         <p className="text-[11px] font-bold text-slate-900 uppercase">{customer.name || 'Valued Client'}</p>
                         <p className="text-[10px] text-slate-600 leading-tight mt-0.5">{customer.address || 'Address N/A'}</p>
                      </div>
                   </div>
                </div>

                {rooms.map(room => {
                  const roomItems = bom.filter(i => i.room === room);
                  const categories = ['Wall Cabinets', 'Base Cabinets', 'Tall Cabinets', 'Vanity Cabinets', 'Hinges & Hardware', 'Accessories'];
                  const roomTotal = roomItems.reduce((acc, i) => acc + (i.unit_price * i.qty), 0);

                  return (
                    <div key={room} className="mb-6 avoid-break">
                      <div className="bg-slate-100 px-3 py-1.5 rounded flex justify-between items-center mb-2">
                        <h3 className="text-sm font-bold text-slate-900 uppercase">{room}</h3>
                        <div className="text-[9px] font-bold text-slate-500 uppercase">Units: {roomItems.length}</div>
                      </div>

                      {categories.map(cat => {
                        const catItems = roomItems.filter(i => detectCategory(i.sku) === cat);
                        if (catItems.length === 0) return null;

                        return (
                          <div key={cat} className="mb-3 pl-2">
                            <h4 className="text-[10px] font-bold uppercase text-sky-600 mb-1 border-l-2 border-sky-500 pl-2">{cat}</h4>
                            <Table className="border-collapse">
                              <TableHeader>
                                <TableRow className="h-6 border-b-2 border-slate-200 hover:bg-transparent">
                                  <TableHead className="font-bold text-slate-900 text-[9px] uppercase h-6 px-2 w-1/2">Product Description</TableHead>
                                  <TableHead className="font-bold text-slate-900 text-[9px] uppercase h-6 px-2 text-center w-16">Qty</TableHead>
                                  <TableHead className="font-bold text-slate-900 text-[9px] uppercase h-6 px-2 text-right">Unit Price</TableHead>
                                  <TableHead className="font-bold text-slate-900 text-[9px] uppercase h-6 px-2 text-right">Total</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {catItems.map(item => (
                                  <TableRow key={item.id} className="h-6 border-b border-slate-100 hover:bg-transparent">
                                    <TableCell className="font-bold text-slate-800 py-1 px-2 text-[10px]">{item.sku}</TableCell>
                                    <TableCell className="text-center font-bold text-slate-600 py-1 px-2 text-[10px]">{item.qty}</TableCell>
                                    <TableCell className="text-right font-mono text-[10px] text-slate-500 py-1 px-2">${item.unit_price.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-mono font-bold text-slate-900 py-1 px-2 text-[10px]">${(item.unit_price * item.qty).toFixed(2)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        );
                      })}

                      <div className="flex justify-end pt-1 border-t border-slate-200">
                         <div className="text-right">
                           <span className="text-[9px] font-bold uppercase text-slate-400 mr-3">Area Total ({room})</span>
                           <span className="text-[11px] font-bold font-mono text-slate-900">${roomTotal.toFixed(2)}</span>
                         </div>
                      </div>
                    </div>
                  );
                })}

                <div className="mt-8 pt-4 border-t-2 border-slate-900 avoid-break">
                   <div className="flex justify-between items-start gap-8">
                      <div className="flex-1">
                         <div className="p-4 rounded-lg bg-sky-50 border border-sky-100 max-w-[340px]">
                            <h4 className="text-[10px] font-bold text-sky-900 uppercase mb-1 flex items-center gap-2">
                               <ShieldCheck className="w-4 h-4" /> Terms
                            </h4>
                            <p className="text-[9px] text-sky-700 leading-tight font-medium">
                               Generated by KABS AI v24.0 based on blueprints. 
                               Verify field measurements before order. Prices valid 30 days.
                            </p>
                         </div>
                      </div>

                      <div className="w-64 space-y-2">
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-slate-500 text-[10px] font-bold">
                             <span className="uppercase">Material Subtotal</span>
                             <span className="font-mono">${materialSubtotal.toFixed(2)}</span>
                          </div>
                          {discount > 0 && (
                            <div className="flex justify-between items-center text-emerald-600 text-[10px] font-bold">
                               <span className="uppercase">Discount ({discount}%)</span>
                               <span className="font-mono">-${discountAmount.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center text-slate-500 text-[10px] font-bold">
                             <span className="uppercase">Logistics</span>
                             <span className="font-mono">${(Number(shipping) + Number(fuel)).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between items-center text-slate-500 text-[10px] font-bold pb-2">
                             <span className="uppercase">Sales Tax ({taxRate}%)</span>
                             <span className="font-mono">${taxAmount.toFixed(2)}</span>
                          </div>
                        </div>

                        <div className="bg-slate-900 p-4 rounded-lg text-white">
                           <div className="flex justify-between items-baseline">
                              <span className="text-[9px] font-bold uppercase text-sky-400">Grand Total</span>
                              <span className="text-xl font-bold font-mono">
                                 ${grandTotal.toFixed(2)}
                              </span>
                           </div>
                           <p className="text-[8px] text-slate-500 font-bold text-right uppercase mt-1">USD</p>
                        </div>
                      </div>
                   </div>
                </div>
                
                <div className="mt-8 text-center">
                   <p className="text-[8px] text-slate-300 font-bold uppercase">Powered by KABS AI • Production Precision</p>
                </div>
             </div>
          </div>
        )}
      </div>

      <footer className="mt-32 border-t border-slate-200 py-12 text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 print:hidden">
        &copy; {new Date().getFullYear()} KABS Inc. Precision Engineering.
      </footer>
    </main>
  );
}