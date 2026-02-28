
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
  Layout,
  Minus,
  CheckCircle2,
  Factory,
  Loader2,
  Package,
  ChevronRight,
  ArrowLeft,
  FileSearch,
  Box
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateProjectAction } from '../../actions';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface Cabinet {
  code: string;
  qty: number;
  type: string;
}

interface Room {
  room_name: string;
  room_type: string;
  collection?: string;
  door_style?: string;
  sections: {
    [key: string]: Cabinet[];
  };
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

  const fetchManConfig = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/manufacturer-config?id=${id}`);
      if (!res.ok) throw new Error('Failed to load manufacturer data');
      
      const data = await res.json();
      setManMapping(data.mapping || {});
    } catch (err: any) {
      console.error('Config Error:', err);
      toast({ 
        variant: 'destructive', 
        title: 'Error', 
        description: 'Could not load manufacturer specifications.' 
      });
    }
  }, [toast]);

  useEffect(() => {
    if (initialSyncRef.current) return;
    if (project.extracted_data?.rooms) {
      setRooms(project.extracted_data.rooms);
    }
    if (project.manufacturer_id) fetchManConfig(project.manufacturer_id);
    initialSyncRef.current = true;
  }, [project, fetchManConfig]);

  const totalUnits = useMemo(() => {
    return rooms.reduce((acc, room) => {
      let roomTotal = 0;
      Object.values(room.sections).forEach((items) => {
        (items as Cabinet[]).forEach((cab) => {
          roomTotal += (Number(cab.qty) || 0);
        });
      });
      return acc + roomTotal;
    }, 0);
  }, [rooms]);

  const handleUpdateRoomStyle = (roomIdx: number, field: 'collection' | 'door_style', value: string) => {
    const nr = [...rooms];
    if (field === 'collection') {
      nr[roomIdx].collection = value;
      nr[roomIdx].door_style = '';
    } else {
      nr[roomIdx].door_style = value;
    }
    setRooms(nr);
  };

  const handleGenerateQuote = async () => {
    if (rooms.some(r => !r.collection || !r.door_style)) {
      toast({ 
        variant: 'destructive', 
        title: 'Missing Selection', 
        description: 'Please select both Collection and Door Style for all rooms.' 
      });
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
        toast({ title: 'Success', description: 'BOM generated and priced.' });
        router.push(`/quotation-ai/bom/${project.id}`);
      } else {
        throw new Error(result.error);
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  if (step === 'review') {
    return (
      <div className="max-w-6xl mx-auto space-y-8 pb-20">
        {/* Compact Summary Bar */}
        <div className="flex justify-between items-center bg-white p-5 rounded-2xl shadow-sm border border-slate-100 sticky top-[72px] z-40">
           <div className="flex gap-8">
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Takeoff Areas</span>
                <span className="text-2xl font-black text-slate-900">{rooms.length}</span>
              </div>
              <div className="flex flex-col border-l border-slate-100 pl-8">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Total Units</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-slate-900">{totalUnits}</span>
                  <Box className="w-4 h-4 text-sky-500" />
                </div>
              </div>
           </div>
           <Button onClick={() => setStep('manufacturer')} className="h-11 px-8 gradient-button text-sm">
              Next: Select Brand
              <ChevronRight className="ml-2 w-4 h-4" />
           </Button>
        </div>

        <div className="space-y-10 mt-8">
          {rooms.map((room, rIdx) => (
            <div key={rIdx} className="space-y-4">
               <div className="px-2">
                 <textarea 
                    value={room.room_name} 
                    onChange={(e) => {
                      const nr = [...rooms];
                      nr[rIdx].room_name = e.target.value;
                      setRooms(nr);
                    }}
                    className="text-lg font-semibold text-slate-900 bg-transparent border-none p-0 w-full focus:ring-0 resize-none overflow-hidden leading-tight break-words whitespace-normal font-headline"
                    rows={1}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = target.scrollHeight + 'px';
                    }}
                 />
               </div>

               <div className="grid grid-cols-1 gap-4">
                  {Object.entries(room.sections).map(([key, items]) => (
                    (items as Cabinet[]).length > 0 && (
                      <Card key={key} className="rounded-xl border-slate-100 shadow-sm overflow-hidden">
                        <div className="px-4 py-2 bg-slate-50/50 border-b border-slate-100 text-[9px] font-bold uppercase tracking-widest text-slate-500">{key}</div>
                        <Table>
                          <TableBody>
                            {(items as Cabinet[]).map((cab, cIdx) => (
                              <TableRow key={cIdx} className="h-10 hover:bg-slate-50/50 border-slate-50">
                                <TableCell className="pl-4 w-16">
                                  <Input 
                                    type="number" 
                                    value={cab.qty} 
                                    onChange={(e) => {
                                      const nr = [...rooms];
                                      (nr[rIdx].sections[key] as Cabinet[])[cIdx].qty = parseInt(e.target.value) || 0;
                                      setRooms(nr);
                                    }}
                                    className="w-10 h-7 text-center font-bold text-xs p-0 bg-white"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input 
                                    value={cab.code}
                                    onChange={(e) => {
                                      const nr = [...rooms];
                                      (nr[rIdx].sections[key] as Cabinet[])[cIdx].code = e.target.value.toUpperCase();
                                      setRooms(nr);
                                    }}
                                    className="border-none bg-transparent font-bold text-sky-600 focus:ring-0 text-sm p-0 h-7"
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Card>
                    )
                  ))}
               </div>
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
          <h2 className="text-2xl font-bold font-headline">Select Manufacturer</h2>
          <p className="text-xs text-slate-500">Choose the brand for this architectural takeoff.</p>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {manufacturers.map(m => (
            <button 
              key={m.id}
              onClick={() => { setSelectedManId(m.id); fetchManConfig(m.id); setStep('specifications'); }}
              className="p-5 rounded-xl border border-slate-100 bg-white hover:border-sky-500 hover:bg-sky-50 transition-all flex items-center gap-4 shadow-sm group"
            >
              <div className="w-10 h-10 rounded-lg bg-sky-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform"><Factory className="w-5 h-5" /></div>
              <span className="text-lg font-bold text-slate-900">{m.name}</span>
              <ChevronRight className="ml-auto w-5 h-5 text-slate-300 group-hover:text-sky-500" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-12 space-y-8 animate-in fade-in duration-500">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold font-headline">Configure Specifications</h2>
        <p className="text-xs text-slate-500">Apply Collection and Door Style to each area.</p>
      </div>
      
      <div className="grid grid-cols-1 gap-4">
        {rooms.map((room, rIdx) => (
          <Card key={rIdx} className="p-5 rounded-2xl border-slate-100 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white">
            <h3 className="text-base font-bold max-w-xs font-headline break-words leading-tight">{room.room_name}</h3>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <div className="space-y-1 flex-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Collection</span>
                <Select value={room.collection} onValueChange={(v) => handleUpdateRoomStyle(rIdx, 'collection', v)}>
                  <SelectTrigger className="w-full sm:w-48 h-10 text-xs rounded-lg border-slate-200">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {Object.keys(manMapping).map(c => (
                      <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-1 flex-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Style</span>
                <Select 
                  value={room.door_style} 
                  onValueChange={(v) => handleUpdateRoomStyle(rIdx, 'door_style', v)} 
                  disabled={!room.collection}
                >
                  <SelectTrigger className="w-full sm:w-48 h-10 text-xs rounded-lg border-slate-200">
                    <SelectValue placeholder={!room.collection ? "Wait..." : "Select"} />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
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

      <div className="flex gap-3">
        <Button variant="ghost" onClick={() => setStep('manufacturer')} className="h-12 px-6 rounded-xl font-bold text-slate-500 text-sm">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button 
          onClick={handleGenerateQuote} 
          className="flex-1 h-12 gradient-button text-base rounded-xl shadow-sky-500/10" 
          disabled={isProcessing}
        >
          {isProcessing ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          {isProcessing ? 'Finalizing...' : 'Generate Final Pricing'}
        </Button>
      </div>
    </div>
  );
}
