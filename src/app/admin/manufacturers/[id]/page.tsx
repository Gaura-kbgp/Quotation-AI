"use client";

import { use, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  Factory, 
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
import { supabaseClient } from '@/lib/supabase-client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { extractSpecifications } from '../../actions';

export default function ManufacturerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();

  const [manufacturer, setManufacturer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<any[]>([]);
  const [specsSummary, setSpecsSummary] = useState<any>(null);

  const [isAddingFile, setIsAddingFile] = useState<{ open: boolean, type: 'spec' | 'pricing' | null }>({ open: false, type: null });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [mRes, fRes, sRes] = await Promise.all([
      supabaseClient.from('manufacturers').select('*').eq('id', id).single(),
      supabaseClient.from('manufacturer_files').select('*').eq('manufacturer_id', id).order('created_at', { ascending: false }),
      supabaseClient.from('manufacturer_specifications').select('collection_name, door_style').eq('manufacturer_id', id)
    ]);

    if (mRes.error) {
      toast({ variant: 'destructive', title: 'Error', description: mRes.error.message });
    } else {
      setManufacturer(mRes.data);
      setFiles(fRes.data || []);
      
      if (sRes.data) {
        const collections = new Set(sRes.data.map(s => s.collection_name));
        const styles = new Set(sRes.data.map(s => s.door_style));
        setSpecsSummary({
          collections: collections.size,
          styles: styles.size,
          count: sRes.data.length
        });
      }
    }
    setLoading(false);
  }, [id, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFileUpload = async () => {
    if (!uploadFile || !isAddingFile.type) return;

    if (uploadFile.size > 20 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum file size is 20MB' });
      return;
    }

    setIsUploading(true);
    const fileExt = uploadFile.name.split('.').pop();
    const fileName = `${id}/${isAddingFile.type}s/${crypto.randomUUID()}.${fileExt}`;

    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('manufacturer-docs')
      .upload(fileName, uploadFile, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      toast({ variant: 'destructive', title: 'Upload Failed', description: uploadError.message });
      setIsUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabaseClient.storage.from('manufacturer-docs').getPublicUrl(fileName);

    const { data: dbData, error: dbError } = await supabaseClient
      .from('manufacturer_files')
      .insert([{
        manufacturer_id: id,
        file_type: isAddingFile.type,
        file_name: uploadFile.name,
        file_url: publicUrl,
        file_format: fileExt?.toLowerCase()
      }])
      .select()
      .single();

    if (dbError) {
      toast({ variant: 'destructive', title: 'Database Error', description: dbError.message });
    } else {
      toast({ title: 'File Uploaded Successfully' });
      
      if (isAddingFile.type === 'pricing') {
        toast({ title: 'Extracting specifications...' });
        const extRes = await extractSpecifications(dbData.id, id, publicUrl);
        if (extRes.success) {
          toast({ title: 'Extraction Complete', description: `Successfully parsed ${extRes.count} specifications.` });
        } else {
          toast({ variant: 'destructive', title: 'Extraction Failed', description: extRes.error });
        }
      }

      setUploadFile(null);
      setIsAddingFile({ open: false, type: null });
      fetchData();
    }
    setIsUploading(false);
  };

  const handleDeleteFile = async (file: any) => {
    const path = file.file_url.split('/public/manufacturer-docs/')[1];
    if (path) {
      await supabaseClient.storage.from('manufacturer-docs').remove([path]);
    }
    
    await supabaseClient.from('manufacturer_files').delete().eq('id', file.id);
    fetchData();
    toast({ title: 'File deleted' });
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="animate-spin text-sky-500 w-8 h-8" /></div>;
  if (!manufacturer) return <div className="text-center py-20"><h2 className="text-2xl font-bold">Manufacturer not found</h2></div>;

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
              {isUploading ? 'Uploading...' : 'Upload & Process'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
