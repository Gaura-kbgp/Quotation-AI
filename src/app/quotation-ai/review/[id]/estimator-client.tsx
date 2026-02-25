
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  ArrowRight
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateProjectAction, generateBOMAction } from '../../actions';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface Cabinet {
  code: string;
  qty: number;
  description: string;
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

  function classifyCabinet(code: string): string {
    const c = String(code || '').toUpperCase().trim();
    if (c.startsWith('W')) return 'Wall Cabinets';
    if (c.startsWith('B') || c.startsWith('SB')) return 'Base Cabinets';
    if (c.startsWith('UF') || c.includes('FILLER')) return 'Tall Cabinets';
    if (c.startsWith('VSB')) return 'Vanity Cabinets';
    return 'Hardware';
  }

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
      toast({ variant: 'destructive', title: 'Data Error', description: 'Failed to load brand configuration.' });
    } finally {
      setIsLoadingConfig(false);
    }
  }, [toast]);

  // Initial Data Load
  useEffect(() => {
    if (initialSyncRef.current) return;
    
    if (project.extracted_data?.rooms) {
      setRooms(project.extracted_data.rooms);
    } else {
      setRooms([{
        room_name: 'Main Room',
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

  // Debounced Auto-Save
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
    const nr = [...rooms];
    const cab = nr[roomIdx].sections[sectionKey][cabIdx];
    if (updates.code) {
      updates.code = updates.code.toUpperCase().replace(/\s/g, '');
      const newType = classifyCabinet(updates.code);
      if (newType !== sectionKey) {
        // Move item to new section
        nr[roomIdx].sections[sectionKey].splice(cabIdx, 1);
        nr[roomIdx].sections[newType].push({ ...cab, ...updates, type: newType });
        setRooms(nr);
        return;
      }
    }
    nr[roomIdx].sections[sectionKey][cabIdx] = { ...cab, ...updates };
    setRooms(nr);
  };

  const handleAddRow = (roomIdx: number, sectionKey: string) => {
    const nr = [...rooms];
    nr[roomIdx].sections[sectionKey].push({
      code: '',
      qty: 1,
      description: 'New Item',
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

  const handleSelectManufacturer = (id: string) => {
    setSelectedManId(id);
    setSelection({ collection: '', doorStyle: '' });
    fetchManConfig(id);
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
                   <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Review Extraction</h2>
                   <p className="text-xs text-slate-500">Multi-page analysis complete. Validate quantities below.</p>
                </div>
             </div>
             <Button onClick={handleAddRoom} variant="outline" className="rounded-xl border-sky-100 text-sky-600 hover:bg-sky-50">
                <Plus className="w-4 h-4 mr-2" />
                Add Room
             </Button>
          </div>

          {rooms.map((room, rIdx) => (
            <div key={rIdx} className="space-y-6 border border-slate-100 rounded-[2.5rem] p-8 bg-white shadow-xl shadow-slate-200/50">
               <div className="flex justify-between items-center px-2">
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
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => {
                      if(confirm('Delete room?')) {
                        const nr = [...rooms];
                        nr.splice(rIdx, 1);
                        setRooms(nr);
                      }
                    }}
                    className="text-slate-300 hover:text-red-500 rounded-full"
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
               </div>

               <div className="grid grid-cols-1 gap-12">
                  {Object.keys(room.sections).map((sectionKey) => {
                    const cabs = room.sections[sectionKey] || [];
                    return (
                      <div key={sectionKey} className="space-y-4">
                        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-50 border border-slate-100 w-fit">
                           <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{sectionKey}</span>
                        </div>
                        
                        <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
                          <Table>
                            <TableHeader className="bg-slate-50/30">
                              <TableRow className="hover:bg-transparent border-slate-100">
                                <TableHead className="w-[140px] text-[10px] font-bold uppercase tracking-widest text-slate-400 pl-6">Qty</TableHead>
                                <TableHead className="w-[250px] text-[10px] font-bold uppercase tracking-widest text-slate-400">Cabinet SKU</TableHead>
                                <TableHead className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Label / Note</TableHead>
                                <TableHead className="w-[60px] text-right pr-6"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {cabs.map((cab: any, cIdx: number) => (
                                <TableRow key={cIdx} className="border-slate-50 hover:bg-slate-50/30 group">
                                  <TableCell className="pl-6">
                                    <div className="flex items-center gap-1.5">
                                      <button 
                                        onClick={() => handleUpdateCabinet(rIdx, sectionKey, cIdx, { qty: Math.max(1, (cab.qty || 1) - 1) })}
                                        className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
                                      >
                                        <Minus className="w-3 h-3" />
                                      </button>
                                      <Input 
                                        type="number" 
                                        value={cab.qty} 
                                        onChange={(e) => handleUpdateCabinet(rIdx, sectionKey, cIdx, { qty: parseInt(e.target.value) || 1 })}
                                        className="w-10 h-8 text-center bg-transparent border-none font-bold text-slate-900"
                                      />
                                      <button 
                                        onClick={() => handleUpdateCabinet(rIdx, sectionKey, cIdx, { qty: (cab.qty || 1) + 1 })}
                                        className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Input 
                                      value={cab.code} 
                                      onChange={(e) => handleUpdateCabinet(rIdx, sectionKey, cIdx, { code: e.target.value })}
                                      className="h-9 font-bold text-sky-600 bg-transparent border-none focus-visible:ring-1 focus-visible:ring-sky-100 rounded-lg"
                                      placeholder="e.g. W3042"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input 
                                      value={cab.description} 
                                      onChange={(e) => handleUpdateCabinet(rIdx, sectionKey, cIdx, { description: e.target.value })}
                                      className="h-9 text-slate-500 bg-transparent border-none focus-visible:ring-1 focus-visible:ring-slate-100 rounded-lg"
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
                                <TableCell colSpan={4} className="p-4 pl-6">
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
                    );
                  })}
               </div>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <Card className="sticky top-28 border-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-[2rem] overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-6">
               <CardTitle className="text-lg font-bold flex items-center justify-between">
                  Project Stats
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
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">SKUs</p>
                    <p className="text-2xl font-black text-slate-900">{rooms.reduce((acc, r) => acc + Object.values(r.sections).flat().length, 0)}</p>
                 </div>
              </div>

              <div className="space-y-3">
                 <p className="text-xs text-slate-500 leading-relaxed font-medium">Verify all extracted cabinet codes match the architectural set before proceeding to manufacturer selection.</p>
              </div>

              <Button onClick={() => setStep('manufacturer')} className="w-full h-16 gradient-button rounded-2xl shadow-xl shadow-sky-500/20 text-lg group">
                Select Brand
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
           <h2 className="text-4xl font-black tracking-tight text-slate-900">Select Manufacturer</h2>
           <p className="text-slate-500 text-lg">Choose a brand to match SKUs against their specific pricing matrix.</p>
        </div>
        <div className="grid grid-cols-1 gap-4">
           {manufacturers.map(m => (
             <button 
               key={m.id}
               onClick={() => handleSelectManufacturer(m.id)}
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
                      <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Active Partner</span>
                   </div>
                </div>
                {selectedManId === m.id && <CheckCircle2 className="w-6 h-6 text-sky-600 animate-in zoom-in" />}
             </button>
           ))}
        </div>
        <div className="flex gap-4 pt-4">
           <Button variant="outline" className="flex-1 h-14 rounded-2xl text-slate-500 font-bold" onClick={() => setStep('review')}>Back to Review</Button>
           <Button className="flex-1 h-14 gradient-button rounded-2xl text-lg" disabled={!selectedManId} onClick={() => setStep('specifications')}>Continue</Button>
        </div>
      </div>
    );
  }

  if (step === 'specifications') {
    return (
      <div className="max-w-xl mx-auto space-y-12 py-12">
        <div className="text-center space-y-4">
           <h2 className="text-4xl font-black tracking-tight text-slate-900">Configure Options</h2>
           <p className="text-slate-500 text-lg">Select collection and style for precision pricing.</p>
        </div>

        <Card className="p-10 space-y-10 rounded-[3rem] border-slate-200 shadow-2xl shadow-slate-200/50 bg-white">
           <div className="space-y-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Collection</label>
              <Select 
                onValueChange={(v) => setSelection(prev => ({ ...prev, collection: v }))} 
                defaultValue={selection.collection}
              >
                <SelectTrigger className="h-16 rounded-2xl border-slate-100 bg-slate-50/50 text-lg font-bold">
                  <SelectValue placeholder={isLoadingConfig ? "Fetching data..." : "Choose Collection"} />
                </SelectTrigger>
                <SelectContent className="bg-white rounded-2xl border-slate-200">
                   {manConfig.collections.length === 0 ? (
                     <p className="p-6 text-sm text-slate-400 text-center font-medium">No collections found.</p>
                   ) : (
                     manConfig.collections.map(c => <SelectItem key={c} value={c} className="font-bold py-3">{c}</SelectItem>)
                   )}
                </SelectContent>
              </Select>
           </div>

           <div className="space-y-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Door Style</label>
              <Select 
                onValueChange={(v) => setSelection(prev => ({ ...prev, doorStyle: v }))} 
                defaultValue={selection.doorStyle}
                disabled={!selection.collection}
              >
                <SelectTrigger className="h-16 rounded-2xl border-slate-100 bg-slate-50/50 text-lg font-bold">
                  <SelectValue placeholder="Choose Style" />
                </SelectTrigger>
                <SelectContent className="bg-white rounded-2xl border-slate-200">
                   {manConfig.styles.length === 0 ? (
                     <p className="p-6 text-sm text-slate-400 text-center font-medium">Select a collection first.</p>
                   ) : (
                     manConfig.styles.map(s => <SelectItem key={s} value={s} className="font-bold py-3">{s}</SelectItem>)
                   )}
                </SelectContent>
              </Select>
           </div>
        </Card>

        <div className="flex gap-4 pt-4">
           <Button variant="outline" className="flex-1 h-14 rounded-2xl text-slate-500 font-bold" onClick={() => setStep('manufacturer')}>Change Brand</Button>
           <Button 
             className="flex-1 h-14 gradient-button rounded-2xl text-lg" 
             disabled={!selection.doorStyle || isProcessing} 
             onClick={handleFinalize}
           >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
              Generate Quotation
           </Button>
        </div>
      </div>
    );
  }

  return null;
}
