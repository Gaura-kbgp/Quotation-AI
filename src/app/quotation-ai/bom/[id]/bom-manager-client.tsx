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
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
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

export function BomManagerClient({ id, project, initialBom, manufacturerName }: BomManagerClientProps) {
  const { toast } = useToast();
  const [bom, setBom] = useState<BomItem[]>(initialBom);
  const [view, setView] = useState<'edit' | 'customer'>('edit');
  
  // Surcharges & Overheads
  const [discount, setDiscount] = useState(project.bom_data?.discount || 0);
  const [shipping, setShipping] = useState(project.bom_data?.shipping || 250);
  const [fuel, setFuel] = useState(project.bom_data?.fuel || 0);
  const [taxRate, setTaxRate] = useState(project.bom_data?.taxRate || 8.25);

  // Customer Details
  const [customer, setCustomer] = useState({
    name: project.bom_data?.customerName || '',
    address: project.bom_data?.customerAddress || '',
    phone: project.bom_data?.customerPhone || '',
  });

  const [isSaving, setIsSaving] = useState(false);

  // Recalculations
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
    
    // Recalculate line total if price or qty changed
    if ('unit_price' in updates || 'qty' in updates) {
      item.line_total = (item.unit_price || 0) * (item.qty || 0);
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
      // 1. Bulk Update Line Items (SKU, Qty, Price, Room)
      await Promise.all(bom.map(item => 
        updateBomItemAction(item.id, { 
          sku: item.sku,
          qty: item.qty,
          unit_price: item.unit_price, 
          line_total: item.unit_price * item.qty,
          room: item.room
        })
      ));

      // 2. Update Project Metadata
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

      toast({ title: 'Quotation Saved', description: 'All edits and surcharges have been persisted.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Save Failed', description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const rooms = Array.from(new Set(bom.map(i => i.room)));

  return (
    <main className="min-h-screen bg-slate-50 pb-32">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 px-8 h-20 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-6">
          <Link href={`/quotation-ai/review/${id}`}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
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
              onClick={() => setView('edit')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                view === 'edit' ? "bg-white text-sky-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Price Review
            </button>
            <button 
              onClick={() => setView('customer')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                view === 'customer' ? "bg-white text-sky-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Customer Info
            </button>
          </div>
          
          <Button 
            variant="outline" 
            className="rounded-xl h-11 px-5 border-slate-200 font-bold" 
            onClick={handleSaveAll}
            disabled={isSaving}
          >
            {isSaving ? <Calculator className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
          
          <Button className="gradient-button rounded-xl px-8 h-11" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" /> Print Bill
          </Button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-8 mt-12 space-y-12 print:mt-0 print:px-0">
        
        <div className="hidden print:flex justify-between items-start mb-12 border-b-2 border-slate-900 pb-8">
           <div className="space-y-2">
              <h2 className="text-3xl font-black text-slate-900">{manufacturerName}</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Authorized Cabinetry Provider</p>
           </div>
           <div className="text-right space-y-1">
              <h1 className="text-2xl font-black text-slate-900">QUOTATION</h1>
              {customer.name && <p className="text-xs text-slate-900 font-bold">Client: {customer.name}</p>}
              <p className="text-xs text-slate-500 font-medium">Project: {project.project_name}</p>
              <p className="text-xs text-slate-500 font-medium">Date: {new Date().toLocaleDateString()}</p>
           </div>
        </div>

        {view === 'edit' ? (
          <div className="space-y-12 animate-in fade-in duration-500 print:block">
            {rooms.map(room => (
              <section key={room} className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                  <div className="flex items-center gap-3 w-full max-w-sm">
                    <Layout className="w-5 h-5 text-slate-900 shrink-0" />
                    <Input 
                      value={room}
                      onChange={(e) => handleUpdateRoomName(room, e.target.value)}
                      className="text-lg font-black uppercase tracking-tight text-slate-900 border-none bg-transparent focus-visible:ring-1 focus-visible:ring-sky-100 p-0 h-auto"
                    />
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow className="h-12 border-b border-slate-200 hover:bg-transparent">
                      <TableHead className="text-[10px] font-black uppercase text-slate-400 w-1/2">SKU / Code</TableHead>
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
                             <p className="text-[9px] text-slate-400 font-bold">Ref: {item.matched_sku}</p>
                          </TableCell>
                          <TableCell className="text-center font-bold">
                             <Input 
                               type="number"
                               value={item.qty}
                               onChange={(e) => handleUpdateItem(itemIdx, { qty: parseInt(e.target.value) || 0 })}
                               className="w-16 mx-auto text-center font-bold border-none bg-transparent focus-visible:ring-1 focus-visible:ring-sky-100 p-0 h-auto"
                             />
                          </TableCell>
                          <TableCell className="text-right">
                             <Input 
                               type="number" 
                               value={item.unit_price} 
                               onChange={(e) => handleUpdateItem(itemIdx, { unit_price: parseFloat(e.target.value) || 0 })}
                               className="w-24 ml-auto text-right font-mono font-bold bg-white h-9 rounded-lg border-slate-200 print:border-none print:bg-transparent shadow-sm"
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
              </section>
            ))}

            <section className="bg-white p-12 rounded-[2.5rem] border border-slate-200 shadow-xl space-y-12 print:border-none print:shadow-none print:p-0">
               <div className="grid grid-cols-1 md:grid-cols-4 gap-8 print:hidden">
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
                  <div className="flex-1 space-y-4 max-w-md print:hidden">
                     <h4 className="text-sm font-black uppercase tracking-widest text-slate-900">Terms & Conditions</h4>
                     <p className="text-xs text-slate-500 leading-relaxed font-medium">
                        Prices reflects architectural takeoff review. All edits are temporary until "Save Changes" is triggered. 
                        Taxes are calculated after dealer discounts are applied to material subtotal.
                     </p>
                  </div>

                  <div className="w-full md:w-96 space-y-4">
                     <div className="space-y-3">
                        <div className="flex justify-between items-center text-slate-500">
                           <span className="text-[10px] font-bold uppercase tracking-widest">Material Subtotal</span>
                           <span className="font-mono text-lg font-bold text-slate-900">${materialSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        {discount > 0 && (
                          <div className="flex justify-between items-center text-emerald-600">
                             <span className="text-[10px] font-bold uppercase tracking-widest">Dealer Discount ({discount}%)</span>
                             <span className="font-mono text-lg font-bold">-${discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center text-slate-500">
                           <span className="text-[10px] font-bold uppercase tracking-widest">Logistics (Shipping/Fuel)</span>
                           <span className="font-mono text-lg font-bold text-slate-900">${(Number(shipping) + Number(fuel)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-500">
                           <span className="text-[10px] font-bold uppercase tracking-widest">Estimated Tax ({taxRate}%)</span>
                           <span className="font-mono text-lg font-bold text-slate-900">${taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                     </div>

                     <div className="bg-slate-900 p-8 rounded-[2rem] text-white">
                        <div className="flex justify-between items-baseline">
                           <span className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-400">Total Investment</span>
                           <span className="text-4xl font-black font-mono tracking-tighter">
                              ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                           </span>
                        </div>
                     </div>
                  </div>
               </div>
            </section>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <Card className="rounded-[3rem] p-12 border-slate-100 shadow-xl bg-white">
                <div className="text-center space-y-4 mb-12">
                   <div className="w-16 h-16 rounded-3xl bg-sky-50 flex items-center justify-center text-sky-600 mx-auto">
                      <UserCircle className="w-10 h-10" />
                   </div>
                   <h2 className="text-3xl font-black text-slate-900 tracking-tight">Customer Intake</h2>
                   <p className="text-slate-500">These details will appear on the final bill header.</p>
                </div>

                <div className="space-y-8">
                   <div className="space-y-3">
                      <Label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Client Name / Attention To</Label>
                      <Input 
                        placeholder="e.g. John & Jane Doe" 
                        value={customer.name}
                        onChange={e => setCustomer({...customer, name: e.target.value})}
                        className="h-14 rounded-2xl bg-slate-50 border-none font-bold text-lg"
                      />
                   </div>
                   <div className="space-y-3">
                      <Label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Project Site Address</Label>
                      <Input 
                        placeholder="e.g. 123 Cabinetry Way, Suite 400" 
                        value={customer.address}
                        onChange={e => setCustomer({...customer, address: e.target.value})}
                        className="h-14 rounded-2xl bg-slate-50 border-none font-bold text-lg"
                      />
                   </div>
                   <div className="space-y-3">
                      <Label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Contact Phone</Label>
                      <Input 
                        placeholder="e.g. (555) 0123-4567" 
                        value={customer.phone}
                        onChange={e => setCustomer({...customer, phone: e.target.value})}
                        className="h-14 rounded-2xl bg-slate-50 border-none font-bold text-lg"
                      />
                   </div>

                   <Button className="w-full h-16 rounded-[2rem] gradient-button text-lg" onClick={() => setView('edit')}>
                      <CheckCircle2 className="w-5 h-5 mr-3" />
                      Apply & Review Quotation
                   </Button>
                </div>
             </Card>
          </div>
        )}
      </div>

      <footer className="mt-32 border-t border-slate-200 py-12 text-center text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 print:hidden">
        &copy; {new Date().getFullYear()} KABS Inc. Precision Architectural Estimating v21.4
      </footer>
    </main>
  );
}
