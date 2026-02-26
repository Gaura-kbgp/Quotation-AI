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
  ArrowRight,
  DollarSign,
  Info,
  Settings2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateProjectAction, generateBOMAction } from '../../actions';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { MANUFACTURER_CONFIG } from '@/lib/manufacturer-config';

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

export function EstimatorClient({ project, manufacturers }: EstimatorClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const initialSyncRef = useRef(false);
  
  const [step, setStep] = useState<'review' | 'manufacturer'>('review');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedManId, setSelectedManId] = useState<string>(project.manufacturer_id || '');
  
  // Track DB-fetched configs for non-hardcoded manufacturers
  const [dbConfigs, setDbConfigs] = useState<Record<string, { collections: string[], styles: string[] }>>({});
  
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  const selectedManufacturer = useMemo(() => 
    manufacturers.find(m => m.id === selectedManId), 
    [manufacturers, selectedManId]
  );

  const fetchManConfig = useCallback(async (id: string) => {
    if (!id) return;
    const man = manufacturers.find(m => m.id === id);
    if (!man || man.name === "1951 Cabinetry") return;
    
    setIsLoadingConfig(true);
    try {
      const res = await fetch(`/api/manufacturer-config?id=${id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDbConfigs(prev => ({
        ...prev,
        [id]: {
          collections: data.collections || [],
          styles: data.styles || []
        }
      }));
    } catch (err: any) {
      console.error('[Estimator] Config Fetch Error:', err);
      toast({ variant: 'destructive', title: 'Data Error', description: 'Failed to load brand configuration.' });
    } finally {
      setIsLoadingConfig(false);
    }
  }, [manufacturers, toast]);

  useEffect(() => {
    if (initialSyncRef.current) return;
    
    if (project.extracted_data?.rooms && project.extracted_data.rooms.length > 0) {
      setRooms(project.extracted_data.rooms);
    } else {
      setRooms([{
        room_name: 'Project Area',
        room_type: 'Kitchen',
        sections: {
          'Wall Cabinets': [],
          'Base Cabinets': [],
          'Tall Cabinets': [],
          'Vanity Cabinets': [],
          'Hardware': []
        }
      }]);
    }

    if (project.manufacturer_id) {
      fetchManConfig(project.manufacturer_id);
    }
    initialSyncRef.current = true;
  }, [project, fetchManConfig]);

  // Auto-save logic
  useEffect(() => {
    if (!initialSyncRef.current || rooms.length === 0) return;
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await updateProjectAction(project.id, { 
          extracted_data: { rooms },
          manufacturer_id: selectedManId || null
        });
      } catch (e) {
        console.error('Auto-save error:', e);
      } finally {
        setIsSaving(false);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [rooms, project.id, selectedManId]);

  const handleUpdateCabinet = (roomIdx: number, sectionKey: string, cabIdx: number, updates: Partial<Cabinet>) => {
    const nr = [...rooms];
    nr[roomIdx].sections[sectionKey][cabIdx] = { ...nr[roomIdx].sections[sectionKey][cabIdx], ...updates };
    setRooms(nr);
  };

  const handleUpdateRoomStyle = (roomIdx: number, field: 'collection' | 'door_style', value: string) => {
    const nr = [...rooms];
    if (field === 'collection') {
      nr[roomIdx].collection = value;
      nr[roomIdx].door_style = ''; // Reset style when collection changes
    } else {
      nr[roomIdx].door_style = value;
    }
    setRooms(nr);
  };

  const handleAddRow = (roomIdx: number, sectionKey: string) => {
    const nr = [...rooms];
    nr[roomIdx].sections[sectionKey].push({
      code: '',
      qty: 1,
      type: sectionKey
    });
    setRooms(nr);
  };

  const handleRemoveCabinet = (roomIdx: number, sectionKey: string, cabIdx: number) => {
    const nr = [...rooms];
    nr[roomIdx].sections[sectionKey].splice(cabIdx, 1);
    setRooms(nr);
  };

  const handleAddRoom = () => {
    setRooms([...rooms, {
      room_name: `New Area ${rooms.length + 1}`,
      room_type: 'Kitchen',
      sections: {
        'Wall Cabinets': [],
        'Base Cabinets': [],
        'Tall Cabinets': [],
        'Vanity Cabinets': [],
        'Hardware': []
      }
    }]);
  };

  const handleRemoveRoom = (idx: number) => {
    if (!confirm('Delete this area and all its cabinets?')) return;
    const nr = [...rooms];
    nr.splice(idx, 1);
    setRooms(nr);
  };

  const handleGenerateQuote = async () => {
    const missingSelections = rooms.some(r => !r.collection || !r.door_style);
    if (missingSelections) {
      toast({ 
        variant: 'destructive', 
        title: 'Missing Specifications', 
        description: 'Please select a collection and door style for every room before generating the quote.' 
      });
      return;
    }

    setIsProcessing(true);
    try {
      const result = await generateBOMAction(project.id, selectedManId);
      if (result.success) {
        router.push(`/quotation-ai/bom/${project.id}`);
      } else {
        throw new Error(result.error);
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
      setIsProcessing(false);
    }
  };

  const getCollectionsForRoom = () => {
    if (selectedManufacturer?.name === "1951 Cabinetry") {
      return MANUFACTURER_CONFIG["1951 Cabinetry"].collections.map(c => c.name);
    }
    return dbConfigs[selectedManId]?.collections || [];
  };

  const getStylesForRoom = (room: Room) => {
    if (!room.collection) return [];
    if (selectedManufacturer?.name === "1951 Cabinetry") {
      return MANUFACTURER_CONFIG["1951 Cabinetry"].collections.find(c => c.name === room.collection)?.styles || [];
    }
    return dbConfigs[selectedManId]?.styles || [];
  };

  const totalSkus = rooms.reduce((acc, r) => {
    let count = 0;
    Object.values(r.sections).forEach((s: any) => {
      s.forEach((c: any) => {
        count += (Number(c.qty) || 1);
      });
    });
    return acc + count;
  }, 0);

  if (step === 'manufacturer') {
    return (
      <div className="max-w-xl mx-auto space-y-12 py-12 animate-in slide-in-from-bottom-4">
        <div className="text-center space-y-3">
           <h2 className="text-3xl font-black text-slate-900">Brand Selection</h2>
           <p className="text-slate-500">Apply pricing matrix to current takeoff.</p>
        </div>
        <div className="grid grid-cols-1 gap-4">
           {manufacturers.map(m => (
             <button 
               key={m.id}
               onClick={() => { setSelectedManId(m.id); fetchManConfig(m.id); setStep('review'); }}
               className={cn(
                 "p-6 rounded-2xl border-2 text-left flex items-center justify-between transition-all",
                 selectedManId === m.id ? "border-sky-500 bg-sky-50" : "border-slate-100 hover:bg-slate-50"
               )}
             >
                <div className="flex items-center gap-5">
                   <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center transition-colors", selectedManId === m.id ? "bg-sky-600 text-white" : "bg-white text-slate-400")}>
                      <Factory className="w-6 h-6" />
                   </div>
                   <span className="font-bold text-xl text-slate-900">{m.name}</span>
                </div>
                {selectedManId === m.id && <CheckCircle2 className="w-6 h-6 text-sky-600" />}
             </button>
           ))}
        </div>
        <div className="flex gap-4 pt-4">
           <Button variant="outline" className="w-full h-14 rounded-xl font-bold" onClick={() => setStep('review')}>Back to Review</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-24 animate-in fade-in duration-500">
      {/* Project Header Summary */}
      <Card className="rounded-[2rem] border-slate-100 shadow-xl bg-white overflow-hidden">
        <div className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-10">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Rooms</span>
              <span className="text-3xl font-black text-slate-900">{rooms.length}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Active Units</span>
              <span className="text-3xl font-black text-sky-600">{totalSkus}</span>
            </div>
            <div className="hidden lg:flex flex-col pl-10 border-l border-slate-100">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Selected Brand</span>
              <div className="flex items-center gap-2">
                <Factory className="w-4 h-4 text-sky-500" />
                <span className="text-lg font-bold text-slate-900">{selectedManufacturer?.name || 'Unspecified'}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4 w-full md:w-auto">
            <Button variant="outline" onClick={() => setStep('manufacturer')} className="flex-1 md:flex-none h-14 px-6 rounded-xl border-slate-200">
              <Settings2 className="w-4 h-4 mr-2" />
              Change Brand
            </Button>
            <Button 
              onClick={handleGenerateQuote} 
              disabled={isProcessing || !selectedManId}
              className="flex-1 md:flex-none h-14 px-10 gradient-button rounded-xl text-md group"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DollarSign className="w-4 h-4 mr-2" />}
              Generate Final Quote
            </Button>
          </div>
        </div>
      </Card>

      {/* Areas & Table Schedules */}
      <div className="space-y-12">
        {rooms.map((room, rIdx) => (
          <div key={rIdx} className="space-y-6">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-2">
                <div className="flex items-center gap-4">
                   <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white">
                      <Package className="w-5 h-5" />
                   </div>
                   <Input 
                      value={room.room_name} 
                      onChange={(e) => {
                        const nr = [...rooms];
                        nr[rIdx].room_name = e.target.value;
                        setRooms(nr);
                      }}
                      className="text-xl font-bold bg-transparent border-none focus-visible:ring-0 p-0 w-64 text-slate-900"
                   />
                </div>

                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                  {selectedManId && (
                    <div className="flex items-center gap-3 bg-slate-50 p-1.5 pr-4 rounded-xl border border-slate-100">
                      <Select 
                        value={room.collection || ''} 
                        onValueChange={(v) => handleUpdateRoomStyle(rIdx, 'collection', v)}
                      >
                        <SelectTrigger className="w-[180px] h-10 rounded-lg border-none bg-white font-bold text-xs shadow-sm">
                          <SelectValue placeholder="Collection" />
                        </SelectTrigger>
                        <SelectContent className="bg-white rounded-xl">
                          {getCollectionsForRoom().map(c => (
                            <SelectItem key={c} value={c} className="font-bold">{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select 
                        value={room.door_style || ''} 
                        onValueChange={(v) => handleUpdateRoomStyle(rIdx, 'door_style', v)}
                        disabled={!room.collection}
                      >
                        <SelectTrigger className="w-[180px] h-10 rounded-lg border-none bg-white font-bold text-xs shadow-sm">
                          <SelectValue placeholder="Door Style" />
                        </SelectTrigger>
                        <SelectContent className="bg-white rounded-xl">
                          {getStylesForRoom(room).map(s => (
                            <SelectItem key={s} value={s} className="font-bold">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2">
                    <Button onClick={() => handleAddRoom()} variant="ghost" size="sm" className="text-sky-600 hover:bg-sky-50">
                      <Plus className="w-4 h-4 mr-2" /> Add Area
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleRemoveRoom(rIdx)} className="text-slate-300 hover:text-red-500 h-9 w-9">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
             </div>

             <div className="grid grid-cols-1 gap-8">
                {Object.entries(room.sections)
                  .filter(([_, items]) => (items as Cabinet[]).length > 0)
                  .map(([sectionKey, items]) => {
                    const cabinets = items as Cabinet[];
                    return (
                      <Card key={sectionKey} className="rounded-2xl border-slate-100 overflow-hidden shadow-sm">
                        <div className="bg-slate-50/50 px-6 py-3 border-b border-slate-100 flex items-center justify-between">
                           <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{sectionKey}</span>
                           <span className="text-[10px] font-bold text-slate-400">{cabinets.length} units</span>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent border-slate-100">
                              <TableHead className="w-[160px] text-[10px] font-bold uppercase tracking-widest text-slate-400 pl-6">Quantity</TableHead>
                              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cabinet SKU / Code</TableHead>
                              <TableHead className="w-[60px] text-right pr-6"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {cabinets.map((cab: Cabinet, cIdx: number) => (
                              <TableRow key={cIdx} className="border-slate-50 group">
                                <TableCell className="pl-6">
                                  <div className="flex items-center gap-2">
                                    <button 
                                      onClick={() => handleUpdateCabinet(rIdx, sectionKey, cIdx, { qty: Math.max(1, (Number(cab.qty) || 1) - 1) })}
                                      className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-sky-100 hover:text-sky-600"
                                    >
                                      <Minus className="w-3.5 h-3.5" />
                                    </button>
                                    <Input 
                                      type="number" 
                                      value={cab.qty || 1} 
                                      onChange={(e) => handleUpdateCabinet(rIdx, sectionKey, cIdx, { qty: parseInt(e.target.value) || 1 })}
                                      className="w-14 h-8 text-center bg-white border border-slate-200 rounded-lg font-bold text-slate-900"
                                    />
                                    <button 
                                      onClick={() => handleUpdateCabinet(rIdx, sectionKey, cIdx, { qty: (Number(cab.qty) || 1) + 1 })}
                                      className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-sky-100 hover:text-sky-600"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Input 
                                    value={cab.code} 
                                    onChange={(e) => handleUpdateCabinet(rIdx, sectionKey, cIdx, { code: e.target.value.toUpperCase() })}
                                    className="h-10 font-bold text-lg text-sky-600 bg-transparent border-none focus-visible:ring-1 focus-visible:ring-sky-100"
                                    placeholder="SKU"
                                  />
                                </TableCell>
                                <TableCell className="text-right pr-6">
                                  <button 
                                    onClick={() => handleRemoveCabinet(rIdx, sectionKey, cIdx)}
                                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="hover:bg-transparent border-none">
                              <TableCell colSpan={3} className="p-4 pl-6">
                                <button 
                                  onClick={() => handleAddRow(rIdx, sectionKey)}
                                  className="text-[10px] font-bold text-sky-600 uppercase tracking-widest flex items-center gap-2 hover:text-sky-700"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Add Line Item
                                </button>
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </Card>
                    );
                  })}
             </div>
          </div>
        ))}
      </div>
    </div>
  );
}
