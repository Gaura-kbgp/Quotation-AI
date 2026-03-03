
"use client";

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
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
  Save,
  ArrowRight,
  RefreshCcw,
  Loader2,
  Box,
  ChevronDown,
  Trash2,
  Calculator,
  Eye,
  EyeOff,
  FileText,
  CheckCircle2,
  FileDown,
  Phone,
  MapPin,
  User,
  Truck
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn, detectCategory } from '@/lib/utils';
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
}

interface BomManagerClientProps {
  id: string;
  project: any;
  initialBom: BomItem[];
  manufacturerName: string;
}

type WorkflowStep = 'pricing' | 'preview';
type ViewMode = 'client' | 'internal';

export function BomManagerClient({ id, project, initialBom, manufacturerName }: BomManagerClientProps) {
  const { toast } = useToast();
  const router = useRouter();
  
  const [bom, setBom] = useState<BomItem[]>(() => 
    initialBom.map(item => ({
      ...item,
      is_billable: item.is_billable ?? true
    }))
  );

  const roomsList = useMemo(() => Array.from(new Set(bom.map(i => i.room))), [bom]);
  const [selectedRooms, setSelectedRooms] = useState<string[]>(project.bom_data?.selectedRooms || roomsList);
  const [step, setStep] = useState<WorkflowStep>('pricing');
  const [viewMode, setViewMode] = useState<ViewMode>('client');

  const [pricingFactor, setPricingFactor] = useState(project.bom_data?.pricingFactor || 0.45);
  const [targetMargin, setTargetMargin] = useState(project.bom_data?.targetMargin || 35);
  const [discount, setDiscount] = useState(project.bom_data?.discount || 0);
  const [taxRate, setTaxRate] = useState(project.bom_data?.taxRate || 8.25);

  const [customer, setCustomer] = useState({
    name: project.bom_data?.customerName || '',
    address: project.bom_data?.customerAddress || '',
    phone: project.bom_data?.customerPhone || '',
    delivery: project.bom_data?.customerDelivery || '',
  });

  // Mock Manufacturer Details for the Industrial Invoice
  const manufacturerDetails = {
    name: manufacturerName,
    address: "123 Manufacturing Way, Industry City, IN 46201",
    phone: "(800) 555-KABS",
    email: `orders@${manufacturerName.toLowerCase().replace(/\s+/g, '')}.com`
  };

  const [isSaving, setIsSaving] = useState(false);
  const [isPricing, setIsPricing] = useState(false);

  const financials = useMemo(() => {
    const activeItems = bom.filter(item => item.is_billable && selectedRooms.includes(item.room));
    
    const listSubtotal = activeItems
      .reduce((acc, curr) => acc + (Number(curr.unit_price) * Number(curr.qty) || 0), 0);

    const totalCost = listSubtotal * Number(pricingFactor);
    const marginDecimal = Number(targetMargin) / 100;
    const grossSell = marginDecimal < 1 ? totalCost / (1 - marginDecimal) : totalCost;
    const discountAmt = grossSell * (Number(discount) / 100);
    const netTotal = grossSell - discountAmt;
    const taxes = netTotal * (Number(taxRate) / 100);
    const grandTotal = netTotal + taxes;

    return { listSubtotal, totalCost, grossSell, discountAmt, netTotal, taxes, grandTotal };
  }, [bom, selectedRooms, pricingFactor, targetMargin, discount, taxRate]);

  const toggleAllRooms = (checked: boolean) => {
    setSelectedRooms(checked ? roomsList : []);
  };

  const toggleRoom = (roomName: string, checked: boolean) => {
    if (checked) {
      setSelectedRooms(prev => [...prev, roomName]);
    } else {
      setSelectedRooms(prev => prev.filter(r => r !== roomName));
    }
  };

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
        toast({ title: 'Prices Refreshed from Catalog' });
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
          is_billable: item.is_billable
        })
      ));
      await updateProjectAction(id, {
        bom_data: {
          pricingFactor,
          targetMargin,
          discount,
          taxRate,
          customerName: customer.name,
          customerAddress: customer.address,
          customerPhone: customer.phone,
          customerDelivery: customer.delivery,
          listSubtotal: financials.listSubtotal,
          grandTotal: financials.grandTotal,
          selectedRooms
        }
      });
      toast({ title: 'Pricing & BOM Saved' });
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
            <h1 className="text-xl font-bold tracking-tight">Invoice Management</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              Project: {project.project_name} • {manufacturerName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-xl h-11 px-4 border-slate-200" onClick={handleReprice} disabled={isPricing}>
             {isPricing ? <Loader2 className="animate-spin w-4 h-4" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
             Match Catalog Prices
          </Button>
          <Button variant="outline" className="rounded-xl h-11 px-5 border-slate-200 font-bold" onClick={handleSaveAll} disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" /> Save Draft
          </Button>
          <Button className="rounded-xl h-11 px-6 gradient-button" onClick={() => setStep(step === 'pricing' ? 'preview' : 'pricing')}>
             {step === 'pricing' ? 'Next: Review Invoice' : 'Edit BOM'}
             <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-8 mt-8 grid grid-cols-1 lg:grid-cols-4 gap-8 print:block print:px-0">
        <div className="lg:col-span-3 space-y-8 print:col-span-1">
          {step === 'pricing' && (
            <div className="space-y-12 animate-in fade-in duration-500">
              <Card className="rounded-2xl border-slate-200 shadow-sm bg-white overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <Checkbox 
                      id="select-all" 
                      checked={selectedRooms.length === roomsList.length} 
                      onCheckedChange={v => toggleAllRooms(!!v)}
                    />
                    <Label htmlFor="select-all" className="text-xs font-bold uppercase tracking-widest text-slate-500">Select ALL Rooms for Billing</Label>
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {selectedRooms.length} of {roomsList.length} Rooms Selected
                  </div>
                </div>
              </Card>

              {roomsList.map(roomName => {
                const roomItems = bom.filter(i => i.room === roomName);
                const isSelected = selectedRooms.includes(roomName);
                const categories = [
                  'Wall Cabinets', 
                  'Base Cabinets', 
                  'Tall Cabinets', 
                  'Vanity Cabinets', 
                  'Universal Fillers'
                ];

                return (
                  <section key={roomName} className={cn("space-y-4 transition-opacity duration-300", !isSelected && "opacity-40 grayscale-[0.5]")}>
                    <div className="flex items-center gap-3 border-b-2 border-slate-900 pb-2 mb-4">
                       <Checkbox checked={isSelected} onCheckedChange={v => toggleRoom(roomName, !!v)} />
                       <Box className="w-5 h-5 text-sky-600" />
                       <h2 className="text-xl font-black uppercase tracking-tight">{roomName}</h2>
                    </div>

                    {categories.map(cat => {
                      const items = roomItems.filter(i => detectCategory(i.sku) === cat);
                      if (items.length === 0) return null;

                      return (
                        <div key={cat} className="space-y-2 mb-8">
                           <div className="px-4 py-2 bg-slate-100/50 rounded-lg flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{cat}</span>
                           </div>
                           <Table>
                             <TableHeader>
                               <TableRow className="border-b border-slate-100 bg-transparent hover:bg-transparent">
                                 <TableHead className="w-10"></TableHead>
                                 <TableHead className="text-[10px] uppercase font-bold text-slate-400">CAB Code</TableHead>
                                 <TableHead className="text-[10px] uppercase font-bold text-slate-400 text-center">QTY</TableHead>
                                 <TableHead className="text-[10px] uppercase font-bold text-slate-400 text-right">UNIT PRICE (LIST)</TableHead>
                                 <TableHead className="text-[10px] uppercase font-bold text-slate-400 text-right">TOTAL</TableHead>
                               </TableRow>
                             </TableHeader>
                             <TableBody>
                                {items.map(item => {
                                  const idx = bom.findIndex(b => b.id === item.id);
                                  return (
                                    <TableRow key={item.id} className={cn("h-16 group hover:bg-white", !item.is_billable && "opacity-40")}>
                                      <TableCell>
                                        <Checkbox checked={item.is_billable} onCheckedChange={v => handleUpdateItem(idx, { is_billable: !!v })} />
                                      </TableCell>
                                      <TableCell>
                                        <div className="font-bold text-slate-900 text-sm">{item.sku}</div>
                                        <div className="text-[9px] text-slate-400 font-mono">{item.matched_sku}</div>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <Input type="number" value={item.qty} onChange={e => handleUpdateItem(idx, { qty: parseInt(e.target.value) || 0 })} className="w-16 mx-auto text-center h-9 font-bold bg-slate-50 border-none" />
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                           <span className="text-slate-400 font-mono text-xs">$</span>
                                           <Input type="number" value={item.unit_price} onChange={e => handleUpdateItem(idx, { unit_price: parseFloat(e.target.value) || 0 })} className="w-24 text-right h-9 font-bold bg-slate-50 border-none font-mono" />
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right font-black font-mono text-slate-900 text-sm">
                                        ${(item.unit_price * item.qty).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                             </TableBody>
                           </Table>
                        </div>
                      )
                    })}

                    {roomItems.filter(i => !categories.includes(detectCategory(i.sku))).length > 0 && (
                      <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="acc" className="border-none">
                          <AccordionTrigger className="px-4 py-2 bg-slate-50 rounded-xl hover:no-underline">
                             <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Accessories And Others</span>
                          </AccordionTrigger>
                          <AccordionContent className="pt-4">
                            <Table>
                               <TableBody>
                                  {roomItems.filter(i => !categories.includes(detectCategory(i.sku))).map(item => {
                                    const idx = bom.findIndex(b => b.id === item.id);
                                    return (
                                      <TableRow key={item.id} className="h-10 border-b border-slate-100">
                                        <TableCell className="w-10"><Checkbox checked={item.is_billable} onCheckedChange={v => handleUpdateItem(idx, { is_billable: !!v })} /></TableCell>
                                        <TableCell className="text-xs font-bold">{item.sku}</TableCell>
                                        <TableCell className="text-right font-mono text-xs">${(item.unit_price * item.qty).toFixed(2)}</TableCell>
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
                )
              })}
            </div>
          )}

          {step === 'preview' && (
            <div className="animate-in fade-in duration-500 space-y-8">
               <div className="print:hidden flex justify-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                  <Button 
                    variant={viewMode === 'client' ? 'default' : 'outline'} 
                    onClick={() => setViewMode('client')}
                    className="rounded-xl h-11 px-6"
                  >
                    <Eye className="w-4 h-4 mr-2" /> Client Invoice
                  </Button>
                  <Button 
                    variant={viewMode === 'internal' ? 'default' : 'outline'} 
                    onClick={() => setViewMode('internal')}
                    className="rounded-xl h-11 px-6"
                  >
                    <EyeOff className="w-4 h-4 mr-2" /> Internal Calculation
                  </Button>
               </div>

               {/* Industrial Ready Invoice Layout */}
               <div className="bg-white shadow-2xl rounded-sm p-16 print:p-0 print:shadow-none print:rounded-none border border-slate-100">
                  <div className="flex justify-between items-start mb-16 border-b-2 border-slate-900 pb-10">
                    <div className="space-y-4 max-w-[50%]">
                      <div>
                        <h2 className="text-3xl font-black tracking-tight text-slate-900 uppercase">{manufacturerDetails.name}</h2>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Cabinetry Manufacturer</p>
                      </div>
                      <div className="space-y-1 text-xs text-slate-600">
                        <p className="flex items-center gap-2"><MapPin className="w-3 h-3" /> {manufacturerDetails.address}</p>
                        <p className="flex items-center gap-2"><Phone className="w-3 h-3" /> {manufacturerDetails.phone}</p>
                        <p className="flex items-center gap-2 font-medium text-sky-600">{manufacturerDetails.email}</p>
                      </div>
                    </div>
                    <div className="text-right space-y-4 max-w-[50%]">
                      <div>
                        <h1 className="text-4xl font-black text-slate-900 uppercase">Invoice</h1>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Ref: {id.substring(0, 8).toUpperCase()}</p>
                      </div>
                      <div className="space-y-1 text-xs text-slate-900">
                        <p className="font-black uppercase tracking-widest text-[10px] text-slate-400 mb-1">Bill To:</p>
                        <p className="font-bold text-sm">{customer.name || 'VALUED CUSTOMER'}</p>
                        <p>{customer.address || 'PROJECT ADDRESS PENDING'}</p>
                        <p className="flex items-center justify-end gap-2"><Phone className="w-3 h-3" /> {customer.phone || 'PHONE PENDING'}</p>
                        {customer.delivery && (
                           <p className="flex items-center justify-end gap-2 text-sky-600 font-medium">
                             <Truck className="w-3 h-3" /> Ship to: {customer.delivery}
                           </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-12 min-h-[400px]">
                    {selectedRooms.map(roomName => {
                      const roomItems = bom.filter(i => i.room === roomName && i.is_billable);
                      if (roomItems.length === 0) return null;
                      return (
                        <div key={roomName} className="avoid-break mb-8">
                          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-4 bg-slate-50 p-2 border-l-4 border-slate-900">{roomName}</h3>
                          <Table>
                             <TableHeader className="bg-slate-50 border-y border-slate-200">
                               <TableRow className="h-10 hover:bg-transparent">
                                 <TableHead className="text-[10px] font-bold uppercase p-2 text-slate-900">CAB Code</TableHead>
                                 <TableHead className="text-center text-[10px] font-bold uppercase p-2 w-12 text-slate-900">QTY</TableHead>
                                 <TableHead className="text-right text-[10px] font-bold uppercase p-2 text-slate-900">Unit Price</TableHead>
                                 <TableHead className="text-right text-[10px] font-bold uppercase p-2 text-slate-900">Amount</TableHead>
                               </TableRow>
                             </TableHeader>
                             <TableBody>
                                {roomItems.map(item => (
                                  <TableRow key={item.id} className="border-b border-slate-100 h-10 hover:bg-transparent">
                                     <TableCell className="font-medium text-[11px] p-2">{item.sku}</TableCell>
                                     <TableCell className="text-center text-[11px] w-12 p-2">{item.qty}</TableCell>
                                     <TableCell className="text-right font-mono text-[11px] p-2">
                                       ${viewMode === 'internal' ? item.unit_price.toFixed(2) : (item.unit_price * (financials.grandTotal / financials.listSubtotal)).toFixed(2)}
                                     </TableCell>
                                     <TableCell className="text-right font-mono text-[11px] font-bold p-2 text-slate-900">
                                       ${(item.unit_price * item.qty * (viewMode === 'internal' ? 1 : (financials.grandTotal / financials.listSubtotal))).toFixed(2)}
                                     </TableCell>
                                  </TableRow>
                                ))}
                             </TableBody>
                          </Table>
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-20 pt-10 border-t-2 border-slate-900 flex flex-col items-end text-right">
                    <div className="w-full max-w-sm space-y-3">
                      {viewMode === 'internal' && (
                        <div className="bg-slate-50 p-6 rounded-lg mb-4 space-y-2 border border-slate-200">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Cost Breakdown</p>
                          <div className="flex justify-between text-[11px] font-bold uppercase text-slate-500">
                             <span>Gross List</span>
                             <span className="font-mono">${financials.listSubtotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-[11px] font-bold uppercase text-sky-600">
                             <span>Dealer Cost ({pricingFactor})</span>
                             <span className="font-mono">${financials.totalCost.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-[11px] font-bold uppercase text-emerald-600">
                             <span>Margin ({targetMargin}%)</span>
                             <span className="font-mono">+${(financials.grossSell - financials.totalCost).toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex justify-between text-xs font-bold uppercase text-slate-500 px-2">
                         <span>Subtotal</span>
                         <span className="font-mono">${financials.netTotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold uppercase text-slate-500 px-2">
                         <span>Tax ({taxRate}%)</span>
                         <span className="font-mono">${financials.taxes.toFixed(2)}</span>
                      </div>
                      <div className="border-t border-slate-200 my-2" />
                      <div className="flex justify-between text-3xl font-black uppercase text-slate-900 px-2">
                         <span className="tracking-tighter">Total Amount</span>
                         <span className="font-mono text-sky-600">${financials.grandTotal.toFixed(2)}</span>
                      </div>
                      <div className="pt-8 space-y-1">
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Valid until: {new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString()}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Terms: Net 30</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-32 pt-10 border-t border-slate-100 flex justify-center gap-6 print:hidden">
                    <Button size="lg" className="gradient-button h-16 px-12 text-lg rounded-2xl shadow-xl shadow-sky-500/30" onClick={() => window.print()}>
                      <Printer className="w-5 h-5 mr-3" /> Print Invoice (A4)
                    </Button>
                    <Button size="lg" variant="outline" className="h-16 px-12 text-lg rounded-2xl border-slate-200" onClick={() => window.print()}>
                      <FileDown className="w-5 h-5 mr-3" /> Export PDF
                    </Button>
                  </div>
               </div>
            </div>
          )}
        </div>

        <aside className="space-y-6 print:hidden">
          <Card className="rounded-[2rem] border-slate-200 shadow-2xl overflow-hidden bg-white">
            <CardHeader className="bg-slate-50 border-b border-slate-100">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calculator className="w-5 h-5 text-sky-600" />
                Quote Control
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-8">
              <div className="p-5 bg-sky-50 rounded-2xl border border-sky-100 space-y-4">
                 <p className="text-[10px] font-black uppercase text-sky-600 tracking-[0.2em]">BOM Multipliers</p>
                 
                 <div className="space-y-1">
                    <Label className="text-[11px] font-bold text-slate-500 uppercase">Cost Factor</Label>
                    <Input type="number" step="0.01" value={pricingFactor} onChange={e => setPricingFactor(parseFloat(e.target.value) || 0)} className="h-10 bg-white border-sky-200 font-bold rounded-lg text-sm" />
                 </div>

                 <div className="space-y-1">
                    <Label className="text-[11px] font-bold text-slate-500 uppercase">Margin (%)</Label>
                    <Input type="number" value={targetMargin} onChange={e => setTargetMargin(parseFloat(e.target.value) || 0)} className="h-10 bg-white border-sky-200 font-bold rounded-lg text-sm" />
                 </div>
              </div>

              <div className="space-y-4">
                 <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Customer Details</p>
                 <div className="space-y-2">
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                      <Input value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})} className="h-10 pl-8 bg-slate-50 border-none rounded-lg text-sm font-bold" placeholder="Customer Name" />
                    </div>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                      <Input value={customer.phone} onChange={e => setCustomer({...customer, phone: e.target.value})} className="h-10 pl-8 bg-slate-50 border-none rounded-lg text-sm" placeholder="Phone Number" />
                    </div>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 w-3 h-3 text-slate-400" />
                      <Input value={customer.address} onChange={e => setCustomer({...customer, address: e.target.value})} className="h-10 pl-8 bg-slate-50 border-none rounded-lg text-sm" placeholder="Full Address" />
                    </div>
                    <div className="relative">
                      <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                      <Input value={customer.delivery} onChange={e => setCustomer({...customer, delivery: e.target.value})} className="h-10 pl-8 bg-slate-50 border-none rounded-lg text-sm" placeholder="Delivery Location" />
                    </div>
                 </div>
              </div>

              <div className="space-y-2 pt-4 border-t border-slate-100">
                <Label className="text-[11px] font-bold text-slate-400 uppercase">Tax Rate (%)</Label>
                <Input type="number" step="0.01" value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} className="h-10 bg-slate-50 border-none rounded-lg text-sm" />
              </div>

              <div className="pt-6 border-t border-slate-100">
                 <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400 font-bold uppercase tracking-widest">Net Value</span>
                    <span className="font-mono text-slate-900 font-bold">${financials.netTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                 </div>
                 <div className="flex justify-between items-center text-xs">
                    <span className="text-sky-600 font-bold uppercase tracking-widest">Dealer Cost</span>
                    <span className="font-mono text-sky-900 font-bold">${financials.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                 </div>
                 <div className="pt-6">
                    <p className="text-[10px] font-black uppercase text-sky-600 tracking-[0.3em] mb-1">Invoice Total</p>
                    <p className="text-3xl font-black font-mono tracking-tighter text-slate-900">
                       ${financials.grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                 </div>
              </div>
            </CardContent>
          </Card>

          <div className="p-6 bg-slate-900 rounded-[2rem] text-white shadow-2xl space-y-4">
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">Live Invoice Status</p>
             </div>
             <div>
                <p className="text-xl font-black leading-tight">{selectedRooms.length} Rooms Selected</p>
                <p className="text-xs text-slate-400 font-medium">Ready for {manufacturerName} Export</p>
             </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
