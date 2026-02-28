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
  ChevronRight,
  AlertCircle
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
    formData.append('projectName', file.name.replace(/\.[^/.]+$/, ""));

    try {
      const res = await fetch('/api/upload-drawing', {
        method: 'POST',
        body: formData,
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error('Non-JSON Response:', text);
        
        if (res.status === 504 || text.includes('Error reaching server')) {
          throw new Error('Connection timed out. Please try uploading again.');
        }
        
        throw new Error('Invalid server response. Please try again.');
      }

      const result = await res.json();

      if (res.ok && result.projectId) {
        toast({ title: 'Success', description: 'Redirecting to project review...' });
        router.push(`/quotation-ai/review/${result.projectId}`);
      } else {
        throw new Error(result.error || 'AI analysis failed');
      }
    } catch (err: any) {
      console.error('Upload Error:', err);
      toast({ 
        variant: 'destructive', 
        title: 'Error', 
        description: err.message || 'An unexpected error occurred.'
      });
      setIsProcessing(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-6 flex flex-col items-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_var(--tw-gradient-stops))] from-sky-500/5 via-transparent to-transparent -z-10" />
      
      <div className="w-full max-w-xl space-y-8 mt-4">
        <div className="flex justify-between items-center">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-slate-500 hover:text-sky-600 transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-sky-50 border border-sky-100">
            <Sparkles className="w-3 h-3 text-sky-600" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-sky-600">Pro AI Engine</span>
          </div>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Upload your <span className="text-sky-600">Drawing pdf</span>
          </h1>
          <p className="text-sm text-slate-500">Drop your architectural set below to begin the automatic takeoff process.</p>
        </div>

        <Card className="bg-white border-slate-200 shadow-lg overflow-hidden group">
          <CardContent className="p-6 space-y-6">
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); setFile(e.dataTransfer.files[0]); }}
              className={cn(
                "border-2 border-dashed rounded-2xl p-10 transition-all duration-300 flex flex-col items-center justify-center text-center cursor-pointer min-h-[220px]",
                isDragging ? "border-sky-500 bg-sky-50" : "border-slate-200 hover:border-sky-400 hover:bg-slate-50/50",
                file ? "border-emerald-400 bg-emerald-50/20" : ""
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
                    <div className="w-14 h-14 rounded-xl bg-emerald-100 flex items-center justify-center mb-3">
                      <FileText className="w-7 h-7 text-emerald-600" />
                    </div>
                    <p className="text-lg font-bold text-emerald-700 break-all">{file.name}</p>
                    <p className="text-xs text-slate-400 mt-1">{(file.size / (1024 * 1024)).toFixed(1)}MB • Ready</p>
                  </>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-xl bg-sky-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <UploadCloud className="w-7 h-7 text-sky-500" />
                    </div>
                    <p className="text-lg font-bold text-slate-900">Select Architectural Set</p>
                    <p className="text-xs text-slate-400 mt-2">Click to browse or drag and drop PDF</p>
                  </>
                )}
              </label>
            </div>

            <Button 
              onClick={handleUpload}
              disabled={!file || isProcessing}
              className="w-full h-14 gradient-button text-lg shadow-sky-500/10"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                  Analyzing Drawings...
                </>
              ) : (
                <>
                  Start AI Extraction
                  <ChevronRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {isProcessing && (
          <div className="p-4 rounded-xl bg-sky-50 border border-sky-100 flex items-start gap-3 animate-in fade-in duration-500">
             <AlertCircle className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
             <div className="text-[11px] text-sky-700 leading-relaxed">
                <p className="font-bold mb-0.5">Extraction in Progress</p>
                <p>The system is analyzing all floor plans and schedules. This may take up to 2 minutes for large architectural sets.</p>
             </div>
          </div>
        )}
      </div>
    </main>
  );
}
