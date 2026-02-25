
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  UploadCloud, 
  FileText, 
  Loader2, 
  ArrowLeft, 
  Sparkles,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function QuotationAiPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [projectName, setProjectName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleUpload = async () => {
    if (!file) return;

    setIsProcessing(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectName', projectName);

    try {
      const res = await fetch('/api/upload-drawing', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (res.ok && result.projectId) {
        toast({ title: 'AI Extraction Complete', description: 'Redirecting to project review...' });
        router.push(`/quotation-ai/review/${result.projectId}`);
      } else {
        throw new Error(result.error || 'AI analysis failed');
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Processing Error', description: err.message });
      setIsProcessing(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#020617] dark-premium text-slate-100 p-8 flex flex-col items-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_var(--tw-gradient-stops))] from-sky-500/10 via-transparent to-transparent -z-10" />
      
      <div className="w-full max-w-4xl space-y-12">
        <div className="flex justify-between items-center">
          <Link href="/">
            <Button variant="ghost" className="text-slate-400 hover:text-sky-400 transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/20">
            <Sparkles className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-sky-400">Gemini 2.5 Intelligence</span>
          </div>
        </div>

        <div className="text-center space-y-4">
          <h1 className="text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-sky-300 via-sky-500 to-sky-700">
            Intelligent Quotation Engine
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Upload your architectural drawing PDF. Our AI will automatically extract cabinet codes, quantify materials, and validate against NKBA standards.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="md:col-span-2 dark-glass border-white/5 shadow-2xl overflow-hidden group">
            <CardContent className="p-8 space-y-8">
              <div className="space-y-4">
                <Label className="text-slate-300 font-semibold text-lg">Project Details</Label>
                <Input 
                  placeholder="e.g. Modern Minimalist Kitchen - Unit 402"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="bg-white/5 border-white/10 h-12 focus:ring-sky-500/50 text-lg"
                />
              </div>

              <div 
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); setFile(e.dataTransfer.files[0]); }}
                className={cn(
                  "border-2 border-dashed rounded-3xl p-16 transition-all duration-500 flex flex-col items-center justify-center text-center cursor-pointer",
                  isDragging ? "border-sky-500 bg-sky-500/5 scale-[1.02]" : "border-white/10 hover:border-sky-500/50 hover:bg-white/5",
                  file ? "border-emerald-500/50 bg-emerald-500/5" : ""
                )}
              >
                <input 
                  id="drawing-upload" 
                  type="file" 
                  accept=".pdf" 
                  className="hidden" 
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <label htmlFor="drawing-upload" className="cursor-pointer flex flex-col items-center">
                  {file ? (
                    <>
                      <div className="w-20 h-20 rounded-2xl bg-emerald-500/20 flex items-center justify-center mb-4">
                        <FileText className="w-10 h-10 text-emerald-400" />
                      </div>
                      <p className="text-xl font-bold text-emerald-400">{file.name}</p>
                      <p className="text-sm text-slate-500 mt-2">Ready for AI processing ({(file.size / (1024 * 1024)).toFixed(1)}MB)</p>
                    </>
                  ) : (
                    <>
                      <div className="w-20 h-20 rounded-2xl bg-sky-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <UploadCloud className="w-10 h-10 text-sky-400" />
                      </div>
                      <p className="text-2xl font-bold text-slate-200">Drop Architectural PDF</p>
                      <p className="text-slate-500 mt-3 max-w-sm">
                        Ensure the drawing includes cabinet schedules or callouts for best accuracy.
                      </p>
                    </>
                  )}
                </label>
              </div>

              <Button 
                onClick={handleUpload}
                disabled={!file || !projectName || isProcessing}
                className="w-full h-16 gradient-button text-xl shadow-sky-500/20"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                    Analyzing Drawing Structure...
                  </>
                ) : (
                  <>
                    Start AI Extraction
                    <ChevronRight className="w-6 h-6 ml-2" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="dark-glass border-white/5">
              <CardContent className="p-6 space-y-6">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-sky-400" />
                  Processing Rules
                </h3>
                <ul className="space-y-4 text-sm text-slate-400">
                  <li className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-1.5 shrink-0" />
                    <span>Multiple project sections detected automatically (Kitchen, Bath, etc.)</span>
                  </li>
                  <li className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-1.5 shrink-0" />
                    <span>NKBA standards check applied to appliance clearances</span>
                  </li>
                  <li className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-1.5 shrink-0" />
                    <span>Auto-normalization of inconsistent cabinet codes</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <div className="p-6 rounded-3xl bg-gradient-to-br from-sky-500/20 to-purple-500/20 border border-white/10 text-center space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] font-bold text-sky-400">Precision Guarantee</p>
              <p className="text-sm text-slate-300 font-medium">Extractions are cross-referenced with your uploaded pricing guides.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
