
"use client";

import { Button } from '@/components/ui/button';
import { Printer, Download, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface BomHeaderClientProps {
  id: string;
  projectName: string;
  manufacturerName: string;
}

export function BomHeaderClient({ id, projectName, manufacturerName }: BomHeaderClientProps) {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-100 px-8 h-20 flex items-center justify-between print:hidden">
       <div className="flex items-center gap-6">
          <Link href={`/quotation-ai/review/${id}`}>
            <Button variant="ghost" size="icon" className="rounded-full h-12 w-12">
              <ArrowLeft className="w-6 h-6" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{projectName}</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-2">
              Quotation Preview • {manufacturerName}
            </p>
          </div>
       </div>
       <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            className="rounded-xl h-11 px-5 font-semibold text-slate-600" 
            onClick={() => window.print()}
          >
            <Printer className="w-4 h-4 mr-2" /> Print PDF
          </Button>
          <Button className="gradient-button rounded-xl px-8 h-11 shadow-sky-500/10">
            <Download className="w-4 h-4 mr-2" /> Export XLSX
          </Button>
       </div>
    </header>
  );
}
