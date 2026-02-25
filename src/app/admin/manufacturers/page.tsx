import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Factory, Plus, Search, MoreHorizontal, Edit, Trash2, Eye } from 'lucide-react';
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

// Sample data for UI layout
const mockManufacturers = [
  { id: '1', name: 'Cabinets Plus', status: 'Active', created_at: '2024-03-01' },
  { id: '2', name: 'Elite Hardware', status: 'Pending', created_at: '2024-02-15' },
  { id: '3', name: 'Modern Kitchens', status: 'Active', created_at: '2024-01-20' },
];

export default function ManufacturersPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Manufacturers</h1>
          <p className="text-slate-500 mt-1">Manage manufacturer data and specification files.</p>
        </div>
        <Button className="gradient-button">
          <Plus className="w-4 h-4 mr-2" />
          Add Manufacturer
        </Button>
      </div>

      <Card className="glass-card border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search manufacturers..." 
              className="pl-10 bg-white border-slate-200"
            />
          </div>
        </div>
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
            {mockManufacturers.map((m) => (
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
                    {m.status}
                  </span>
                </TableCell>
                <TableCell className="text-slate-500">{m.created_at}</TableCell>
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
                      <DropdownMenuItem>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600 hover:text-red-700 focus:text-red-700">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="p-4 border-t border-slate-100 flex items-center justify-between text-sm text-slate-400">
          <span>Showing 3 results</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-slate-200" disabled>Previous</Button>
            <Button variant="outline" size="sm" className="border-slate-200" disabled>Next</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
