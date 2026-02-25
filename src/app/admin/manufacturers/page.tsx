"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Factory, Plus, Search, MoreHorizontal, Trash2, Eye, Loader2, ChevronRight, AlertCircle, RefreshCcw } from 'lucide-react';
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
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase-client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function ManufacturersPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [manufacturers, setManufacturers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newManufacturerName, setNewManufacturerName] = useState('');

  const fetchManufacturers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: supabaseError } = await supabase
        .from('manufacturers')
        .select('*')
        .order('name');
      
      if (supabaseError) throw supabaseError;
      setManufacturers(data || []);
    } catch (err: any) {
      console.error('Fetch manufacturers failed:', err);
      let message = err.message || 'An unexpected error occurred';
      
      // Heuristic for network timeouts/blockage
      if (message.includes('Failed to fetch') || !err.status) {
        message = 'Connection Timeout: Unable to reach the Supabase server. Please verify that your Supabase project is active and your network allows outgoing requests.';
      }
      
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchManufacturers();
  }, [fetchManufacturers]);

  const filteredManufacturers = manufacturers.filter(m => 
    m.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddManufacturer = async () => {
    if (!newManufacturerName.trim()) return;
    try {
      const { error: addError } = await supabase
        .from('manufacturers')
        .insert([{ name: newManufacturerName, status: 'Active' }]);

      if (addError) throw addError;
      
      setNewManufacturerName('');
      setIsAdding(false);
      fetchManufacturers();
      toast({ title: 'Manufacturer added successfully' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error adding manufacturer', description: err.message });
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this manufacturer?')) return;
    
    try {
      const { error: delError } = await supabase.from('manufacturers').delete().eq('id', id);
      if (delError) throw delError;
      fetchManufacturers();
      toast({ title: 'Manufacturer removed' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error deleting manufacturer', description: err.message });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Manufacturers</h1>
          <p className="text-slate-500 mt-1">Manage cabinetry suppliers and their technical documentation.</p>
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

      {error && (
        <Alert variant="destructive" className="bg-red-50 border-red-200">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Database Connection Error</AlertTitle>
          <AlertDescription className="flex flex-col gap-4">
            <p className="text-red-700 leading-relaxed">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchManufacturers} className="w-fit border-red-200 text-red-700 hover:bg-red-100">
              <RefreshCcw className="w-4 h-4 mr-2" />
              Retry Connection
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card className="glass-card border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search manufacturers..." 
              className="pl-10 bg-white border-slate-200"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={loading && manufacturers.length === 0}
            />
          </div>
        </div>

        {loading && manufacturers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
            <p className="text-slate-400 text-sm font-medium">Connecting to Supabase...</p>
          </div>
        ) : manufacturers.length > 0 ? (
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
              {filteredManufacturers.map((m: any) => (
                <TableRow 
                  key={m.id} 
                  className="border-slate-100 hover:bg-slate-50 cursor-pointer group"
                  onClick={() => router.push(`/admin/manufacturers/${m.id}`)}
                >
                  <TableCell className="font-medium text-slate-900">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center group-hover:bg-sky-100 transition-colors">
                        <Factory className="w-4 h-4 text-sky-600" />
                      </div>
                      <span className="group-hover:text-sky-600 transition-colors">{m.name}</span>
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
                    {m.created_at ? new Date(m.created_at).toLocaleDateString() : 'N/A'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                       <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-900">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white border-slate-200 text-slate-700">
                          <DropdownMenuItem onClick={() => router.push(`/admin/manufacturers/${m.id}`)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => handleDelete(m.id, e)} className="text-red-600 hover:text-red-700 focus:text-red-700">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-sky-500 transition-colors" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredManufacturers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-slate-400">
                    No manufacturers found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        ) : !loading && (
          <div className="p-20 text-center text-slate-400">
            {error ? "Unable to load data. Please retry." : "No manufacturers added yet."}
          </div>
        )}
      </Card>
    </div>
  );
}
