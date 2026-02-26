
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

  const totalSkus = rooms.reduce((acc, r) => {
    let count = 0;
    Object.values(r.sections).forEach((s: any) => {
      s.forEach((c: any) => count += (c.qty || 1));
    });
    return acc + count;
  }, 0);

  if (step === 'review') {
    return (
      <div className="max-w-7xl mx-auto space-y-8 pb-24 animate-in fade-in duration-500">
        {/* Top Horizontal Summary Dashboard */}
        <Card className="rounded-[2.5rem] border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.05)] bg-white overflow-hidden">
          <div className="p-8 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-12">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Rooms Detected</span>
                <span className="text-4xl font-black text-slate-900">{rooms.length}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Total Unit Count</span>
                <span className="text-4xl font-black text-sky-600">{totalSkus}</span>
              </div>
              <div className="hidden lg:flex flex-col border-l border-slate-100 pl-12 max-w-xs">
                <div className="flex items-center gap-2 text-slate-400 mb-1">
                  <Info className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-widest">System Status</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Analysis complete. Review counts before applying manufacturer pricing.
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="flex items-center gap-2 mr-4 text-slate-400">
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                )}
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  {isSaving ? 'Saving Changes...' : 'All Changes Saved'}
                </span>
              </div>
              <Button 
                onClick={() => setStep('manufacturer')} 
                className="w-full md:w-auto h-16 px-10 gradient-button rounded-2xl shadow-xl shadow-sky-500/20 text-lg group"
              >
                Select Manufacturer
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Section Header */}
        <div className="flex justify-between items-center px-4">
          <div className="flex items-center gap-3">
             <Layout className="w-6 h-6 text-sky-600" />
             <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Full Project Takeoff</h2>
                <p className="text-xs text-slate-500">Manage cabinet schedules and room details.</p>
             </div>
          </div>
          <Button onClick={handleAddRoom} variant="outline" className="rounded-xl border-sky-100 text-sky-600 hover:bg-sky-50 px-6">
             <Plus className="w-4 h-4 mr-2" />
             Add Room
          </Button>
        </div>

        {/* Room List */}
        <div className="space-y-10">
          {rooms.map((room, rIdx) => (
            <div key={rIdx} className="space-y-6 border border-slate-100 rounded-[2.5rem] p-8 bg-white shadow-sm hover:shadow-xl transition-shadow duration-300">
               <div className="flex justify-between items-center px-2 border-b border-slate-50 pb-4">
                  <div className="flex items-center gap-4">
                     <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center">
                        <Package className="w-6 h-6 text-sky-600" />
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
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveRoom(rIdx)} className="text-slate-300 hover:text-red-500 rounded-full h-10 w-10">
                    <Trash2 className="w-5 h-5" />
                  </Button>
               </div>

               <div className="grid grid-cols-1 gap-12">
                  {Object.keys(room.sections).map((sectionKey) => (
                    <div key={sectionKey} className="space-y-4">
                      <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-50 border border-slate-100 w-fit">
                         <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{sectionKey}</span>
                         <span className="text-[10px] font-bold text-slate-400 ml-2">{room.sections[sectionKey].length} items</span>
                      </div>
                      
                      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
                        <Table>
                          <TableHeader className="bg-slate-50/30">
                            <TableRow className="hover:bg-transparent border-slate-100">
                              <TableHead className="w-[180px] text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 pl-8">Quantity</TableHead>
                              <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Cabinet SKU / Code</TableHead>
                              <TableHead className="w-[80px] text-right pr-8"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {room.sections[sectionKey].map((cab: any, cIdx: number) => (
                              <TableRow key={cIdx} className="border-slate-50 hover:bg-slate-50/20 group">
                                <TableCell className="pl-8">
                                  <div className="flex items-center gap-2">
                                    <button 
                                      onClick={() => handleUpdateCabinet(rIdx, sectionKey, cIdx, { qty: Math.max(1, (cab.qty || 1) - 1) })}
                                      className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-sky-100 hover:text-sky-600 transition-colors"
                                    >
                                      <Minus className="w-4 h-4" />
                                    </button>
                                    <Input 
                                      type="number" 
                                      value={cab.qty} 
                                      onChange={(e) => handleUpdateCabinet(rIdx, sectionKey, cIdx, { qty: parseInt(e.target.value) || 1 })}
                                      className="w-16 h-10 text-center bg-white border border-slate-200 rounded-xl font-black text-slate-900 text-lg"
                                    />
                                    <button 
                                      onClick={() => handleUpdateCabinet(rIdx, sectionKey, cIdx, { qty: (cab.qty || 1) + 1 })}
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
                                    className="h-12 font-black text-xl text-sky-600 bg-transparent border-none focus-visible:ring-2 focus-visible:ring-sky-100 rounded-xl"
                                    placeholder="Enter Architectural SKU..."
                                  />
                                </TableCell>
                                <TableCell className="text-right pr-8">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleRemoveCabinet(rIdx, sectionKey, cIdx)}
                                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 h-10 w-10 transition-all rounded-full"
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="hover:bg-transparent border-none">
                              <TableCell colSpan={3} className="p-6 pl-8">
                                <button 
                                  onClick={() => handleAddRow(rIdx, sectionKey)}
                                  className="text-xs font-black text-sky-500 uppercase tracking-[0.15em] flex items-center gap-2 hover:text-sky-600 transition-colors group"
                                >
                                  <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center group-hover:bg-sky-100 transition-colors">
                                    <Plus className="w-4 h-4" />
                                  </div>
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
      </div>
    );
  }

  if (step === 'manufacturer') {
    return (
      <div className="max-w-xl mx-auto space-y-12 py-12 animate-in slide-in-from-bottom-4 duration-500">
        <div className="text-center space-y-4">
           <h2 className="text-4xl font-black tracking-tight text-slate-900">Select Brand</h2>
           <p className="text-slate-500 text-lg">Choose the manufacturer catalog for pricing extraction.</p>
        </div>
        <div className="grid grid-cols-1 gap-4">
           {manufacturers.map(m => (
             <button 
               key={m.id}
               onClick={() => { setSelectedManId(m.id); setSelection({ collection: '', doorStyle: '' }); fetchManConfig(m.id); }}
               className={cn(
                 "p-8 rounded-[2rem] border-2 text-left flex items-center justify-between transition-all duration-300 group",
                 selectedManId === m.id 
                  ? "border-sky-500 bg-sky-50 shadow-xl shadow-sky-500/10 scale-[1.02]" 
                  : "border-slate-100 hover:border-sky-200 hover:bg-slate-50/50"
               )}
             >
                <div className="flex items-center gap-6">
                   <div className={cn(
                     "w-16 h-16 rounded-2xl flex items-center justify-center transition-colors shadow-sm",
                     selectedManId === m.id ? "bg-sky-600 text-white" : "bg-white text-slate-400 group-hover:bg-sky-50"
                   )}>
                      <Factory className="w-8 h-8" />
                   </div>
                   <div>
                      <span className="font-black text-2xl text-slate-900 block">{m.name}</span>
                      <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Pricing Matrix v1.0</span>
                   </div>
                </div>
                {selectedManId === m.id && <CheckCircle2 className="w-8 h-8 text-sky-600" />}
             </button>
           ))}
        </div>
        <div className="flex gap-4 pt-4">
           <Button variant="outline" className="flex-1 h-16 rounded-2xl text-slate-500 font-bold border-slate-200" onClick={() => setStep('review')}>Back</Button>
           <Button className="flex-1 h-16 gradient-button rounded-2xl text-lg" disabled={!selectedManId} onClick={() => setStep('specifications')}>Continue</Button>
        </div>
      </div>
    );
  }

  if (step === 'specifications') {
    return (
      <div className="max-w-xl mx-auto space-y-12 py-12 animate-in slide-in-from-bottom-4 duration-500">
        <div className="text-center space-y-4">
           <h2 className="text-4xl font-black tracking-tight text-slate-900">Configure Specs</h2>
           <p className="text-slate-500 text-lg">Define collection and style for accurate BOM calculation.</p>
        </div>

        <Card className="p-10 space-y-10 rounded-[3rem] border-slate-100 shadow-2xl shadow-slate-200/50 bg-white">
           <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Manufacturer Collection</label>
              <Select onValueChange={(v) => setSelection(prev => ({ ...prev, collection: v }))} value={selection.collection}>
                <SelectTrigger className="h-20 rounded-2xl border-slate-100 bg-slate-50/50 text-xl font-black px-6">
                  <SelectValue placeholder={isLoadingConfig ? "Syncing..." : "Select Collection"} />
                </SelectTrigger>
                <SelectContent className="bg-white rounded-2xl border-slate-200 p-2">
                   {manConfig.collections.map(c => <SelectItem key={c} value={c} className="font-bold py-4 text-lg rounded-xl">{c}</SelectItem>)}
                </SelectContent>
              </Select>
           </div>

           <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Cabinet Door Style</label>
              <Select onValueChange={(v) => setSelection(prev => ({ ...prev, doorStyle: v }))} value={selection.doorStyle} disabled={!selection.collection}>
                <SelectTrigger className="h-20 rounded-2xl border-slate-100 bg-slate-50/50 text-xl font-black px-6">
                  <SelectValue placeholder="Select Style" />
                </SelectTrigger>
                <SelectContent className="bg-white rounded-2xl border-slate-200 p-2">
                   {manConfig.styles.map(s => <SelectItem key={s} value={s} className="font-bold py-4 text-lg rounded-xl">{s}</SelectItem>)}
                </SelectContent>
              </Select>
           </div>
        </Card>

        <div className="flex gap-4 pt-4">
           <Button variant="outline" className="flex-1 h-16 rounded-2xl text-slate-500 font-bold border-slate-200" onClick={() => setStep('manufacturer')}>Back</Button>
           <Button className="flex-1 h-16 gradient-button rounded-2xl text-lg shadow-xl shadow-sky-500/20" disabled={!selection.doorStyle || isProcessing} onClick={handleFinalize}>
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <DollarSign className="w-5 h-5 mr-2" />}
              Generate Final Quote
           </Button>
        </div>
      </div>
    );
  }

  return null;
}
