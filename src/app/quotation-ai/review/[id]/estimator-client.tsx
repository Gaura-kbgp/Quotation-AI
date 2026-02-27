"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
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
  const [dbConfigs, setDbConfigs] = useState<Record<string, { collections: string[], styles: string[] }>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchManConfig = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/manufacturer-config?id=${id}`);
      const data = await res.json();
      setDbConfigs(prev => ({
        ...prev,
        [id]: { collections: data.collections || [], styles: data.styles || [] }
      }));
    } catch (err) {
      console.error('Config Error:', err);
    }
  }, []);

  useEffect(() => {
    if (initialSyncRef.current) return;
    if (project.extracted_data?.rooms) {
      setRooms(project.extracted_data.rooms);
    }
    if (project.manufacturer_id) fetchManConfig(project.manufacturer_id);
    initialSyncRef.current = true;
  }, [project, fetchManConfig]);

  // Live calculation of total cabinets across all rooms and sections
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
      toast({ variant: 'destructive', title: 'Missing Specs', description: 'Select Collection and Style for all areas.' });
      return;
    }
    setIsProcessing(true);
    try {
      await updateProjectAction(project.id, { extracted_data: { rooms }, manufacturer_id: selectedManId });
      const res = await fetch('/api/generate-bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, manufacturerId: selectedManId })
      });
      const result = await res.json();
      if (result.success) router.push(`/quotation-ai/bom/${project.id}`);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to generate pricing.' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (step === 'review') {
    return (
      <div className="max-w-7xl mx-auto space-y-12 pb-32">
        <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
           <div className="flex gap-16">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Takeoff Areas</span>
                <span className="text-4xl font-black text-slate-900">{rooms.length}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Units</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black text-slate-900">{totalUnits}</span>
                  <Box className="w-5 h-5 text-sky-500" />
                </div>
              </div>
           </div>
           <Button onClick={() => setStep('manufacturer')} className="h-16 px-12 gradient-button text-lg">
              Next: Select Brand
              <ChevronRight className="ml-2 w-5 h-5" />
           </Button>
        </div>

        <div className="space-y-16 mt-12">
          {rooms.map((room, rIdx) => (
            <div key={rIdx} className="space-y-6">
               <div className="px-4">
                 <textarea 
                    value={room.room_name} 
                    onChange={(e) => {
                      const nr = [...rooms];
                      nr[rIdx].room_name = e.target.value;
                      setRooms(nr);
                    }}
                    className="text-2xl font-semibold text-slate-900 bg-transparent border-none p-0 w-full focus:ring-0 resize-none overflow-hidden leading-[1.4] break-words whitespace-normal"
                    rows={1}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = target.scrollHeight + 'px';
                    }}
                 />
               </div>

               <div className="grid grid-cols-1 gap-8">
                  {Object.entries(room.sections).map(([key, items]) => (
                    items.length > 0 && (
                      <Card key={key} className="rounded-[2rem] border-slate-100 shadow-sm">
                        <div className="px-8 py-4 bg-slate-50/50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-500">{key}</div>
                        <Table>
                          <TableBody>
                            {(items as Cabinet[]).map((cab, cIdx) => (
                              <TableRow key={cIdx} className="h-16 border-slate-50">
                                <TableCell className="pl-8 w-24">
                                  <div className="flex items-center gap-2">
                                    <Input 
                                      type="number" 
                                      value={cab.qty} 
                                      onChange={(e) => {
                                        const nr = [...rooms];
                                        (nr[rIdx].sections[key] as Cabinet[])[cIdx].qty = parseInt(e.target.value) || 0;
                                        setRooms(nr);
                                      }}
                                      className="w-12 h-8 text-center font-bold"
                                    />
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Input 
                                    value={cab.code}
                                    onChange={(e) => {
                                      const nr = [...rooms];
                                      (nr[rIdx].sections[key] as Cabinet[])[cIdx].code = e.target.value.toUpperCase();
                                      setRooms(nr);
                                    }}
                                    className="border-none bg-transparent font-bold text-sky-600 focus:ring-0 text-lg p-0"
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
      <div className="max-w-3xl mx-auto py-20 space-y-12">
        <h2 className="text-4xl font-bold text-center">Select Cabinet Manufacturer</h2>
        <div className="grid grid-cols-1 gap-4">
          {manufacturers.map(m => (
            <button 
              key={m.id}
              onClick={() => { setSelectedManId(m.id); fetchManConfig(m.id); setStep('specifications'); }}
              className="p-8 rounded-3xl border-2 border-slate-100 hover:border-sky-500 hover:bg-sky-50 transition-all flex items-center gap-6"
            >
              <div className="w-14 h-14 rounded-2xl bg-sky-600 text-white flex items-center justify-center"><Factory /></div>
              <span className="text-2xl font-bold">{m.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-20 space-y-12">
      <h2 className="text-4xl font-bold text-center">Configure Specifications</h2>
      <div className="grid grid-cols-1 gap-6">
        {rooms.map((room, rIdx) => (
          <Card key={rIdx} className="p-8 rounded-[2.5rem] border-slate-100 shadow-sm flex items-center justify-between">
            <h3 className="text-xl font-bold max-w-xs">{room.room_name}</h3>
            <div className="flex gap-4">
              <Select value={room.collection} onValueChange={(v) => handleUpdateRoomStyle(rIdx, 'collection', v)}>
                <SelectTrigger className="w-64 h-12 rounded-xl">
                  <SelectValue placeholder="Collection" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {dbConfigs[selectedManId]?.collections.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={room.door_style} onValueChange={(v) => handleUpdateRoomStyle(rIdx, 'door_style', v)} disabled={!room.collection}>
                <SelectTrigger className="w-64 h-12 rounded-xl">
                  <SelectValue placeholder="Door Style" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {dbConfigs[selectedManId]?.styles.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </Card>
        ))}
      </div>
      <Button 
        onClick={handleGenerateQuote} 
        className="w-full h-16 gradient-button text-xl rounded-2xl" 
        disabled={isProcessing}
      >
        {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle2 className="mr-2" />}
        Finalize Pricing
      </Button>
    </div>
  );
}
