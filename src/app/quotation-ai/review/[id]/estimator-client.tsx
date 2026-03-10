
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
  Layout,
  Package,
  PlusCircle,
  Factory
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
    toast({ title: 'Room Added' });
  };

  const handleRemoveRoom = (idx: number) => {
    if (!confirm('Are you sure you want to remove this room?')) return;
    setRooms(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAddItem = (rIdx: number, targetCategory: string) => {
    const nr = [...rooms];
    const newItem = { code: '', qty: 1 };
    
    const primaryCats = ['Wall Cabinets', 'Base Cabinets', 'Tall Cabinets', 'Vanity Cabinets', 'Universal Fillers'];
    if (primaryCats.includes(targetCategory)) {
      nr[rIdx].primaryCabinets.push(newItem);
    } else {
      nr[rIdx].otherItems.push(newItem);
    }
    setRooms(nr);
  };

  const handleBack = () => {
    if (step === 'manufacturer') setStep('review');
    else if (step === 'specifications') setStep('manufacturer');
    else router.push('/quotation-ai');
  };

  const handleGenerateQuote = async () => {
    if (rooms.some(r => !r.collection || !r.door_style)) {
      toast({ variant: 'destructive', title: 'Missing Specs', description: 'Apply manufacturer specs to all rooms.' });
      return;
    }
    setIsProcessing(true);
    try {
      await updateProjectAction(project.id, { 
        extracted_data: { rooms }, 
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
      toast({ variant: 'destructive', title: 'Error loading brands' });
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-100 px-6 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">{project.project_name}</h1>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
              Review Workstation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {step === 'review' && (
            <Button onClick={handleAddRoom} variant="outline" size="sm" className="rounded-xl border-sky-100 text-sky-600 font-bold">
              <PlusCircle className="w-4 h-4 mr-2" />
              Add Room
            </Button>
          )}
        </div>
      </header>

      <div className="p-6 flex-1">
        {step === 'review' && (
          <div className="max-w-5xl mx-auto space-y-8 pb-32 animate-in fade-in duration-500">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 sticky top-20 z-40">
               <div className="flex gap-10">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Cabinets</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-slate-900">{totals.primary}</span>
                      <Box className="w-5 h-5 text-sky-500" />
                    </div>
                  </div>
                  <div className="border-l border-slate-100 pl-10">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Accessories And Others</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-slate-500">{totals.other}</span>
                      <Package className="w-5 h-5 text-slate-400" />
                    </div>
                  </div>
               </div>
               <Button onClick={() => setStep('manufacturer')} className="h-12 px-10 gradient-button text-base">
                  Select Manufacturer
                  <ChevronRight className="ml-2 w-5 h-5" />
               </Button>
            </div>

            <div className="space-y-12">
              {rooms.map((room, rIdx) => {
                const groupedPrimary = {
                  'Wall Cabinets': room.primaryCabinets.filter(c => detectCategory(c.code) === 'Wall Cabinets'),
                  'Base Cabinets': room.primaryCabinets.filter(c => detectCategory(c.code) === 'Base Cabinets'),
                  'Tall Cabinets': room.primaryCabinets.filter(c => detectCategory(c.code) === 'Tall Cabinets'),
                  'Vanity Cabinets': room.primaryCabinets.filter(c => detectCategory(c.code) === 'Vanity Cabinets'),
                  'Universal Fillers': room.primaryCabinets.filter(c => detectCategory(c.code) === 'Universal Fillers'),
                };

                const groupedOther = {
                  'Hardwares': room.otherItems.filter(c => detectCategory(c.code) === 'Hardwares'),
                  'Other Accessories': room.otherItems.filter(c => !['Hardwares'].includes(detectCategory(c.code))),
                };

                return (
                  <div key={rIdx} className="space-y-6">
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
                             className="text-xl font-bold text-slate-900 border-none bg-transparent h-auto p-0 focus-visible:ring-0"
                           />
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveRoom(idx)} className="text-slate-300 hover:text-red-500">
                           <Trash2 className="w-5 h-5" />
                        </Button>
                     </div>
                     
                     <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden bg-white">
                        {Object.entries(groupedPrimary).map(([category, items], catIdx) => (
                          <div key={category} className={cn("space-y-0", catIdx !== 0 && "border-t border-slate-50")}>
                            <div className="px-6 py-2 bg-slate-50/50 flex items-center justify-between">
                               <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{category}</span>
                               <Button variant="ghost" size="sm" onClick={() => handleAddItem(rIdx, category)} className="h-6 text-[9px] uppercase font-bold text-sky-600">
                                 <Plus className="w-3 h-3 mr-1" /> Add
                               </Button>
                            </div>
                            <Table>
                              <TableBody>
                                {items.map((item) => {
                                  const actualIdx = room.primaryCabinets.findIndex(pc => pc === item);
                                  return (
                                    <TableRow key={`${category}-${actualIdx}`} className="h-14 hover:bg-slate-50 border-slate-50">
                                      <TableCell className="w-20 pl-6">
                                        <Input 
                                          type="number" 
                                          value={item.qty} 
                                          onChange={(e) => handleUpdateQty(rIdx, 'primary', actualIdx, parseInt(e.target.value) || 0)}
                                          className="w-12 h-9 text-center font-bold bg-slate-50 border-none"
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <Input 
                                          value={item.code}
                                          onChange={(e) => handleUpdateCode(rIdx, 'primary', actualIdx, e.target.value)}
                                          className="border-none bg-transparent font-bold text-slate-900 text-base"
                                          placeholder="SKU Code"
                                        />
                                      </TableCell>
                                      <TableCell className="text-right pr-6 space-x-2">
                                        <Button variant="ghost" size="icon" onClick={() => handleMove(rIdx, actualIdx, 'primary')} className="text-slate-400 hover:text-amber-600">
                                          <ArrowDownCircle className="w-5 h-5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(rIdx, 'primary', actualIdx)} className="text-slate-300 hover:text-red-500">
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                                {items.length === 0 && (
                                  <TableRow><TableCell colSpan={3} className="text-center py-4 text-[10px] text-slate-300">No {category} detected.</TableCell></TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        ))}
                     </Card>

                     <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="other" className="border-none">
                          <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden bg-slate-50/30">
                            <AccordionTrigger className="px-6 py-3 hover:no-underline">
                              <span className="text-xs font-black uppercase tracking-widest text-slate-500">Accessories And Others</span>
                            </AccordionTrigger>
                            <AccordionContent>
                              {Object.entries(groupedOther).map(([category, items]) => (
                                <div key={category} className="space-y-0">
                                  <div className="px-6 py-1.5 bg-slate-100/50 flex items-center justify-between">
                                    <span className="text-[9px] font-bold uppercase text-slate-400">{category}</span>
                                    <Button variant="ghost" size="sm" onClick={() => handleAddItem(rIdx, category)} className="h-5 text-[8px] uppercase font-bold text-slate-400">
                                      <Plus className="w-2 h-2 mr-1" /> Add
                                    </Button>
                                  </div>
                                  <Table>
                                    <TableBody>
                                      {items.map((item) => {
                                        const actualIdx = room.otherItems.findIndex(oi => oi === item);
                                        return (
                                          <TableRow key={`${category}-${actualIdx}`} className="h-12 border-slate-100/50">
                                            <TableCell className="w-20 pl-6">
                                              <Input 
                                                type="number" 
                                                value={item.qty} 
                                                onChange={(e) => handleUpdateQty(rIdx, 'other', actualIdx, parseInt(e.target.value) || 0)}
                                                className="w-10 h-8 text-center font-bold text-xs bg-white"
                                              />
                                            </TableCell>
                                            <TableCell>
                                              <Input 
                                                value={item.code}
                                                onChange={(e) => handleUpdateCode(rIdx, 'other', actualIdx, e.target.value)}
                                                className="border-none bg-transparent text-slate-500 text-sm"
                                                placeholder="Part Code"
                                              />
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                              <Button variant="ghost" size="icon" onClick={() => handleMove(rIdx, actualIdx, 'other')} className="text-slate-400 hover:text-sky-600">
                                                <ArrowUpCircle className="w-5 h-5" />
                                              </Button>
                                              <Button variant="ghost" size="icon" onClick={() => handleDelete(rIdx, 'other', actualIdx)} className="text-slate-300 hover:text-red-500">
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
          <div className="max-w-xl mx-auto py-8 space-y-6 animate-in fade-in duration-500">
            <h2 className="text-xl font-black text-center text-slate-900">Select Manufacturer</h2>
            <div className="grid grid-cols-1 gap-3">
              {manufacturers.map(m => (
                <button 
                  key={m.id}
                  onClick={() => { setSelectedManId(m.id); fetchManConfig(m.id); setStep('specifications'); }}
                  className="p-4 rounded-xl border border-slate-100 bg-white hover:border-sky-500 transition-all flex items-center gap-4 text-slate-700"
                >
                  <Factory className="w-5 h-5 text-sky-600" />
                  <span className="font-bold">{m.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'specifications' && (
          <div className="max-w-4xl mx-auto py-8 space-y-6 animate-in fade-in duration-500">
            <h2 className="text-xl font-black text-center text-slate-900">Configure Brands</h2>
            <div className="grid grid-cols-1 gap-3">
              {rooms.map((room, rIdx) => (
                <Card key={rIdx} className="p-4 rounded-xl flex items-center justify-between gap-4">
                  <span className="font-bold truncate text-slate-900">{room.room_name}</span>
                  <div className="flex gap-2">
                    <Select value={room.collection} onValueChange={(v) => {
                      const nr = [...rooms];
                      nr[rIdx].collection = v;
                      nr[rIdx].door_style = '';
                      setRooms(nr);
                    }}>
                      <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="Collection" /></SelectTrigger>
                      <SelectContent>
                        {Object.keys(manMapping).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={room.door_style} onValueChange={(v) => {
                      const nr = [...rooms];
                      nr[rIdx].door_style = v;
                      setRooms(nr);
                    }} disabled={!room.collection}>
                      <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="Style" /></SelectTrigger>
                      <SelectContent>
                        {room.collection && manMapping[room.collection]?.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </Card>
              ))}
            </div>
            <Button onClick={handleGenerateQuote} className="w-full h-12 gradient-button" disabled={isProcessing}>
              {isProcessing ? <Loader2 className="animate-spin" /> : 'Finalize Pricing'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
