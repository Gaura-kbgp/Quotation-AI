
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  UploadCloud, 
  FileText, 
  Loader2, 
  ArrowLeft, 
  Sparkles,
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleUpload = async () => {
    if (!file) return;

    setIsProcessing(true);
    const formData = new FormData();
    formData.append('file', file);
    // Use the file name as the project name by default since the input was removed
    formData.append('projectName', file.name.replace(/\.[^/.]+$/, ""));

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
    <main className="min-h-screen bg-slate-50 text-slate-900 p-8 flex flex-col items-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_var(--tw-gradient-stops))] from-sky-500/5 via-transparent to-transparent -z-10" />
      
      <div className="w-full max-w-2xl space-y-12">
        <div className="flex justify-between items-center">
          <Link href="/">
            <Button variant="ghost" className="text-slate-500 hover:text-sky-600 transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-sky-50 border border-sky-100">
            <Sparkles className="w-4 h-4 text-sky-600" />
            <span className="text-xs font-bold uppercase tracking-widest text-sky-600">Gemini 2.5 AI</span>
          </div>
        </div>

        <div className="text-center space-y-4">
          <h1 className="text-5xl font-extrabold tracking-tight text-slate-900">
            Intelligent <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-500 to-sky-600">Quotation Engine</span>
          </h1>
        </div>

        <Card className="bg-white border-slate-200 shadow-xl overflow-hidden group">
          <CardContent className="p-8 space-y-8">
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); setFile(e.dataTransfer.files[0]); }}
              className={cn(
                "border-2 border-dashed rounded-3xl p-16 transition-all duration-500 flex flex-col items-center justify-center text-center cursor-pointer min-h-[300px]",
                isDragging ? "border-sky-500 bg-sky-50 scale-[1.02]" : "border-slate-200 hover:border-sky-500/50 hover:bg-slate-50",
                file ? "border-emerald-500/50 bg-emerald-50" : ""
              )}
            >
              <input 
                id="drawing-upload" 
                type="file" 
                accept=".pdf" 
                className="hidden" 
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <label htmlFor="drawing-upload" className="cursor-pointer flex flex-col items-center w-full">
                {file ? (
                  <>
                    <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
                      <FileText className="w-10 h-10 text-emerald-600" />
                    </div>
                    <p className="text-2xl font-bold text-emerald-700 break-all">{file.name}</p>
                    <p className="text-sm text-slate-500 mt-2">Ready for AI processing ({(file.size / (1024 * 1024)).toFixed(1)}MB)</p>
                  </>
                ) : (
                  <>
                    <div className="w-20 h-20 rounded-2xl bg-sky-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <UploadCloud className="w-10 h-10 text-sky-500" />
                    </div>
                    <p className="text-2xl font-bold text-slate-900">Drop Architectural PDF</p>
                    <p className="text-slate-500 mt-3">Select drawing to begin analysis</p>
                  </>
                )}
              </label>
            </div>

            <Button 
              onClick={handleUpload}
              disabled={!file || isProcessing}
              className="w-full h-16 gradient-button text-xl shadow-sky-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                  Analyzing Drawing...
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
      </div>
    </main>
  );
}
