
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
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
  ChevronRight,
  Layout,
  Minus,
  CheckCircle2,
  Factory,
  Loader2,
  Package,
  ArrowRight,
  DollarSign,
  Info
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateProjectAction, generateBOMAction } from '../../actions';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface Cabinet {
  code: string;
  qty: number;
  type: string;
}

interface EstimatorClientProps {
  project: any;
  manufacturers: any[];
}

export function EstimatorClient({ project, manufacturers }: EstimatorClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const initialSyncRef = useRef(false);
  
  const [step, setStep] = useState<'review' | 'manufacturer' | 'specifications'>('review');
  const [rooms, setRooms] = useState<any[]>([]);
  const [selectedManId, setSelectedManId] = useState<string>(project.manufacturer_id || '');
  const [manConfig, setManConfig] = useState<{ collections: string[], styles: string[] }>({ collections: [], styles: [] });
  const [selection, setSelection] = useState({
    collection: project.selected_collection || '',
    doorStyle: project.selected_door_style || '',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  const fetchManConfig = useCallback(async (id: string) => {
    if (!id) return;
    setIsLoadingConfig(true);
    try {
      const res = await fetch(`/api/manufacturer-config?id=${id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setManConfig({
        collections: data.collections || [],
        styles: data.styles || []
      });
    } catch (err: any) {
      console.error('[Estimator] Config Fetch Error:', err);
      toast({ variant: 'destructive', title: 'Data Error', description: 'Failed to load brand configuration.' });
    } finally {
      setIsLoadingConfig(false);
    }
  }, [toast]);

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

  useEffect(() => {
    if (!initialSyncRef.current || rooms.length === 0) return;
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await updateProjectAction(project.id, { extracted_data: { rooms } });
      } catch (e) {
        console.error('Auto-save error:', e);
      } finally {
        setIsSaving(false);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [rooms, project.id]);

  const handleUpdateCabinet = (roomIdx: number, sectionKey: string, cabIdx: number, updates: Partial<Cabinet>) => {
    const nr = JSON.parse(JSON.stringify(rooms));
    nr[roomIdx].sections[sectionKey][cabIdx] = { ...nr[roomIdx].sections[sectionKey][cabIdx], ...updates };
    setRooms(nr);
  };

  const handleAddRow = (roomIdx: number, sectionKey: string) => {
    const nr = JSON.parse(JSON.stringify(rooms));
    nr[roomIdx].sections[sectionKey].push({
      code: '',
      qty: 1,
      type: sectionKey
    });
    setRooms(nr);
  };

  const handleRemoveCabinet = (roomIdx: number, sectionKey: string, cabIdx: number) => {
    const nr = JSON.parse(JSON.stringify(rooms));
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

  const handleFinalize = async () => {
    if (!selectedManId || !selection.collection || !selection.doorStyle) return;
    setIsProcessing(true);
    try {
      const result = await generateBOMAction(project.id, selectedManId, selection.collection, selection.doorStyle);
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

  const totalSkus = rooms.reduce((acc, r) => {
    let count = 0;
    Object.values(r.sections).forEach((s: any) => {
      s.forEach((c: any) => {
        count += (Number(c.qty) || 1);
      });
    });
    return acc + count;
  }, 0);

  if (step === 'review') {
    return (
      <div className="max-w-7xl mx-auto space-y-8 pb-24 animate-in fade-in duration-500">
        {/* Project Header Summary - Top Positioned */}
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
              <div className="hidden lg:flex items-center gap-3 pl-10 border-l border-slate-100">
                <div className="flex items-center gap-2">
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-500" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    {isSaving ? 'Cloud Saving...' : 'Draft Secured'}
                  </span>
                </div>
              </div>
            </div>
            
            <Button 
              onClick={() => setStep('manufacturer')} 
              className="w-full md:w-auto h-14 px-8 gradient-button rounded-xl text-md group"
            >
              Select Manufacturer
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </Card>

        {/* Areas & Table Schedules */}
        <div className="space-y-12">
          {rooms.map((room, rIdx) => (
            <div key={rIdx} className="space-y-6">
               <div className="flex justify-between items-center px-2">
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
                  <div className="flex items-center gap-2">
                    <Button onClick={() => handleAddRoom()} variant="ghost" size="sm" className="text-sky-600 hover:bg-sky-50">
                      <Plus className="w-4 h-4 mr-2" /> Add Area
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleRemoveRoom(rIdx)} className="text-slate-300 hover:text-red-500 h-9 w-9">
                      <Trash2 className="w-4 h-4" />
                    </Button>
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
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={() => handleRemoveCabinet(rIdx, sectionKey, cIdx)}
                                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 h-8 w-8 transition-opacity"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
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

  // Manufacturer & Spec Steps (Keep streamlined)
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
               onClick={() => { setSelectedManId(m.id); setSelection({ collection: '', doorStyle: '' }); fetchManConfig(m.id); }}
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
           <Button variant="outline" className="flex-1 h-14 rounded-xl font-bold" onClick={() => setStep('review')}>Back</Button>
           <Button className="flex-1 h-14 gradient-button rounded-xl" disabled={!selectedManId} onClick={() => setStep('specifications')}>Continue</Button>
        </div>
      </div>
    );
  }

  if (step === 'specifications') {
    return (
      <div className="max-w-xl mx-auto space-y-12 py-12 animate-in slide-in-from-bottom-4">
        <div className="text-center space-y-3">
           <h2 className="text-3xl font-black text-slate-900">Finish Specification</h2>
           <p className="text-slate-500">Finalize collection details for BOM generation.</p>
        </div>
        <Card className="p-8 space-y-8 rounded-2xl border-slate-100 shadow-xl bg-white">
           <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Collection</label>
              <Select onValueChange={(v) => setSelection(prev => ({ ...prev, collection: v }))} value={selection.collection}>
                <SelectTrigger className="h-14 rounded-xl border-slate-100 bg-slate-50/50 font-bold">
                  <SelectValue placeholder={isLoadingConfig ? "Syncing..." : "Select Collection"} />
                </SelectTrigger>
                <SelectContent className="bg-white rounded-xl">
                   {manConfig.collections.map(c => <SelectItem key={c} value={c} className="font-bold py-3">{c}</SelectItem>)}
                </SelectContent>
              </Select>
           </div>
           <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Door Style</label>
              <Select onValueChange={(v) => setSelection(prev => ({ ...prev, doorStyle: v }))} value={selection.doorStyle} disabled={!selection.collection}>
                <SelectTrigger className="h-14 rounded-xl border-slate-100 bg-slate-50/50 font-bold">
                  <SelectValue placeholder="Select Style" />
                </SelectTrigger>
                <SelectContent className="bg-white rounded-xl">
                   {manConfig.styles.map(s => <SelectItem key={s} value={s} className="font-bold py-3">{s}</SelectItem>)}
                </SelectContent>
              </Select>
           </div>
        </Card>
        <div className="flex gap-4 pt-4">
           <Button variant="outline" className="flex-1 h-14 rounded-xl font-bold" onClick={() => setStep('manufacturer')}>Back</Button>
           <Button className="flex-1 h-14 gradient-button rounded-xl" disabled={!selection.doorStyle || isProcessing} onClick={handleFinalize}>
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DollarSign className="w-4 h-4 mr-2" />}
              Generate Quote
           </Button>
        </div>
      </div>
    );
  }

  return null;
}
