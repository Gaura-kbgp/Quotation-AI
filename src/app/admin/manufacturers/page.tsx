"use client";

import { useState, useEffect } from 'react';
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

  const fetchManufacturers = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('manufacturers')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setManufacturers(data || []);
    } catch (err: any) {
      console.error('Supabase connection error:', err);
      const message = err.message === 'Failed to fetch' 
        ? 'Connection timed out. Please check if your Supabase project is active and reachable.' 
        : err.message;
      setError(message);
      toast({ 
        variant: 'destructive', 
        title: 'Connection Error', 
        description: message 
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchManufacturers();
  }, []);

  const filteredManufacturers = manufacturers.filter(m => 
    m.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddManufacturer = async () => {
    if (!newManufacturerName.trim()) return;
    
    try {
      const { data, error } = await supabase
        .from('manufacturers')
        .insert([{ name: newManufacturerName, status: 'Active' }])
        .select();

      if (error) throw error;
      
      setNewManufacturerName('');
      setIsAdding(false);
      fetchManufacturers();
      toast({ title: 'Manufacturer added' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.from('manufacturers').delete().eq('id', id);
      if (error) throw error;
      fetchManufacturers();
      toast({ title: 'Manufacturer removed' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Manufacturers</h1>
          <p className="text-slate-500 mt-1">Production data managed via Supabase.</p>
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
          <AlertTitle>Network Error</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={fetchManufacturers} className="ml-4 border-red-200 text-red-700 hover:bg-red-100">
              <RefreshCcw className="w-4 h-4 mr-2" />
              Retry
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
              disabled={!!error}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          </div>
        ) : !error ? (
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
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/manufacturers/${m.id}`}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </Link>
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
        ) : (
          <div className="p-12 text-center text-slate-400">
            Please resolve the connection error to view manufacturers.
          </div>
        )}
      </Card>
    </div>
  );
}
