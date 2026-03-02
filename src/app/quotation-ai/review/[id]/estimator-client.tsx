
"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Plus,
  Trash2,
  ChevronRight,
  ArrowLeft,
  Box,
  Layers,
  ArrowDownCircle,
  ArrowUpCircle,
  Loader2,
  CheckCircle2,
  Factory,
  PlusCircle,
  Layout
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateProjectAction } from '../../actions';
import { useRouter } from 'next/navigation';
import { cn, detectCategory } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface Item {
  code: string;
  qty: number;
}

interface Room {
  room_name: string;
  collection?: string;
  door_style?: string;
  primaryCabinets: Item[];
  otherItems: Item[];
}

interface EstimatorClientProps {
  project: any;
  manufacturers: any[];
}

type Step = 'review' | 'manufacturer' | 'specifications';

export function EstimatorClient({ project, manufacturers }: EstimatorClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const initialSyncRef = useRef(false);
  
  const [step, setStep] = useState<Step>('review');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedManId, setSelectedManId] = useState<string>(project.manufacturer_id || '');
  const [manMapping, setManMapping] = useState<Record<string, string[]>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (initialSyncRef.current) return;
    if (project.extracted_data?.rooms) {
      setRooms(project.extracted_data.rooms);
    }
    initialSyncRef.current = true;
  }, [project]);

  const totals = useMemo(() => {
    let p = 0;
    let o = 0;
    rooms.forEach(r => {
      r.primaryCabinets.forEach(i => p += i.qty);
      r.otherItems.forEach(i => o += i.qty);
    });
    return { primary: p, other: o };
  }, [rooms]);

  const handleUpdateQty = (rIdx: number, type: 'primary' | 'other', iIdx: number, val: number) => {
    const nr = [...rooms];
    if (type === 'primary') nr[rIdx].primaryCabinets[iIdx].qty = val;
    else nr[rIdx].otherItems[iIdx].qty = val;
    setRooms(nr);
  };

  const handleUpdateCode = (rIdx: number, type: 'primary' | 'other', iIdx: number, val: string) => {
    const nr = [...rooms];
    if (type === 'primary') nr[rIdx].primaryCabinets[iIdx].code = val.toUpperCase();
    else nr[rIdx].otherItems[iIdx].code = val.toUpperCase();
    setRooms(nr);
  };

  const handleDelete = (rIdx: number, type: 'primary' | 'other', iIdx: number) => {
    const nr = [...rooms];
    if (type === 'primary') nr[rIdx].primaryCabinets.splice(iIdx, 1);
    else nr[rIdx].otherItems.splice(iIdx, 1);
    setRooms(nr);
  };

  const handleMove = (rIdx: number, iIdx: number, from: 'primary' | 'other') => {
    const nr = [...rooms];
    if (from === 'primary') {
      const [item] = nr[rIdx].primaryCabinets.splice(iIdx, 1);
      nr[rIdx].otherItems.push(item);
    } else {
      const [item] = nr[rIdx].otherItems.splice(iIdx, 1);
      nr[rIdx].primaryCabinets.push(item);
    }
    setRooms(nr);
  };

  const handleAddRoom = () => {
    setRooms(prev => [...prev, {
      room_name: `NEW ROOM ${prev.length + 1}`,
      primaryCabinets: [],
      otherItems: []
    }]);
    toast({ title: 'Room Added', description: 'Scroll down to configure your new room.' });
  };

  const handleRemoveRoom = (idx: number) => {
    if (!confirm('Are you sure you want to remove this entire room?')) return;
    setRooms(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAddItem = (rIdx: number, type: 'primary' | 'other') => {
    const nr = [...rooms];
    if (type === 'primary') nr[rIdx].primaryCabinets.push({ code: 'NEW_ITEM', qty: 1 });
    else nr[rIdx].otherItems.push({ code: 'NEW_ACCESSORY', qty: 1 });
    setRooms(nr);
  };

  const handleBack = () => {
    if (step === 'manufacturer') setStep('review');
    else if (step === 'specifications') setStep('manufacturer');
    else router.push('/quotation-ai');
  };

  const handleGenerateQuote = async () => {
    if (rooms.some(r => !r.collection || !r.door_style)) {
      toast({ variant: 'destructive', title: 'Missing Selection', description: 'Apply specs to all rooms.' });
      return;
    }
    setIsProcessing(true);
    try {
      const processedRooms = rooms.map(r => ({
        ...r,
        sections: {
          'Wall Cabinets': r.primaryCabinets.filter(c => detectCategory(c.code) === 'Wall Cabinets'),
          'Base Cabinets': r.primaryCabinets.filter(c => detectCategory(c.code) === 'Base Cabinets'),
          'Tall & Other Cabinets': r.primaryCabinets.filter(c => !['Wall Cabinets', 'Base Cabinets'].includes(detectCategory(c.code))),
          'Accessories & Other': r.otherItems
        }
      }));

      await updateProjectAction(project.id, { 
        extracted_data: { rooms: processedRooms }, 
        manufacturer_id: selectedManId 
      });
      
      const res = await fetch('/api/generate-bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, manufacturerId: selectedManId })
      });
      
      const result = await res.json();
      if (result.success) {
        router.push(`/quotation-ai/bom/${project.id}`);
      } else throw new Error(result.error);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const fetchManConfig = async (id: string) => {
    try {
      const res = await fetch(`/api/manufacturer-config?id=${id}`);
      const data = await res.json();
      setManMapping(data.mapping || {});
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error loading specs' });
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Dynamic Step-Aware Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-100 px-6 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900 line-clamp-1 max-w-[300px] md:max-w-md">{project.project_name}</h1>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
              {step === 'review' ? 'Takeoff Review' : step === 'manufacturer' ? 'Select Brand' : 'Configure Specs'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {step === 'review' && (
            <Button onClick={handleAddRoom} variant="outline" size="sm" className="rounded-xl border-sky-100 text-sky-600 font-bold hover:bg-sky-50">
              <PlusCircle className="w-4 h-4 mr-2" />
              Add Room
            </Button>
          )}
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-100">
            <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Live Sync</span>
          </div>
        </div>
      </header>

      <div className="p-6 flex-1">
        {step === 'review' && (
          <div className="max-w-5xl mx-auto space-y-8 pb-32 animate-in fade-in duration-500">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 sticky top-20 z-40">
               <div className="flex gap-10">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Primary Cabinets</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-slate-900">{totals.primary}</span>
                      <Box className="w-5 h-5 text-sky-500" />
                    </div>
                  </div>
                  <div className="border-l border-slate-100 pl-10">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Other Items</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-slate-500">{totals.other}</span>
                      <Layers className="w-5 h-5 text-slate-300" />
                    </div>
                  </div>
               </div>
               <Button onClick={() => setStep('manufacturer')} className="h-12 px-10 gradient-button text-base">
                  Continue to Branding
                  <ChevronRight className="ml-2 w-5 h-5" />
               </Button>
            </div>

            <div className="space-y-12">
              {rooms.map((room, rIdx) => {
                const groupedPrimary = {
                  'Wall Cabinets': room.primaryCabinets.filter(c => detectCategory(c.code) === 'Wall Cabinets'),
                  'Base Cabinets': room.primaryCabinets.filter(c => detectCategory(c.code) === 'Base Cabinets'),
                  'Tall & Other Cabinets': room.primaryCabinets.filter(c => !['Wall Cabinets', 'Base Cabinets'].includes(detectCategory(c.code))),
                };

                return (
                  <div key={rIdx} className="space-y-6 animate-in fade-in duration-300">
                     <div className="flex items-center justify-between group">
                        <div className="flex items-center gap-3 w-full">
                           <Layout className="w-5 h-5 text-sky-400" />
                           <Input 
                             value={room.room_name} 
                             onChange={(e) => {
                               const nr = [...rooms];
                               nr[rIdx].room_name = e.target.value.toUpperCase();
                               setRooms(nr);
                             }}
                             className="text-xl font-bold text-slate-900 border-none bg-transparent h-auto p-0 focus-visible:ring-0 w-full"
                           />
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveRoom(rIdx)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                           <Trash2 className="w-5 h-5" />
                        </Button>
                     </div>
                     
                     <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden bg-white">
                        {Object.entries(groupedPrimary).map(([category, items], catIdx) => (
                          <div key={category} className={cn("space-y-0", catIdx !== 0 && "border-t border-slate-50")}>
                            <div className="px-6 py-2 bg-slate-50/50 flex items-center justify-between">
                               <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{category}</span>
                               <span className="text-[10px] font-bold text-slate-400">{items.length} SKUs</span>
                            </div>
                            <Table>
                              <TableBody>
                                {items.map((item, iIdx) => {
                                  const actualIdx = room.primaryCabinets.findIndex(pc => pc.code === item.code && pc.qty === item.qty);
                                  return (
                                    <TableRow key={iIdx} className="h-14 hover:bg-slate-50/50 border-slate-50">
                                      <TableCell className="w-20 pl-6">
                                        <Input 
                                          type="number" 
                                          value={item.qty} 
                                          onChange={(e) => handleUpdateQty(rIdx, 'primary', actualIdx, parseInt(e.target.value) || 0)}
                                          className="w-12 h-9 text-center font-bold text-sm bg-slate-50 border-none rounded-lg"
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <Input 
                                          value={item.code}
                                          onChange={(e) => handleUpdateCode(rIdx, 'primary', actualIdx, e.target.value)}
                                          className="border-none bg-transparent font-bold text-slate-900 text-base p-0 h-9"
                                        />
                                      </TableCell>
                                      <TableCell className="text-right pr-6 space-x-2">
                                        <Button variant="ghost" size="icon" onClick={() => handleMove(rIdx, actualIdx, 'primary')} className="text-slate-400 hover:text-amber-600" title="Move to Accessories">
                                          <ArrowDownCircle className="w-5 h-5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(rIdx, 'primary', actualIdx)} className="text-slate-300 hover:text-red-500">
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        ))}
                        <div className="p-4 bg-slate-50/20 border-t border-slate-100 flex justify-center">
                           <Button variant="ghost" size="sm" onClick={() => handleAddItem(rIdx, 'primary')} className="text-sky-600 hover:bg-sky-50 font-bold uppercase text-[10px] tracking-widest">
                              <Plus className="w-3 h-3 mr-2" />
                              Add Cabinet to {room.room_name}
                           </Button>
                        </div>
                     </Card>

                     <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="other" className="border-none">
                          <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden bg-slate-50/30">
                            <AccordionTrigger className="px-6 py-3 hover:no-underline">
                              <div className="flex items-center gap-3 text-left">
                                <span className="text-xs font-black uppercase tracking-widest text-slate-500">Accessories, Fillers & Molding</span>
                                <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-100">{room.otherItems.length} Items</span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <Table>
                                <TableBody>
                                  {room.otherItems.map((item, iIdx) => (
                                    <TableRow key={iIdx} className="h-12 hover:bg-white border-slate-100/50">
                                      <TableCell className="w-20 pl-6">
                                        <Input 
                                          type="number" 
                                          value={item.qty} 
                                          onChange={(e) => handleUpdateQty(rIdx, 'other', iIdx, parseInt(e.target.value) || 0)}
                                          className="w-10 h-8 text-center font-bold text-xs bg-white border-slate-200"
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <Input 
                                          value={item.code}
                                          onChange={(e) => handleUpdateCode(rIdx, 'other', iIdx, e.target.value)}
                                          className="border-none bg-transparent text-slate-500 text-sm p-0 h-8"
                                        />
                                      </TableCell>
                                      <TableCell className="text-right pr-6 space-x-2">
                                        <Button variant="ghost" size="icon" onClick={() => handleMove(rIdx, iIdx, 'other')} className="text-slate-400 hover:text-sky-600" title="Move to Primary">
                                          <ArrowUpCircle className="w-5 h-5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(rIdx, 'other', iIdx)} className="text-slate-300 hover:text-red-500">
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              <div className="p-3 flex justify-center border-t border-slate-100">
                                <Button variant="ghost" size="sm" onClick={() => handleAddItem(rIdx, 'other')} className="text-slate-400 hover:bg-white font-bold uppercase text-[9px] tracking-widest">
                                  <Plus className="w-3 h-3 mr-2" />
                                  Add Accessory
                                </Button>
                              </div>
                            </AccordionContent>
                          </Card>
                        </AccordionItem>
                     </Accordion>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === 'manufacturer' && (
          <div className="max-w-2xl mx-auto py-8 space-y-6 animate-in fade-in duration-500">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Select Manufacturer</h2>
              <p className="text-xs text-slate-500">Choose the brand for this architectural takeoff.</p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {manufacturers.map(m => (
                <button 
                  key={m.id}
                  onClick={() => { setSelectedManId(m.id); fetchManConfig(m.id); setStep('specifications'); }}
                  className="p-4 rounded-xl border border-slate-100 bg-white hover:border-sky-500 hover:bg-sky-50 transition-all flex items-center gap-4 shadow-sm group"
                >
                  <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Factory className="w-5 h-5" />
                  </div>
                  <span className="text-base font-bold text-slate-900">{m.name}</span>
                  <ChevronRight className="ml-auto w-5 h-5 text-slate-300 group-hover:text-sky-500" />
                </button>
              ))}
            </div>
            <div className="flex justify-center pt-2">
              <Button variant="ghost" onClick={() => setStep('review')} className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                <ArrowLeft className="w-3 h-3 mr-2" />
                Back to Review
              </Button>
            </div>
          </div>
        )}

        {step === 'specifications' && (
          <div className="max-w-4xl mx-auto py-8 space-y-6 animate-in fade-in duration-500">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Configure Specifications</h2>
              <p className="text-xs text-slate-500">Apply Collection and Door Style to each area.</p>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {rooms.map((room, rIdx) => (
                <Card key={rIdx} className="p-4 rounded-xl border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 bg-white">
                  <h3 className="text-sm font-bold w-full md:w-1/3 truncate text-slate-700">{room.room_name}</h3>
                  <div className="flex gap-3 w-full md:w-auto">
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Collection</span>
                      <Select value={room.collection} onValueChange={(v) => {
                        const nr = [...rooms];
                        nr[rIdx].collection = v;
                        nr[rIdx].door_style = '';
                        setRooms(nr);
                      }}>
                        <SelectTrigger className="w-40 h-9 rounded-lg text-xs">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(manMapping).map(c => (
                            <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Door Style</span>
                      <Select value={room.door_style} onValueChange={(v) => {
                        const nr = [...rooms];
                        nr[rIdx].door_style = v;
                        setRooms(nr);
                      }} disabled={!room.collection}>
                        <SelectTrigger className="w-40 h-9 rounded-lg text-xs">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {room.collection && manMapping[room.collection]?.map(s => (
                            <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex gap-4 pt-6">
              <Button variant="ghost" onClick={() => setStep('manufacturer')} className="h-12 px-6 rounded-xl font-bold text-slate-500">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button 
                onClick={handleGenerateQuote} 
                className="flex-1 h-12 gradient-button text-base rounded-xl shadow-sky-500/10" 
                disabled={isProcessing}
              >
                {isProcessing ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                {isProcessing ? 'Processing...' : 'Generate Final Quotation'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
