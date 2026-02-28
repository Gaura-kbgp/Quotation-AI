"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateProjectAction } from '../../actions';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
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

  const handleGenerateQuote = async () => {
    if (rooms.some(r => !r.collection || !r.door_style)) {
      toast({ variant: 'destructive', title: 'Missing Selection', description: 'Apply specs to all rooms.' });
      return;
    }
    setIsProcessing(true);
    try {
      // Flatten classified items back to the storage structure expected by generate-bom
      const processedRooms = rooms.map(r => ({
        ...r,
        sections: {
          'Wall Cabinets': r.primaryCabinets, // Simple mapping for now
          'Other Items': r.otherItems
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

  if (step === 'review') {
    return (
      <div className="max-w-5xl mx-auto space-y-8 pb-32">
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
          {rooms.map((room, rIdx) => (
            <div key={rIdx} className="space-y-6">
               <h3 className="text-xl font-bold text-slate-900 px-2 border-l-4 border-sky-500 pl-4">{room.room_name}</h3>
               
               <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden bg-white">
                  <div className="px-6 py-3 bg-sky-50/50 border-b border-sky-100 flex justify-between items-center">
                    <span className="text-xs font-black uppercase tracking-widest text-sky-700">Kitchen & Bathroom Cabinets</span>
                    <span className="text-[10px] font-bold text-sky-600 bg-white px-2 py-0.5 rounded-full border border-sky-100">{room.primaryCabinets.length} Types</span>
                  </div>
                  <Table>
                    <TableBody>
                      {room.primaryCabinets.map((item, iIdx) => (
                        <TableRow key={iIdx} className="h-14 hover:bg-slate-50/50 border-slate-50">
                          <TableCell className="w-20 pl-6">
                            <Input 
                              type="number" 
                              value={item.qty} 
                              onChange={(e) => handleUpdateQty(rIdx, 'primary', iIdx, parseInt(e.target.value) || 0)}
                              className="w-12 h-9 text-center font-bold text-sm bg-slate-50 border-none rounded-lg"
                            />
                          </TableCell>
                          <TableCell>
                            <Input 
                              value={item.code}
                              onChange={(e) => handleUpdateCode(rIdx, 'primary', iIdx, e.target.value)}
                              className="border-none bg-transparent font-bold text-slate-900 text-base p-0 h-9"
                            />
                          </TableCell>
                          <TableCell className="text-right pr-6 space-x-2">
                            <Button variant="ghost" size="icon" onClick={() => handleMove(rIdx, iIdx, 'primary')} className="text-slate-400 hover:text-amber-600" title="Move to Other">
                              <ArrowDownCircle className="w-5 h-5" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(rIdx, 'primary', iIdx)} className="text-slate-300 hover:text-red-500">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
               </Card>

               <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="other" className="border-none">
                    <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden bg-slate-50/30">
                      <AccordionTrigger className="px-6 py-3 hover:no-underline">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black uppercase tracking-widest text-slate-500">Other Items & Accessories</span>
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
                            {room.otherItems.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={3} className="text-center py-8 text-slate-400 text-xs italic">No other items detected in this room.</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </AccordionContent>
                    </Card>
                  </AccordionItem>
               </Accordion>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (step === 'manufacturer') {
    return (
      <div className="max-w-2xl mx-auto py-12 space-y-8 animate-in fade-in duration-500">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold">Select Manufacturer</h2>
          <p className="text-sm text-slate-500">Choose the brand for this architectural takeoff.</p>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {manufacturers.map(m => (
            <button 
              key={m.id}
              onClick={() => { setSelectedManId(m.id); fetchManConfig(m.id); setStep('specifications'); }}
              className="p-6 rounded-2xl border border-slate-100 bg-white hover:border-sky-500 hover:bg-sky-50 transition-all flex items-center gap-4 shadow-sm group"
            >
              <div className="w-12 h-12 rounded-xl bg-sky-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform"><Factory className="w-6 h-6" /></div>
              <span className="text-xl font-bold text-slate-900">{m.name}</span>
              <ChevronRight className="ml-auto w-6 h-6 text-slate-300 group-hover:text-sky-500" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-12 space-y-8 animate-in fade-in duration-500">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold">Configure Specifications</h2>
        <p className="text-sm text-slate-500">Apply Collection and Door Style to each area.</p>
      </div>
      
      <div className="grid grid-cols-1 gap-4">
        {rooms.map((room, rIdx) => (
          <Card key={rIdx} className="p-6 rounded-2xl border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 bg-white">
            <h3 className="text-lg font-bold w-full md:w-1/3 truncate">{room.room_name}</h3>
            <div className="flex gap-4 w-full md:w-auto">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Collection</span>
                <Select value={room.collection} onValueChange={(v) => {
                  const nr = [...rooms];
                  nr[rIdx].collection = v;
                  nr[rIdx].door_style = '';
                  setRooms(nr);
                }}>
                  <SelectTrigger className="w-48 h-11 rounded-xl">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(manMapping).map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Door Style</span>
                <Select value={room.door_style} onValueChange={(v) => {
                  const nr = [...rooms];
                  nr[rIdx].door_style = v;
                  setRooms(nr);
                }} disabled={!room.collection}>
                  <SelectTrigger className="w-48 h-11 rounded-xl">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {room.collection && manMapping[room.collection]?.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex gap-4 pt-8">
        <Button variant="ghost" onClick={() => setStep('manufacturer')} className="h-14 px-8 rounded-2xl font-bold text-slate-500">
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </Button>
        <Button 
          onClick={handleGenerateQuote} 
          className="flex-1 h-14 gradient-button text-lg rounded-2xl shadow-sky-500/10" 
          disabled={isProcessing}
        >
          {isProcessing ? <Loader2 className="animate-spin w-5 h-5 mr-3" /> : <CheckCircle2 className="w-5 h-5 mr-3" />}
          {isProcessing ? 'Finalizing Pricing...' : 'Generate Final Quotation'}
        </Button>
      </div>
    </div>
  );
}
