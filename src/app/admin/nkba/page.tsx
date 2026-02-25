import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Upload, Trash2, Calendar, FileText, History } from 'lucide-react';

export default function NkbaRulesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-100">NKBA Rules Management</h1>
        <p className="text-slate-400 mt-1">Upload and manage National Kitchen & Bath Association standards.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 glass-card border-slate-800">
          <CardHeader>
             <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-sky-500" />
                Current Rules Document
             </CardTitle>
             <CardDescription>This document serves as the foundation for the AI's compliance checking.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
             <div className="p-12 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/30 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-sky-500/10 rounded-full flex items-center justify-center mb-6">
                   <Upload className="w-8 h-8 text-sky-500" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Upload NKBA Standards</h3>
                <p className="text-slate-400 mb-6 max-w-xs mx-auto">Upload the latest official NKBA PDF. This will replace the existing file used by the engine.</p>
                <Button className="gradient-button h-11 px-8">Select PDF Document</Button>
             </div>

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 flex items-center gap-4">
                   <Calendar className="w-5 h-5 text-slate-500" />
                   <div>
                      <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Last Updated</p>
                      <p className="text-slate-200">February 14, 2024</p>
                   </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 flex items-center gap-4">
                   <History className="w-5 h-5 text-slate-500" />
                   <div>
                      <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Active Version</p>
                      <p className="text-slate-200">v31.4 (Professional Edition)</p>
                   </div>
                </div>
             </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-slate-800">
          <CardHeader>
             <CardTitle className="text-lg">System Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <p className="text-sm text-emerald-400">The current ruleset covers 114 cabinet types and 42 safety protocols.</p>
             </div>
             <div className="p-4 rounded-lg bg-sky-500/5 border border-sky-500/20">
                <p className="text-sm text-sky-400">AI compliance accuracy: 98.4% based on the current document.</p>
             </div>
             
             <div className="pt-4 mt-4 border-t border-slate-800">
                <Button variant="outline" className="w-full border-slate-700 text-slate-400 hover:text-red-400 hover:bg-red-500/5">
                   <Trash2 className="w-4 h-4 mr-2" />
                   Remove Current Document
                </Button>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
