
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
          <div className="p-6 rounded-3xl bg-amber-50 border border-amber-200 space-y-3 shadow-sm">
             <div className="flex items-center gap-2 text-amber-700 font-bold">
                <AlertTriangle className="w-5 h-5" />
                NKBA Validation Alerts
             </div>
             <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {nkbaFlags.map((flag: string, i: number) => (
                  <li key={i} className="text-sm text-slate-600 flex gap-2">
                     <span className="text-amber-500">•</span>
                     {flag}
                  </li>
                ))}
             </ul>
          </div>
        )}

        {rooms.map((room: any, idx: number) => (
          <Card key={idx} className="bg-white border-slate-200 shadow-md overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <div className="flex justify-between items-center">
                <CardTitle className="text-xl flex items-center gap-2 text-slate-900">
                  <Box className="w-5 h-5 text-sky-500" />
                  {room.room_name}
                </CardTitle>
                <Badge variant="outline" className="border-sky-200 text-sky-600 uppercase tracking-widest text-[10px] font-bold">
                  {room.room_type}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {room.cabinets.map((cab: any, cIdx: number) => (
                  <div key={cIdx} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-sky-600 border border-slate-200">
                        {cab.qty}
                      </div>
                      <div>
                        <p className="font-bold text-lg tracking-tight text-slate-900">{cab.code}</p>
                        <p className="text-xs text-slate-500 uppercase font-bold">{cab.type} Cabinet</p>
                      </div>
                    </div>
                    <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100">
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
        <Card className="bg-white border-slate-200 sticky top-8 shadow-xl">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
              <Calculator className="w-5 h-5 text-sky-500" />
              Pricing Config
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Manufacturer</label>
                <Select onValueChange={fetchManufacturerConfig}>
                  <SelectTrigger className="bg-white border-slate-200 h-12 text-slate-900">
                    <SelectValue placeholder="Select Brand" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-900">
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
                      <SelectTrigger className="bg-white border-slate-200 h-12 text-slate-900">
                        <SelectValue placeholder={isFetchingConfig ? "Loading..." : "Select Collection"} />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-slate-200 text-slate-900">
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
                      <SelectTrigger className="bg-white border-slate-200 h-12 text-slate-900">
                        <SelectValue placeholder="Select Style" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-slate-200 text-slate-900">
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

            <div className="pt-4 border-t border-slate-100 flex items-center justify-center gap-4 text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
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
