
"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Settings2,
  ArrowLeft,
  ChevronRight,
  FileSearch,
  BookOpen
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateProjectAction } from '../../actions';
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

type Step = 'review' | 'manufacturer' | 'specifications';

export function EstimatorClient({ project, manufacturers }: EstimatorClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const initialSyncRef = useRef(false);
  
  const [step, setStep] = useState<Step>('review');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedManId, setSelectedManId] = useState<string>(project.manufacturer_id || '');
  
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
    } finally {
      setIsLoadingConfig(false);
    }
  }, [manufacturers]);

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
      nr[roomIdx].door_style = '';
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
        description: 'Please select a collection and door style for every room.' 
      });
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch('/api/generate-bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          manufacturerId: selectedManId
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'The server failed to generate the BOM.');
      }

      if (result.success) {
        toast({ title: 'Quote Generated', description: 'Matching SKUs to price matrix...' });
        router.push(`/quotation-ai/bom/${project.id}`);
      } else {
        throw new Error(result.error || 'Failed to process line items.');
      }
    } catch (err: any) {
      console.error('[Estimator] BOM Fetch Error:', err);
      toast({ 
        variant: 'destructive', 
        title: 'BOM Error', 
        description: err.message || 'An unexpected error occurred.' 
      });
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

  const totalUnits = rooms.reduce((acc, r) => {
    let count = 0;
    Object.values(r.sections).forEach((s: any) => {
      s.forEach((c: any) => {
        count += (Number(c.qty) || 1);
      });
    });
    return acc + count;
  }, 0);

  // --- RENDERING LOGIC ---

  if (step === 'manufacturer') {
    return (
      <div className="max-w-3xl mx-auto space-y-12 py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center space-y-3">
           <h2 className="text-4xl font-black text-slate-900 tracking-tight">Select Manufacturer</h2>
           <p className="text-slate-500 text-lg">Choose the cabinet brand to apply pricing to your takeoff.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {manufacturers.map(m => (
             <button 
               key={m.id}
               onClick={() => { setSelectedManId(m.id); fetchManConfig(m.id); }}
               className={cn(
                 "p-8 rounded-[2rem] border-2 text-left flex items-center justify-between transition-all group",
                 selectedManId === m.id ? "border-sky-500 bg-sky-50" : "border-slate-100 hover:bg-slate-50 hover:border-slate-200"
               )}
             >
                <div className="flex items-center gap-5">
                   <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center transition-all group-hover:scale-110", selectedManId === m.id ? "bg-sky-600 text-white" : "bg-white text-slate-300")}>
                      <Factory className="w-7 h-7" />
                   </div>
                   <div>
                     <span className="font-black text-xl text-slate-900 block">{m.name}</span>
                     <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Active Matrix v1.0</span>
                   </div>
                </div>
                {selectedManId === m.id && <CheckCircle2 className="w-8 h-8 text-sky-600 animate-in zoom-in" />}
             </button>
           ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-10">
           <Button variant="ghost" className="h-16 px-8 rounded-2xl font-bold text-slate-500" onClick={() => setStep('review')}>
              <ArrowLeft className="w-5 h-5 mr-2" /> Back to Review
           </Button>
           <Button 
              className="flex-1 h-16 rounded-2xl gradient-button text-lg" 
              disabled={!selectedManId}
              onClick={() => setStep('specifications')}
            >
              Continue to Specifications
              <ChevronRight className="w-5 h-5 ml-2" />
           </Button>
        </div>
      </div>
    );
  }

  if (step === 'specifications') {
    return (
      <div className="max-w-5xl mx-auto space-y-12 py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center space-y-3">
           <h2 className="text-4xl font-black text-slate-900 tracking-tight">Configure Specifications</h2>
           <p className="text-slate-500 text-lg">Select the collection and door style for each area of the project.</p>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {rooms.map((room, rIdx) => (
            <Card key={rIdx} className="rounded-[2rem] border-slate-100 shadow-sm overflow-hidden group hover:shadow-md transition-all">
              <div className="p-8 flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-2xl">
                    {room.room_name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">{room.room_name}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Configuration Required</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                  <div className="w-full sm:w-64 space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Collection</label>
                    <Select 
                      value={room.collection || ''} 
                      onValueChange={(v) => handleUpdateRoomStyle(rIdx, 'collection', v)}
                    >
                      <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none font-bold text-slate-900 shadow-sm focus:ring-sky-500">
                        <SelectValue placeholder="Select Collection" />
                      </SelectTrigger>
                      <SelectContent className="bg-white rounded-xl">
                        {getCollectionsForRoom().map(c => (
                          <SelectItem key={c} value={c} className="font-bold">{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-full sm:w-64 space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Door Style</label>
                    <Select 
                      value={room.door_style || ''} 
                      onValueChange={(v) => handleUpdateRoomStyle(rIdx, 'door_style', v)}
                      disabled={!room.collection}
                    >
                      <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none font-bold text-slate-900 shadow-sm focus:ring-sky-500 disabled:opacity-30">
                        <SelectValue placeholder="Select Style" />
                      </SelectTrigger>
                      <SelectContent className="bg-white rounded-xl">
                        {getStylesForRoom(room).map(s => (
                          <SelectItem key={s} value={s} className="font-bold">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-10">
           <Button variant="ghost" className="h-16 px-8 rounded-2xl font-bold text-slate-500" onClick={() => setStep('manufacturer')}>
              <ArrowLeft className="w-5 h-5 mr-2" /> Back to Manufacturer
           </Button>
           <Button 
              className="flex-1 h-16 rounded-2xl gradient-button text-lg group" 
              disabled={isProcessing || rooms.some(r => !r.collection || !r.door_style)}
              onClick={handleGenerateQuote}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin mr-3" />
                  Generating Final BOM...
                </>
              ) : (
                <>
                  Generate Final Quote
                  <ChevronRight className="w-6 h-6 ml-2 group-hover:translate-x-1 transition-transform" />
                </>
              )}
           </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-32 animate-in fade-in duration-700">
      {/* Step Header Summary */}
      <Card className="rounded-[2.5rem] border-slate-100 shadow-xl bg-white overflow-hidden p-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="flex items-center gap-16">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                <Layout className="w-3 h-3 text-sky-500" />
                Project Areas
              </span>
              <span className="text-4xl font-black text-slate-900 leading-none">{rooms.length}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                <Package className="w-3 h-3 text-sky-500" />
                Total Units
              </span>
              <span className="text-4xl font-black text-sky-600 leading-none">{totalUnits}</span>
            </div>
          </div>
          
          <Button 
            onClick={() => setStep('manufacturer')} 
            className="w-full md:w-auto h-16 px-12 gradient-button rounded-2xl text-lg group"
          >
            Confirm & Select Manufacturer
            <ChevronRight className="w-6 h-6 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </Card>

      {/* Takeoff Review Sections */}
      <div className="space-y-16 mt-12">
        {rooms.map((room, rIdx) => (
          <div key={rIdx} className="space-y-6">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-4">
                <div className="flex items-center gap-5">
                   <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-lg shadow-slate-200">
                      <FileSearch className="w-6 h-6" />
                   </div>
                   <Input 
                      value={room.room_name} 
                      onChange={(e) => {
                        const nr = [...rooms];
                        nr[rIdx].room_name = e.target.value;
                        setRooms(nr);
                      }}
                      className="text-2xl font-black bg-transparent border-none focus-visible:ring-0 p-0 w-80 text-slate-900"
                   />
                </div>

                <div className="flex items-center gap-3">
                  <Button onClick={() => handleAddRoom()} variant="ghost" size="sm" className="h-10 rounded-xl text-sky-600 font-bold hover:bg-sky-50">
                    <Plus className="w-4 h-4 mr-2" /> Add Area
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveRoom(rIdx)} className="text-slate-300 hover:text-red-500 hover:bg-red-50 h-10 w-10 rounded-xl">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
             </div>

             <div className="grid grid-cols-1 gap-8">
                {Object.entries(room.sections)
                  .map(([sectionKey, items]) => {
                    const cabinets = items as Cabinet[];
                    if (cabinets.length === 0) return null;

                    return (
                      <Card key={sectionKey} className="rounded-[2rem] border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-all">
                        <div className="bg-slate-50/50 px-8 py-4 border-b border-slate-100 flex items-center justify-between">
                           <span className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">{sectionKey}</span>
                           <span className="text-[10px] font-black text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-100">
                              {cabinets.length} {cabinets.length === 1 ? 'UNIT' : 'UNITS'}
                           </span>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent border-slate-100">
                              <TableHead className="w-[180px] text-[10px] font-black uppercase tracking-widest text-slate-400 pl-8">Quantity</TableHead>
                              <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cabinet SKU / Code</TableHead>
                              <TableHead className="w-[80px] text-right pr-8"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {cabinets.map((cab: Cabinet, cIdx: number) => (
                              <TableRow key={cIdx} className="border-slate-50 group transition-colors hover:bg-slate-50/30">
                                <TableCell className="pl-8">
                                  <div className="flex items-center gap-3">
                                    <button 
                                      onClick={() => handleUpdateCabinet(rIdx, sectionKey, cIdx, { qty: Math.max(1, (Number(cab.qty) || 1) - 1) })}
                                      className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-sky-100 hover:text-sky-600 transition-colors"
                                    >
                                      <Minus className="w-4 h-4" />
                                    </button>
                                    <Input 
                                      type="number" 
                                      value={cab.qty || 1} 
                                      onChange={(e) => handleUpdateCabinet(rIdx, sectionKey, cIdx, { qty: parseInt(e.target.value) || 1 })}
                                      className="w-16 h-10 text-center bg-white border border-slate-200 rounded-xl font-black text-slate-900 focus-visible:ring-sky-500"
                                    />
                                    <button 
                                      onClick={() => handleUpdateCabinet(rIdx, sectionKey, cIdx, { qty: (Number(cab.qty) || 1) + 1 })}
                                      className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-sky-100 hover:text-sky-600 transition-colors"
                                    >
                                      <Plus className="w-4 h-4" />
                                    </button>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Input 
                                    value={cab.code} 
                                    onChange={(e) => handleUpdateCabinet(rIdx, sectionKey, cIdx, { code: e.target.value.toUpperCase() })}
                                    className="h-12 font-black text-xl text-sky-600 bg-transparent border-none focus-visible:ring-1 focus-visible:ring-sky-100 rounded-xl"
                                    placeholder="ENTER SKU"
                                  />
                                </TableCell>
                                <TableCell className="text-right pr-8">
                                  <button 
                                    onClick={() => handleRemoveCabinet(rIdx, sectionKey, cIdx)}
                                    className="opacity-0 group-hover:opacity-100 w-10 h-10 rounded-xl bg-red-50 text-red-400 hover:text-red-600 hover:bg-red-100 flex items-center justify-center transition-all"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="hover:bg-transparent border-none">
                              <TableCell colSpan={3} className="p-6 pl-8">
                                <button 
                                  onClick={() => handleAddRow(rIdx, sectionKey)}
                                  className="text-[10px] font-black text-sky-600 uppercase tracking-[0.2em] flex items-center gap-2 hover:text-sky-700 hover:gap-3 transition-all"
                                >
                                  <Plus className="w-4 h-4" />
                                  Add New Line Item
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

        <div className="flex justify-center pt-10">
           <Button onClick={() => handleAddRoom()} variant="outline" className="h-16 px-10 rounded-2xl border-dashed border-2 border-slate-200 text-slate-500 hover:border-sky-500 hover:text-sky-600 hover:bg-sky-50/50 transition-all font-bold">
              <Plus className="w-5 h-5 mr-3" />
              Add Project Area
           </Button>
        </div>
      </div>
    </div>
  );
}
