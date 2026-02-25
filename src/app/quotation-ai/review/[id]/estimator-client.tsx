
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
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
  ChevronRight,
  Layout,
  Minus,
  CheckCircle2,
  Factory,
  Loader2,
  Package,
  ArrowRight,
  DollarSign
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
  
  // Workflow State
  const [step, setStep] = useState<'review' | 'manufacturer' | 'specifications'>('review');
  
  // Data State
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

  // Initial Data Load
  useEffect(() => {
    if (initialSyncRef.current) return;
    
    if (project.extracted_data?.rooms && project.extracted_data.rooms.length > 0) {
      setRooms(project.extracted_data.rooms);
    } else {
      setRooms([{
        room_name: 'Main Kitchen',
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

  // Auto-Save
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
      room_name: `New Room ${rooms.length + 1}`,
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
    if (!confirm('Delete this entire room and all its cabinets?')) return;
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

  if (step === 'review') {
    return (
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8 pb-24">
        <div className="lg:col-span-3 space-y-10">
          <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
             <div className="flex items-center gap-3">
                <Layout className="w-6 h-6 text-sky-600" />
                <div>
                   <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Full Project Takeoff</h2>
                   <p className="text-xs text-slate-500">Vision analysis complete. Review rooms and quantities across all pages.</p>
                </div>
             </div>
             <Button onClick={handleAddRoom} variant="outline" className="rounded-xl border-sky-100 text-sky-600 hover:bg-sky-50">
                <Plus className="w-4 h-4 mr-2" />
                Add Room
             </Button>
          </div>

          {rooms.map((room, rIdx) => (
            <div key={rIdx} className="space-y-6 border border-slate-100 rounded-[2.5rem] p-8 bg-white shadow-xl shadow-slate-200/50">
               <div className="flex justify-between items-center px-2 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
                        <Package className="w-5 h-5 text-sky-600" />
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
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveRoom(rIdx)} className="text-slate-300 hover:text-red-500 rounded-full">
                    <Trash2 className="w-5 h-5" />
                  </Button>
               </div>

               <div className="grid grid-cols-1 gap-12">
                  {Object.keys(room.sections).map((sectionKey) => (
                    <div key={sectionKey} className="space-y-4">
                      <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-50 border border-slate-100 w-fit">
                         <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{sectionKey}</span>
                      </div>
                      
                      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
                        <Table>
                          <TableHeader className="bg-slate-50/30">
                            <TableRow className="hover:bg-transparent border-slate-100">
                              <TableHead className="w-[160px] text-[10px] font-bold uppercase tracking-widest text-slate-400 pl-6">Qty</TableHead>
                              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cabinet SKU</TableHead>
                              <TableHead className="w-[60px] text-right pr-6"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {room.sections[sectionKey].map((cab: any, cIdx: number) => (
                              <TableRow key={cIdx} className="border-slate-50 hover:bg-slate-50/30 group">
                                <TableCell className="pl-6">
                                  <div className="flex items-center gap-1.5">
                                    <button 
                                      onClick={() => handleUpdateCabinet(rIdx, sectionKey, cIdx, { qty: Math.max(1, (cab.qty || 1) - 1) })}
                                      className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
                                    >
                                      <Minus className="w-3.5 h-3.5" />
                                    </button>
                                    <Input 
                                      type="number" 
                                      value={cab.qty} 
                                      onChange={(e) => handleUpdateCabinet(rIdx, sectionKey, cIdx, { qty: parseInt(e.target.value) || 1 })}
                                      className="w-12 h-8 text-center bg-white border border-slate-200 rounded-md font-bold text-slate-900"
                                    />
                                    <button 
                                      onClick={() => handleUpdateCabinet(rIdx, sectionKey, cIdx, { qty: (cab.qty || 1) + 1 })}
                                      className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Input 
                                    value={cab.code} 
                                    onChange={(e) => handleUpdateCabinet(rIdx, sectionKey, cIdx, { code: e.target.value.toUpperCase() })}
                                    className="h-9 font-bold text-sky-600 bg-transparent border-none focus-visible:ring-1 focus-visible:ring-sky-100 rounded-lg"
                                    placeholder="Enter SKU..."
                                  />
                                </TableCell>
                                <TableCell className="text-right pr-6">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleRemoveCabinet(rIdx, sectionKey, cIdx)}
                                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 h-8 w-8 transition-all"
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
                                  className="text-[10px] font-black text-sky-500 uppercase tracking-widest flex items-center gap-2 hover:text-sky-600 transition-colors"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Add Line Item
                                </button>
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}
               </div>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <Card className="sticky top-28 border-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-[2rem] overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-6">
               <CardTitle className="text-lg font-bold flex items-center justify-between">
                  Project Summary
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-sky-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
               </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="grid grid-cols-2 gap-4">
                 <div className="p-4 rounded-2xl bg-sky-50/50 border border-sky-100/50">
                    <p className="text-[10px] font-black text-sky-600 uppercase tracking-widest mb-1">Rooms</p>
                    <p className="text-2xl font-black text-slate-900">{rooms.length}</p>
                 </div>
                 <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100/50">
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Total SKUs</p>
                    <p className="text-2xl font-black text-slate-900">{rooms.reduce((acc, r) => {
                      let count = 0;
                      Object.values(r.sections).forEach((s: any) => count += s.length);
                      return acc + count;
                    }, 0)}</p>
                 </div>
              </div>

              <div className="space-y-3">
                 <p className="text-xs text-slate-500 leading-relaxed font-medium">Data extracted from full architectural set including elevations and details. Adjust as needed before pricing.</p>
              </div>

              <Button onClick={() => setStep('manufacturer')} className="w-full h-16 gradient-button rounded-2xl shadow-xl shadow-sky-500/20 text-lg group">
                Select Manufacturer
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (step === 'manufacturer') {
    return (
      <div className="max-w-xl mx-auto space-y-12 py-12">
        <div className="text-center space-y-4">
           <h2 className="text-4xl font-black tracking-tight text-slate-900">Choose Brand</h2>
           <p className="text-slate-500 text-lg">Select the manufacturer matrix to apply to the BOM.</p>
        </div>
        <div className="grid grid-cols-1 gap-4">
           {manufacturers.map(m => (
             <button 
               key={m.id}
               onClick={() => { setSelectedManId(m.id); setSelection({ collection: '', doorStyle: '' }); fetchManConfig(m.id); }}
               className={cn(
                 "p-8 rounded-3xl border-2 text-left flex items-center justify-between transition-all duration-300",
                 selectedManId === m.id 
                  ? "border-sky-500 bg-sky-50 shadow-xl shadow-sky-500/10 scale-[1.02]" 
                  : "border-slate-100 hover:border-sky-200 hover:bg-slate-50/50"
               )}
             >
                <div className="flex items-center gap-5">
                   <div className={cn(
                     "w-14 h-14 rounded-2xl flex items-center justify-center transition-colors",
                     selectedManId === m.id ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-400"
                   )}>
                      <Factory className="w-7 h-7" />
                   </div>
                   <div>
                      <span className="font-black text-xl text-slate-900 block">{m.name}</span>
                      <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Active Database</span>
                   </div>
                </div>
                {selectedManId === m.id && <CheckCircle2 className="w-6 h-6 text-sky-600" />}
             </button>
           ))}
        </div>
        <div className="flex gap-4 pt-4">
           <Button variant="outline" className="flex-1 h-14 rounded-2xl text-slate-500 font-bold" onClick={() => setStep('review')}>Back to Review</Button>
           <Button className="flex-1 h-14 gradient-button rounded-2xl text-lg" disabled={!selectedManId} onClick={() => setStep('specifications')}>Next Step</Button>
        </div>
      </div>
    );
  }

  if (step === 'specifications') {
    return (
      <div className="max-w-xl mx-auto space-y-12 py-12">
        <div className="text-center space-y-4">
           <h2 className="text-4xl font-black tracking-tight text-slate-900">Define Specs</h2>
           <p className="text-slate-500 text-lg">Apply collection and style filters to normalize pricing.</p>
        </div>

        <Card className="p-10 space-y-10 rounded-[3rem] border-slate-200 shadow-2xl shadow-slate-200/50 bg-white">
           <div className="space-y-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Collection</label>
              <Select onValueChange={(v) => setSelection(prev => ({ ...prev, collection: v }))} value={selection.collection}>
                <SelectTrigger className="h-16 rounded-2xl border-slate-100 bg-slate-50/50 text-lg font-bold">
                  <SelectValue placeholder={isLoadingConfig ? "Loading..." : "Select Collection"} />
                </SelectTrigger>
                <SelectContent className="bg-white rounded-2xl border-slate-200">
                   {manConfig.collections.map(c => <SelectItem key={c} value={c} className="font-bold py-3">{c}</SelectItem>)}
                </SelectContent>
              </Select>
           </div>

           <div className="space-y-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Door Style</label>
              <Select onValueChange={(v) => setSelection(prev => ({ ...prev, doorStyle: v }))} value={selection.doorStyle} disabled={!selection.collection}>
                <SelectTrigger className="h-16 rounded-2xl border-slate-100 bg-slate-50/50 text-lg font-bold">
                  <SelectValue placeholder="Select Style" />
                </SelectTrigger>
                <SelectContent className="bg-white rounded-2xl border-slate-200">
                   {manConfig.styles.map(s => <SelectItem key={s} value={s} className="font-bold py-3">{s}</SelectItem>)}
                </SelectContent>
              </Select>
           </div>
        </Card>

        <div className="flex gap-4 pt-4">
           <Button variant="outline" className="flex-1 h-14 rounded-2xl text-slate-500 font-bold" onClick={() => setStep('manufacturer')}>Back</Button>
           <Button className="flex-1 h-14 gradient-button rounded-2xl text-lg" disabled={!selection.doorStyle || isProcessing} onClick={handleFinalize}>
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <DollarSign className="w-5 h-5 mr-2" />}
              Finalize Quote
           </Button>
        </div>
      </div>
    );
  }

  return null;
}
