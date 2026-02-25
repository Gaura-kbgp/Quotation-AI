
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
  ChevronDown,
  Box,
  Layout,
  Calculator,
  Minus,
  AlertCircle,
  CheckCircle2,
  Factory,
  Loader2,
  X
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
    const c = String(code || '').toUpperCase();
    if (c.startsWith('W')) return 'Wall Cabinets';
    if (c.startsWith('B')) return 'Base Cabinets';
    if (c.startsWith('T') || c.includes('FILLER')) return 'Tall Cabinets';
    if (c.startsWith('V')) return 'Vanity Cabinets';
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
      console.error(`[Config Fetch Error]:`, err);
      toast({ 
        variant: 'destructive', 
        title: 'Data Error', 
        description: 'Failed to load brand data. Ensure pricing is uploaded in Admin.' 
      });
    } finally {
      setIsLoadingConfig(false);
    }
  }, [toast]);

  // Initial Data Restructuring
  useEffect(() => {
    if (initialSyncRef.current) return;

    if (project.extracted_data?.rooms) {
      const structured = project.extracted_data.rooms.map((r: any) => {
        if (r.sections) return r;
        
        const sections: any = {
          'Base Cabinets': [],
          'Wall Cabinets': [],
          'Tall Cabinets': [],
          'Vanity Cabinets': [],
          'Hardware': []
        };

        (r.cabinets || []).forEach((c: any) => {
          const type = classifyCabinet(c.code);
          sections[type].push({ 
            code: c.code, 
            qty: c.qty || 1, 
            type, 
            description: c.description || 'Extracted Item' 
          });
        });

        return { ...r, sections };
      });
      setRooms(structured);
    } else {
      setRooms([{
        room_name: 'Main Room',
        room_type: 'Kitchen',
        sections: {
          'Base Cabinets': [],
          'Wall Cabinets': [],
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

  // Auto-Save Logic
  useEffect(() => {
    if (!initialSyncRef.current || rooms.length === 0) return;

    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await updateProjectAction(project.id, {
          extracted_data: { rooms }
        });
      } catch (e) {
        console.error('Auto-save error:', e);
      } finally {
        setIsSaving(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [rooms, project.id]);

  const handleUpdateCabinet = (roomIdx: number, sectionKey: string, cabIdx: number, updates: Partial<Cabinet>) => {
    const newRooms = [...rooms];
    const cab = newRooms[roomIdx].sections[sectionKey][cabIdx];
    
    if (updates.code) {
      updates.code = updates.code.toUpperCase().replace(/\s/g, '');
      updates.type = classifyCabinet(updates.code);
    }
    
    newRooms[roomIdx].sections[sectionKey][cabIdx] = { ...cab, ...updates };
    setRooms(newRooms);
  };

  const handleRemoveCabinet = (roomIdx: number, sectionKey: string, cabIdx: number) => {
    const newRooms = [...rooms];
    newRooms[roomIdx].sections[sectionKey].splice(cabIdx, 1);
    setRooms(newRooms);
  };

  const handleAddRow = (roomIdx: number, sectionKey: string) => {
    const newRooms = [...rooms];
    newRooms[roomIdx].sections[sectionKey].push({
      code: '',
      qty: 1,
      description: 'New Item',
      type: sectionKey
    });
    setRooms(newRooms);
  };

  const handleAddRoom = () => {
    setRooms([...rooms, {
      room_name: `New Room ${rooms.length + 1}`,
      room_type: 'Other',
      sections: {
        'Base Cabinets': [],
        'Wall Cabinets': [],
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
      const result = await generateBOMAction(
        project.id, 
        selectedManId, 
        selection.collection, 
        selection.doorStyle
      );
      
      if (result.success) {
        router.push(`/quotation-ai/bom/${project.id}`);
      } else {
        throw new Error(result.error);
      }
    } catch (err: any) {
      toast({ 
        variant: 'destructive', 
        title: 'Error', 
        description: err.message || 'Failed to generate quotation' 
      });
      setIsProcessing(false);
    }
  };

  if (step === 'review') {
    return (
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-10 pb-20">
          <div className="flex justify-between items-center">
             <div className="flex items-center gap-3">
                <Layout className="w-5 h-5 text-sky-600" />
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Review Extraction</h2>
             </div>
             <Button onClick={handleAddRoom} variant="outline" className="rounded-xl border-sky-100 text-sky-600 hover:bg-sky-50">
                <Plus className="w-4 h-4 mr-2" />
                Add Room
             </Button>
          </div>

          {rooms.map((room, rIdx) => (
            <div key={rIdx} className="space-y-6 border border-slate-100 rounded-3xl p-8 bg-slate-50/30 shadow-sm">
               <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                     <Input 
                        value={room.room_name} 
                        onChange={(e) => {
                          const nr = [...rooms];
                          nr[rIdx].room_name = e.target.value;
                          setRooms(nr);
                        }}
                        className="text-xl font-bold bg-transparent border-none focus-visible:ring-0 p-0 w-64 text-slate-900"
                     />
                     <Badge variant="outline" className="bg-white border-slate-200 text-slate-400 font-bold uppercase tracking-widest text-[9px] px-2">
                        {room.room_type}
                     </Badge>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => {
                      const nr = [...rooms];
                      nr.splice(rIdx, 1);
                      setRooms(nr);
                    }}
                    className="text-slate-300 hover:text-red-500"
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
               </div>

               <div className="space-y-8">
                  {Object.keys(room.sections).map((sectionKey) => {
                    const cabs = room.sections[sectionKey] || [];
                    return (
                      <div key={sectionKey} className="space-y-4">
                        <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-white border border-slate-100 w-fit">
                           <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{sectionKey}</span>
                        </div>
                        
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                          <Table>
                            <TableHeader className="bg-slate-50/50">
                              <TableRow className="hover:bg-transparent border-slate-100">
                                <TableHead className="w-[120px] text-[10px] font-bold uppercase tracking-widest">Qty</TableHead>
                                <TableHead className="w-[200px] text-[10px] font-bold uppercase tracking-widest">Code</TableHead>
                                <TableHead className="text-[10px] font-bold uppercase tracking-widest">Description</TableHead>
                                <TableHead className="w-[80px] text-right"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {cabs.map((cab: any, cIdx: number) => (
                                <TableRow key={cIdx} className="border-slate-50 hover:bg-slate-50/30 group">
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <button 
                                        onClick={() => handleUpdateCabinet(rIdx, sectionKey, cIdx, { qty: Math.max(1, (cab.qty || 1) - 1) })}
                                        className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-500"
                                      >
                                        <Minus className="w-3 h-3" />
                                      </button>
                                      <Input 
                                        type="number" 
                                        value={cab.qty} 
                                        onChange={(e) => handleUpdateCabinet(rIdx, sectionKey, cIdx, { qty: parseInt(e.target.value) || 1 })}
                                        className="w-12 h-8 text-center bg-transparent border-none font-bold"
                                      />
                                      <button 
                                        onClick={() => handleUpdateCabinet(rIdx, sectionKey, cIdx, { qty: (cab.qty || 1) + 1 })}
                                        className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-500"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Input 
                                      value={cab.code} 
                                      onChange={(e) => handleUpdateCabinet(rIdx, sectionKey, cIdx, { code: e.target.value })}
                                      className="h-8 font-bold text-sky-600 bg-transparent border-none focus-visible:ring-1 focus-visible:ring-sky-100 p-0"
                                      placeholder="SKU"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input 
                                      value={cab.description} 
                                      onChange={(e) => handleUpdateCabinet(rIdx, sectionKey, cIdx, { description: e.target.value })}
                                      className="h-8 text-slate-500 bg-transparent border-none focus-visible:ring-1 focus-visible:ring-slate-100 p-0"
                                    />
                                  </TableCell>
                                  <TableCell className="text-right">
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
                                <TableCell colSpan={4}>
                                  <button 
                                    onClick={() => handleAddRow(rIdx, sectionKey)}
                                    className="text-[10px] font-bold text-sky-500 uppercase tracking-widest flex items-center gap-1.5"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Add Item
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
          <Card className="sticky top-28 border-slate-100 shadow-xl rounded-3xl overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100">
               <CardTitle className="text-lg flex items-center justify-between">
                  Summary
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-sky-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
               </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                 <p className="text-xs text-slate-500">Rooms: <strong>{rooms.length}</strong></p>
                 <p className="text-xs text-slate-500">Items: <strong>{rooms.reduce((acc, r) => acc + Object.values(r.sections).flat().length, 0)}</strong></p>
              </div>
              <Button onClick={() => setStep('manufacturer')} className="w-full h-14 gradient-button rounded-2xl">
                Select Manufacturer
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (step === 'manufacturer') {
    return (
      <div className="max-w-xl mx-auto space-y-8 py-20 text-center">
        <h2 className="text-3xl font-bold">Select Manufacturer</h2>
        <div className="grid grid-cols-1 gap-4">
           {manufacturers.map(m => (
             <button 
               key={m.id}
               onClick={() => handleSelectManufacturer(m.id)}
               className={cn(
                 "p-6 rounded-2xl border text-left flex items-center justify-between transition-all",
                 selectedManId === m.id ? "border-sky-500 bg-sky-50 shadow-md" : "border-slate-100 hover:border-sky-200"
               )}
             >
                <div className="flex items-center gap-4">
                   <Factory className={cn("w-6 h-6", selectedManId === m.id ? "text-sky-600" : "text-slate-300")} />
                   <span className="font-bold text-lg">{m.name}</span>
                </div>
                {selectedManId === m.id && <CheckCircle2 className="w-5 h-5 text-sky-600" />}
             </button>
           ))}
        </div>
        <div className="flex gap-4">
           <Button variant="outline" className="flex-1 h-12" onClick={() => setStep('review')}>Back</Button>
           <Button className="flex-1 h-12 gradient-button" disabled={!selectedManId} onClick={() => setStep('specifications')}>Continue</Button>
        </div>
      </div>
    );
  }

  if (step === 'specifications') {
    return (
      <div className="max-w-xl mx-auto space-y-8 py-20">
        <div className="text-center space-y-2">
           <h2 className="text-3xl font-bold">Configure Collection</h2>
           <p className="text-slate-500">Select the door style and collection for accurate pricing.</p>
        </div>

        <Card className="p-8 space-y-6 rounded-3xl border-slate-100 shadow-xl">
           <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Collection</label>
              <Select 
                onValueChange={(v) => setSelection(prev => ({ ...prev, collection: v }))} 
                defaultValue={selection.collection}
              >
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue placeholder={isLoadingConfig ? "Fetching collections..." : "Choose Collection"} />
                </SelectTrigger>
                <SelectContent className="bg-white">
                   {manConfig.collections.length === 0 ? (
                     <p className="p-4 text-xs text-slate-400 text-center">No collections found for this brand.</p>
                   ) : (
                     manConfig.collections.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)
                   )}
                </SelectContent>
              </Select>
           </div>

           <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Door Style</label>
              <Select 
                onValueChange={(v) => setSelection(prev => ({ ...prev, doorStyle: v }))} 
                defaultValue={selection.doorStyle}
                disabled={!selection.collection}
              >
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue placeholder="Choose Style" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                   {manConfig.styles.length === 0 ? (
                     <p className="p-4 text-xs text-slate-400 text-center">No styles found.</p>
                   ) : (
                     manConfig.styles.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)
                   )}
                </SelectContent>
              </Select>
           </div>
        </Card>

        <div className="flex gap-4">
           <Button variant="outline" className="flex-1 h-12" onClick={() => setStep('manufacturer')}>Back</Button>
           <Button 
             className="flex-1 h-12 gradient-button" 
             disabled={!selection.doorStyle || isProcessing} 
             onClick={handleFinalize}
           >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Finalize Quote
           </Button>
        </div>
      </div>
    );
  }

  return null;
}
