
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Factory, Plus, Search, MoreHorizontal, Edit, Trash2, Eye, Loader2 } from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, deleteDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

export default function ManufacturersPage() {
  const { db } = useFirestore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newManufacturerName, setNewManufacturerName] = useState('');

  const manufacturersQuery = useMemoFirebase(() => {
    if (!db) return null;
    return collection(db, 'manufacturers');
  }, [db]);

  const { data: manufacturers, loading } = useCollection(manufacturersQuery);

  const filteredManufacturers = manufacturers?.filter(m => 
    m.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddManufacturer = () => {
    if (!db || !newManufacturerName.trim()) return;
    
    const manufacturerData = {
      name: newManufacturerName,
      status: 'Active',
      createdAt: serverTimestamp(),
    };

    addDoc(collection(db, 'manufacturers'), manufacturerData)
      .then(() => {
        setNewManufacturerName('');
        setIsAdding(false);
      })
      .catch(async (e) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'manufacturers',
          operation: 'create',
          requestResourceData: manufacturerData
        }));
      });
  };

  const handleDelete = (id: string) => {
    if (!db) return;
    const docRef = doc(db, 'manufacturers', id);
    deleteDoc(docRef).catch(async (e) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: docRef.path,
        operation: 'delete'
      }));
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Manufacturers</h1>
          <p className="text-slate-500 mt-1">Manage manufacturer data and specification files.</p>
        </div>
        
        <Dialog open={isAdding} onOpenChange={setIsAdding}>
          <DialogTrigger asChild>
            <Button className="gradient-button">
              <Plus className="w-4 h-4 mr-2" />
              Add Manufacturer
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white">
            <DialogHeader>
              <DialogTitle>Add New Manufacturer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Manufacturer Name</Label>
                <Input 
                  id="name" 
                  value={newManufacturerName} 
                  onChange={(e) => setNewManufacturerName(e.target.value)} 
                  placeholder="e.g. Premium Cabinets Co."
                />
              </div>
              <Button onClick={handleAddManufacturer} className="w-full gradient-button">Create Manufacturer</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="glass-card border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search manufacturers..." 
              className="pl-10 bg-white border-slate-200"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-slate-200">
                <TableHead className="text-slate-500">Manufacturer</TableHead>
                <TableHead className="text-slate-500">Status</TableHead>
                <TableHead className="text-slate-500">Added Date</TableHead>
                <TableHead className="text-right text-slate-500">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredManufacturers?.map((m: any) => (
                <TableRow key={m.id} className="border-slate-100 hover:bg-slate-50">
                  <TableCell className="font-medium text-slate-900">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center">
                        <Factory className="w-4 h-4 text-sky-600" />
                      </div>
                      {m.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={cn(
                      "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider",
                      m.status === 'Active' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                    )}>
                      {m.status || 'Active'}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-500">
                    {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString() : 'N/A'}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-900">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-white border-slate-200 text-slate-700">
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/manufacturers/${m.id}`}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(m.id)} className="text-red-600 hover:text-red-700 focus:text-red-700">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {(!filteredManufacturers || filteredManufacturers.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-slate-400">
                    No manufacturers found. Click "Add Manufacturer" to begin.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
