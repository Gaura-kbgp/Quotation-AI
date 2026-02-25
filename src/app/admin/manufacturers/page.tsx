import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
          <h1 className="text-3xl font-bold text-slate-100">Manufacturers</h1>
          <p className="text-slate-400 mt-1">Manage manufacturer data and specification files.</p>
        </div>
        <Button className="gradient-button">
          <Plus className="w-4 h-4 mr-2" />
          Add Manufacturer
        </Button>
      </div>

      <Card className="glass-card border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center gap-4 bg-slate-900/20">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input 
              placeholder="Search manufacturers..." 
              className="pl-10 bg-slate-900/50 border-slate-700"
            />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-slate-800">
              <TableHead className="text-slate-400">Manufacturer</TableHead>
              <TableHead className="text-slate-400">Status</TableHead>
              <TableHead className="text-slate-400">Added Date</TableHead>
              <TableHead className="text-right text-slate-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockManufacturers.map((m) => (
              <TableRow key={m.id} className="border-slate-800 hover:bg-slate-800/30">
                <TableCell className="font-medium text-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center">
                      <Factory className="w-4 h-4 text-sky-500" />
                    </div>
                    {m.name}
                  </div>
                </TableCell>
                <TableCell>
                  <span className={cn(
                    "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider",
                    m.status === 'Active' ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                  )}>
                    {m.status}
                  </span>
                </TableCell>
                <TableCell className="text-slate-400">{m.created_at}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-100">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800 text-slate-300">
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
                      <DropdownMenuItem className="text-red-400 hover:text-red-300 focus:text-red-300">
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
        <div className="p-4 border-t border-slate-800 flex items-center justify-between text-sm text-slate-500">
          <span>Showing 3 results</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-slate-800" disabled>Previous</Button>
            <Button variant="outline" size="sm" className="border-slate-800" disabled>Next</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
