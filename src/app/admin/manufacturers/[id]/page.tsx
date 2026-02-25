
"use client";

import { use, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Factory, FileText, Table as TableIcon, Upload, Trash2, ExternalLink, ArrowLeft, Loader2, Plus, X, FileUp } from 'lucide-react';
import Link from 'next/link';
import { useDoc, useFirestore, useMemoFirebase, useCollection, useStorage } from '@/firebase';
import { doc, collection, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';

export default function ManufacturerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { db } = useFirestore();
  const { storage } = useStorage();
  const { toast } = useToast();

  const [isAddingSheet, setIsAddingSheet] = useState(false);
  const [isAddingBook, setIsAddingBook] = useState(false);
  
  const [newFile, setNewFile] = useState({ name: '', url: '' });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const manufacturerRef = useMemoFirebase(() => {
    if (!db || !id) return null;
    return doc(db, 'manufacturers', id);
  }, [db, id]);

  const { data: manufacturer, loading } = useDoc(manufacturerRef);

  const pricingSheetsQuery = useMemoFirebase(() => {
    if (!db || !id) return null;
    return collection(db, 'manufacturers', id, 'pricingSheets');
  }, [db, id]);

  const specBooksQuery = useMemoFirebase(() => {
    if (!db || !id) return null;
    return collection(db, 'manufacturers', id, 'specBooks');
  }, [db, id]);

  const { data: pricingSheets, loading: loadingSheets } = useCollection(pricingSheetsQuery);
  const { data: specBooks, loading: loadingBooks } = useCollection(specBooksQuery);

  const resetForm = () => {
    setNewFile({ name: '', url: '' });
    setUploadFile(null);
    setIsUploading(false);
    setUploadProgress(0);
  };

  const handleFileUpload = async (type: 'specBooks' | 'pricingSheets') => {
    if (!db || !id || !storage) return;

    let finalUrl = newFile.url;
    let finalName = newFile.name;

    if (uploadFile) {
      setIsUploading(true);
      const storageRef = ref(storage, `manufacturers/${id}/${type}/${Date.now()}_${uploadFile.name}`);
      const uploadTask = uploadBytesResumable(storageRef, uploadFile);

      return new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(progress);
          },
          (error) => {
            toast({ variant: 'destructive', title: 'Upload Failed', description: error.message });
            setIsUploading(false);
            reject(error);
          },
          async () => {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            finalUrl = downloadURL;
            if (!finalName) finalName = uploadFile.name;
            
            await addDoc(collection(db, 'manufacturers', id, type), {
              fileName: finalName,
              url: finalUrl,
              type: type === 'pricingSheets' ? (uploadFile.name.endsWith('.csv') ? 'CSV' : 'XLSX') : 'PDF',
              uploadedAt: serverTimestamp()
            });
            
            resetForm();
            type === 'specBooks' ? setIsAddingBook(false) : setIsAddingSheet(false);
            resolve(true);
          }
        );
      });
    } else if (finalUrl && finalName) {
      await addDoc(collection(db, 'manufacturers', id, type), {
        fileName: finalName,
        url: finalUrl,
        type: type === 'pricingSheets' ? 'XLSX' : 'PDF',
        uploadedAt: serverTimestamp()
      });
      resetForm();
      type === 'specBooks' ? setIsAddingBook(false) : setIsAddingSheet(false);
    } else {
      toast({ variant: 'destructive', title: 'Missing Info', description: 'Please provide a file or a URL and name.' });
    }
  };

  const handleDeleteItem = async (collectionName: string, itemId: string) => {
    if (!db || !id) return;
    await deleteDoc(doc(db, 'manufacturers', id, collectionName, itemId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }

  if (!manufacturer) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-slate-900">Manufacturer not found</h2>
        <Link href="/admin/manufacturers" className="text-sky-600 hover:underline mt-4 block">Return to list</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Link href="/admin/manufacturers">
           <Button variant="ghost" size="icon" className="text-slate-400 hover:text-sky-600 rounded-full">
              <ArrowLeft className="w-6 h-6" />
           </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 font-headline">{manufacturer.name}</h1>
          <div className="flex items-center gap-2 mt-1">
             <span className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded">ID: {id}</span>
             <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600">Active</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Specification Book Section */}
        <Card className="glass-card border-slate-200 overflow-hidden">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-xl flex items-center gap-2 text-slate-900">
                  <FileText className="w-5 h-5 text-sky-600" />
                  Specification Books
                </CardTitle>
                <CardDescription className="text-slate-500">Technical documentation and PDF catalogs</CardDescription>
              </div>
              <Dialog open={isAddingBook} onOpenChange={(open) => { setIsAddingBook(open); if(!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="border-sky-100 text-sky-600 hover:bg-sky-50">
                    <Plus className="w-4 h-4 mr-2" />
                    Add PDF
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-white">
                   <DialogHeader>
                      <DialogTitle>Add Specification Book</DialogTitle>
                   </DialogHeader>
                   <div className="space-y-6 py-4">
                      <div className="space-y-2">
                         <Label>Upload PDF File</Label>
                         <div className="flex items-center gap-3">
                           <Input 
                              type="file" 
                              accept=".pdf"
                              onChange={e => setUploadFile(e.target.files?.[0] || null)}
                              className="cursor-pointer"
                           />
                         </div>
                      </div>
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-100"></span></div>
                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-400">Or use URL</span></div>
                      </div>
                      <div className="space-y-2">
                         <Label>File Name</Label>
                         <Input 
                            placeholder="e.g. 2024 Design Catalog" 
                            value={newFile.name}
                            onChange={e => setNewFile({...newFile, name: e.target.value})}
                         />
                      </div>
                      <div className="space-y-2">
                         <Label>PDF URL</Label>
                         <Input 
                            placeholder="https://example.com/spec.pdf" 
                            value={newFile.url}
                            onChange={e => setNewFile({...newFile, url: e.target.value})}
                         />
                      </div>
                      {isUploading && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs font-medium">
                            <span>Uploading...</span>
                            <span>{Math.round(uploadProgress)}%</span>
                          </div>
                          <Progress value={uploadProgress} className="h-1.5" />
                        </div>
                      )}
                      <Button onClick={() => handleFileUpload('specBooks')} className="w-full gradient-button" disabled={isUploading}>
                        {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileUp className="w-4 h-4 mr-2" />}
                        {uploadFile ? 'Upload and Add' : 'Add to Manufacturer'}
                      </Button>
                   </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
               {loadingBooks ? (
                 <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-slate-300" /></div>
               ) : specBooks?.length === 0 ? (
                 <div className="p-12 text-center text-slate-400 italic bg-slate-50/30">No specification books uploaded yet.</div>
               ) : (
                 specBooks?.map((book: any) => (
                   <div key={book.id} className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center gap-4">
                         <div className="p-2.5 bg-sky-50 rounded-xl">
                            <FileText className="w-5 h-5 text-sky-600" />
                         </div>
                         <div>
                            <p className="text-sm font-semibold text-slate-900">{book.fileName}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-tighter">Added: {book.uploadedAt?.toDate ? book.uploadedAt.toDate().toLocaleDateString() : 'Recent'}</p>
                         </div>
                      </div>
                      <div className="flex gap-2">
                         <Button asChild variant="ghost" size="icon" className="text-slate-400 hover:text-sky-600">
                            <a href={book.url} target="_blank" rel="noopener noreferrer">
                               <ExternalLink className="w-4 h-4" />
                            </a>
                         </Button>
                         <Button onClick={() => handleDeleteItem('specBooks', book.id)} variant="ghost" size="icon" className="text-slate-400 hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                         </Button>
                      </div>
                   </div>
                 ))
               )}
            </div>
          </CardContent>
        </Card>

        {/* Pricing Sheet Section */}
        <Card className="glass-card border-slate-200 overflow-hidden">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-xl flex items-center gap-2 text-emerald-600">
                  <TableIcon className="w-5 h-5 text-emerald-600" />
                  Pricing Sheets
                </CardTitle>
                <CardDescription className="text-slate-500">Excel or Google Sheet integration</CardDescription>
              </div>
              <Dialog open={isAddingSheet} onOpenChange={(open) => { setIsAddingSheet(open); if(!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="border-emerald-100 text-emerald-600 hover:bg-emerald-50">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Sheet
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-white">
                   <DialogHeader>
                      <DialogTitle>Add Pricing Sheet</DialogTitle>
                   </DialogHeader>
                   <div className="space-y-6 py-4">
                      <div className="space-y-2">
                         <Label>Upload Excel/CSV File</Label>
                         <Input 
                            type="file" 
                            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, .xlsm"
                            onChange={e => setUploadFile(e.target.files?.[0] || null)}
                            className="cursor-pointer"
                         />
                      </div>
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-100"></span></div>
                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-400">Or use URL</span></div>
                      </div>
                      <div className="space-y-2">
                         <Label>Sheet Name</Label>
                         <Input 
                            placeholder="e.g. Winter 2024 Price List" 
                            value={newFile.name}
                            onChange={e => setNewFile({...newFile, name: e.target.value})}
                         />
                      </div>
                      <div className="space-y-2">
                         <Label>Sheet URL (Excel/CSV/Google)</Label>
                         <Input 
                            placeholder="https://docs.google.com/..." 
                            value={newFile.url}
                            onChange={e => setNewFile({...newFile, url: e.target.value})}
                         />
                      </div>
                      {isUploading && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs font-medium">
                            <span>Uploading...</span>
                            <span>{Math.round(uploadProgress)}%</span>
                          </div>
                          <Progress value={uploadProgress} className="h-1.5" />
                        </div>
                      )}
                      <Button onClick={() => handleFileUpload('pricingSheets')} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl" disabled={isUploading}>
                        {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileUp className="w-4 h-4 mr-2" />}
                        {uploadFile ? 'Upload and Add' : 'Add to Manufacturer'}
                      </Button>
                   </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
               {loadingSheets ? (
                 <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-slate-300" /></div>
               ) : pricingSheets?.length === 0 ? (
                 <div className="p-12 text-center text-slate-400 italic bg-slate-50/30">No pricing sheets connected yet.</div>
               ) : (
                 pricingSheets?.map((sheet: any) => (
                   <div key={sheet.id} className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center gap-4">
                         <div className="p-2.5 bg-emerald-50 rounded-xl">
                            <TableIcon className="w-5 h-5 text-emerald-600" />
                         </div>
                         <div>
                            <p className="text-sm font-semibold text-slate-900">{sheet.fileName}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-tighter">Synced: {sheet.uploadedAt?.toDate ? sheet.uploadedAt.toDate().toLocaleDateString() : 'Just now'}</p>
                         </div>
                      </div>
                      <div className="flex gap-2">
                         <Button asChild variant="ghost" size="icon" className="text-slate-400 hover:text-emerald-600">
                            <a href={sheet.url} target="_blank" rel="noopener noreferrer">
                               <ExternalLink className="w-4 h-4" />
                            </a>
                         </Button>
                         <Button onClick={() => handleDeleteItem('pricingSheets', sheet.id)} variant="ghost" size="icon" className="text-slate-400 hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                         </Button>
                      </div>
                   </div>
                 ))
               )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
