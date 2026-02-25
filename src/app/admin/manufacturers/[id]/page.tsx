import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Factory, FileText, Table as TableIcon, Upload, Trash2, ExternalLink, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ManufacturerDetailPage({ params }: { params: { id: string } }) {
  // In a real app, we would fetch details based on params.id
  const manufacturerName = "Cabinets Plus";

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/manufacturers">
           <Button variant="ghost" size="icon" className="text-slate-400 hover:text-sky-400">
              <ArrowLeft className="w-6 h-6" />
           </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-100">{manufacturerName}</h1>
          <p className="text-slate-400">ID: {params.id}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Specification Book Section */}
        <Card className="glass-card border-slate-800">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <FileText className="w-5 h-5 text-sky-500" />
                  Specification Book
                </CardTitle>
                <CardDescription>PDF documentation for catalog and specs (Max 20MB)</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-6 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/30 flex flex-col items-center justify-center text-center">
              <Upload className="w-10 h-10 text-slate-600 mb-4" />
              <p className="text-slate-400 mb-4">Drag and drop your PDF here, or click to browse</p>
              <Button variant="secondary" className="bg-slate-800 hover:bg-slate-700">Select File</Button>
            </div>
            
            <div className="space-y-3">
               <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Current File</h4>
               <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950/50 border border-slate-800">
                  <div className="flex items-center gap-3">
                     <div className="p-2 bg-red-500/10 rounded-lg">
                        <FileText className="w-5 h-5 text-red-500" />
                     </div>
                     <div>
                        <p className="text-sm font-medium text-slate-200">Catalog_2024_Final.pdf</p>
                        <p className="text-xs text-slate-500">Uploaded on March 12, 2024</p>
                     </div>
                  </div>
                  <div className="flex gap-2">
                     <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-100">
                        <Upload className="w-4 h-4" />
                     </Button>
                     <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                     </Button>
                  </div>
               </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing Sheet Section */}
        <Card className="glass-card border-slate-800">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <TableIcon className="w-5 h-5 text-emerald-500" />
                  Pricing Sheets
                </CardTitle>
                <CardDescription>XLSX, CSV or Google Sheet integration</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="p-6 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/30 flex flex-col items-center justify-center text-center">
                <Upload className="w-10 h-10 text-slate-600 mb-4" />
                <p className="text-slate-400 mb-4">Upload XLSX, XLSM or CSV file</p>
                <Button variant="secondary" className="bg-slate-800 hover:bg-slate-700">Select Spreadsheet</Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-800" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-[#0f172a] px-2 text-slate-500 font-bold">Or Connect URL</span>
                </div>
              </div>

              <div className="flex gap-2">
                 <Input placeholder="https://docs.google.com/spreadsheets/d/..." className="bg-slate-950/50 border-slate-700" />
                 <Button className="shrink-0 bg-emerald-600 hover:bg-emerald-500">Connect</Button>
              </div>
            </div>

            <div className="space-y-3">
               <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Active Configuration</h4>
               <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950/50 border border-slate-800">
                  <div className="flex items-center gap-3">
                     <div className="p-2 bg-emerald-500/10 rounded-lg">
                        <TableIcon className="w-5 h-5 text-emerald-500" />
                     </div>
                     <div>
                        <p className="text-sm font-medium text-slate-200">2024_Master_Pricing.xlsx</p>
                        <p className="text-xs text-slate-500">Last synced: 2 days ago</p>
                     </div>
                  </div>
                  <div className="flex gap-2">
                     <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-100">
                        <ExternalLink className="w-4 h-4" />
                     </Button>
                     <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                     </Button>
                  </div>
               </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
