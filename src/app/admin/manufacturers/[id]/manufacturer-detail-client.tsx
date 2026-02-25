"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  FileText, 
  Table as TableIcon, 
  Trash2, 
  ExternalLink, 
  ArrowLeft, 
  Loader2, 
  Plus, 
  FileUp, 
  UploadCloud,
  CheckCircle2,
  Database
} from 'lucide-react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { uploadManufacturerFileAction, deleteManufacturerFileAction } from '../../actions';

interface ManufacturerDetailClientProps {
  id: string;
  manufacturer: any;
  initialFiles: any[];
  initialSpecsSummary: any;
}

export function ManufacturerDetailClient({ id, manufacturer, initialFiles, initialSpecsSummary }: ManufacturerDetailClientProps) {
  const { toast } = useToast();
  const [files, setFiles] = useState(initialFiles);
  const [specsSummary] = useState(initialSpecsSummary);
  
  const [isAddingFile, setIsAddingFile] = useState<{ open: boolean, type: 'spec' | 'pricing' | null }>({ open: false, type: null });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileUpload = async () => {
    if (!uploadFile || !isAddingFile.type) return;

    if (uploadFile.size > 20 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum file size is 20MB' });
      return;
    }

    setIsUploading(true);
    
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('manufacturerId', id);
    formData.append('fileType', isAddingFile.type);

    try {
      const result = await uploadManufacturerFileAction(formData);

      if (!result.success) {
        toast({ variant: 'destructive', title: 'Upload Failed', description: result.error });
      } else {
        toast({ title: 'File Uploaded Successfully', description: result.extractionSummary });
        // Since we are using Server Actions with revalidatePath, we could just refresh the page
        // or manually update local state if we want instant feedback.
        window.location.reload(); 
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'System Error', description: err.message });
    } finally {
      setIsUploading(false);
      setUploadFile(null);
      setIsAddingFile({ open: false, type: null });
    }
  };

  const handleDeleteFile = async (file: any) => {
    if (!confirm('Are you sure you want to delete this file?')) return;
    
    try {
      const result = await deleteManufacturerFileAction(file.id, file.file_url, id);
      if (result.success) {
        toast({ title: 'File deleted' });
        setFiles(prev => prev.filter(f => f.id !== file.id));
      } else {
        toast({ variant: 'destructive', title: 'Delete Failed', description: result.error });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/admin/manufacturers">
           <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-6 h-6" />
           </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{manufacturer.name}</h1>
          <p className="text-slate-500">Manage technical specifications and pricing documents.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <FileText className="w-5 h-5 text-sky-600" />
                  Specification Books
                </CardTitle>
                <CardDescription>Multiple PDF catalogs support.</CardDescription>
              </div>
              <Button onClick={() => setIsAddingFile({ open: true, type: 'spec' })} variant="outline" size="sm" className="rounded-xl">
                <Plus className="w-4 h-4 mr-2" />
                Add PDF
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {files.filter(f => f.file_type === 'spec').length === 0 ? (
                  <div className="p-12 text-center text-slate-400">No specification books uploaded.</div>
                ) : (
                  files.filter(f => f.file_type === 'spec').map(file => (
                    <div key={file.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-sky-500" />
                        <div>
                          <p className="text-sm font-semibold">{file.file_name}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-widest">{new Date(file.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" asChild><a href={file.file_url} target="_blank"><ExternalLink className="w-4 h-4" /></a></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteFile(file)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <TableIcon className="w-5 h-5 text-emerald-600" />
                  Pricing Files (XLSX, XLSM, CSV)
                </CardTitle>
                <CardDescription>Automatic extraction enabled on upload.</CardDescription>
              </div>
              <Button onClick={() => setIsAddingFile({ open: true, type: 'pricing' })} variant="outline" size="sm" className="rounded-xl border-emerald-100 text-emerald-600">
                <Plus className="w-4 h-4 mr-2" />
                Add File
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {files.filter(f => f.file_type === 'pricing').length === 0 ? (
                  <div className="p-12 text-center text-slate-400">No pricing files uploaded.</div>
                ) : (
                  files.filter(f => f.file_type === 'pricing').map(file => (
                    <div key={file.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                      <div className="flex items-center gap-3">
                        <TableIcon className="w-5 h-5 text-emerald-500" />
                        <div>
                          <p className="text-sm font-semibold">{file.file_name}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 uppercase tracking-widest">{new Date(file.created_at).toLocaleDateString()}</span>
                            <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-bold uppercase tracking-wider">Specifications Extracted</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" asChild><a href={file.file_url} target="_blank"><ExternalLink className="w-4 h-4" /></a></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteFile(file)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="glass-card sticky top-24">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="w-5 h-5 text-sky-600" />
                Parsed Specs Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-2xl font-bold text-slate-900">{specsSummary?.collections || 0}</p>
                  <p className="text-xs text-slate-500 uppercase font-semibold">Collections</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-2xl font-bold text-slate-900">{specsSummary?.styles || 0}</p>
                  <p className="text-xs text-slate-500 uppercase font-semibold">Door Styles</p>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-sky-50 border border-sky-100">
                <p className="text-sm text-sky-700 font-medium">{specsSummary?.count || 0} normalized rows stored in database.</p>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-400">System automatically scans for structured data upon spreadsheet upload.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isAddingFile.open} onOpenChange={(open) => !open && setIsAddingFile({ open: false, type: null })}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle>Upload {isAddingFile.type === 'pricing' ? 'Pricing File' : 'Specification Book'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if(f) setUploadFile(f); }}
              className={cn(
                "border-2 border-dashed rounded-2xl p-8 transition-all flex flex-col items-center justify-center text-center cursor-pointer",
                isDragging ? "border-sky-500 bg-sky-50" : "border-slate-200 hover:border-sky-400 hover:bg-slate-50/50",
                uploadFile ? "border-emerald-400 bg-emerald-50/20" : ""
              )}
            >
              <input 
                id="file-input" 
                type="file" 
                accept={isAddingFile.type === 'pricing' ? '.xlsx,.xlsm,.csv' : '.pdf'} 
                className="hidden" 
                onChange={e => setUploadFile(e.target.files?.[0] || null)} 
              />
              <label htmlFor="file-input" className="cursor-pointer w-full flex flex-col items-center">
                {uploadFile ? (
                  <>
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-2" />
                    <p className="text-sm font-semibold text-emerald-700">{uploadFile.name}</p>
                    <p className="text-xs text-slate-400 mt-1">Ready to upload</p>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-10 h-10 text-slate-300 mb-2" />
                    <p className="text-sm font-medium">Drag & drop or <span className="text-sky-600">browse</span></p>
                    <p className="text-xs text-slate-400 mt-1">{isAddingFile.type === 'pricing' ? 'Excel / CSV' : 'PDF'} up to 20MB</p>
                  </>
                )}
              </label>
            </div>
            <Button onClick={handleFileUpload} className="w-full h-11 gradient-button" disabled={isUploading || !uploadFile}>
              {isUploading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <FileUp className="w-4 h-4 mr-2" />}
              {isUploading ? 'Processing...' : 'Upload & Process'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}