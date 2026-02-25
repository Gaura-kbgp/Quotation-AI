
"use client";

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Box, 
  AlertTriangle, 
  CheckCircle2, 
  Calculator, 
  Settings, 
  Factory,
  ChevronRight,
  Loader2,
  Trash2
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { generateBOMAction } from '../../actions';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface ReviewClientProps {
  project: any;
  manufacturers: any[];
}

export function ReviewClient({ project, manufacturers }: ReviewClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedManId, setSelectedManId] = useState<string>('');
  const [config, setConfig] = useState({ collection: '', doorStyle: '' });
  const [availableCollections, setAvailableCollections] = useState<string[]>([]);
  const [availableStyles, setAvailableStyles] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFetchingConfig, setIsFetchingConfig] = useState(false);

  const rooms = project.extracted_data?.rooms || [];
  const nkbaFlags = project.extracted_data?.nkba_flags || [];

  const fetchManufacturerConfig = async (manId: string) => {
    setSelectedManId(manId);
    setIsFetchingConfig(true);
    try {
      // Fetch unique collections/styles via production API
      const res = await fetch(`/api/manufacturer-config?id=${manId}`);
      const data = await res.json();
      setAvailableCollections(data.collections || []);
      setAvailableStyles(data.styles || []);
      setConfig({ collection: '', doorStyle: '' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error fetching config' });
    } finally {
      setIsFetchingConfig(false);
    }
  };

  const handleGenerateBOM = async () => {
    if (!selectedManId || !config.collection || !config.doorStyle) return;
    
    setIsGenerating(true);
    try {
      const result = await generateBOMAction(project.id, selectedManId, config.collection, config.doorStyle);
      if (result.success) {
        toast({ title: 'BOM Generated Successfully' });
        router.push(`/quotation-ai/bom/${project.id}`);
      } else {
        throw new Error(result.error);
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'BOM Error', description: err.message });
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-8">
        {nkbaFlags.length > 0 && (
          <div className="p-6 rounded-3xl bg-amber-500/10 border border-amber-500/20 space-y-3">
             <div className="flex items-center gap-2 text-amber-400 font-bold">
                <AlertTriangle className="w-5 h-5" />
                NKBA Validation Alerts
             </div>
             <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {nkbaFlags.map((flag: string, i: number) => (
                  <li key={i} className="text-sm text-slate-300 flex gap-2">
                     <span className="text-amber-500/50">•</span>
                     {flag}
                  </li>
                ))}
             </ul>
          </div>
        )}

        {rooms.map((room: any, idx: number) => (
          <Card key={idx} className="dark-glass border-white/5 overflow-hidden">
            <CardHeader className="border-b border-white/5 bg-white/5">
              <div className="flex justify-between items-center">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Box className="w-5 h-5 text-sky-400" />
                  {room.room_name}
                </CardTitle>
                <Badge variant="outline" className="border-sky-500/30 text-sky-400 uppercase tracking-widest text-[10px]">
                  {room.room_type}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-white/5">
                {room.cabinets.map((cab: any, cIdx: number) => (
                  <div key={cIdx} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center font-bold text-sky-400 border border-white/10">
                        {cab.qty}
                      </div>
                      <div>
                        <p className="font-bold text-lg tracking-tight">{cab.code}</p>
                        <p className="text-xs text-slate-500 uppercase font-semibold">{cab.type} Cabinet</p>
                      </div>
                    </div>
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                      Verified
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-6">
        <Card className="dark-glass border-sky-500/20 sticky top-8 shadow-[0_0_50px_rgba(14,165,233,0.1)]">
          <CardHeader className="border-b border-white/5">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calculator className="w-5 h-5 text-sky-400" />
              Pricing Config
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Manufacturer</label>
                <Select onValueChange={fetchManufacturerConfig}>
                  <SelectTrigger className="bg-white/5 border-white/10 h-12">
                    <SelectValue placeholder="Select Brand" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 border-white/10 text-slate-100">
                    {manufacturers.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedManId && (
                <>
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Collection</label>
                    <Select 
                      disabled={isFetchingConfig} 
                      onValueChange={(v) => setConfig(prev => ({ ...prev, collection: v }))}
                    >
                      <SelectTrigger className="bg-white/5 border-white/10 h-12">
                        <SelectValue placeholder={isFetchingConfig ? "Loading..." : "Select Collection"} />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-950 border-white/10 text-slate-100">
                        {availableCollections.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Door Style</label>
                    <Select 
                      disabled={isFetchingConfig || !config.collection} 
                      onValueChange={(v) => setConfig(prev => ({ ...prev, doorStyle: v }))}
                    >
                      <SelectTrigger className="bg-white/5 border-white/10 h-12">
                        <SelectValue placeholder="Select Style" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-950 border-white/10 text-slate-100">
                        {availableStyles.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>

            <Button 
              className="w-full h-14 gradient-button mt-4 shadow-sky-500/20"
              disabled={!config.doorStyle || isGenerating}
              onClick={handleGenerateBOM}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Matching SKUs...
                </>
              ) : (
                <>
                  Generate BOM & Pricing
                  <ChevronRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>

            <div className="pt-4 border-t border-white/5 flex items-center justify-center gap-4 text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">
               <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  Live Matcher
               </div>
               <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-sky-500" />
                  AI Validated
               </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
