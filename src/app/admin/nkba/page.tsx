import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Upload, Trash2, Calendar, FileText, History } from 'lucide-react';

export default function NkbaRulesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">NKBA Rules Management</h1>
        <p className="text-slate-500 mt-1">Upload and manage National Kitchen & Bath Association standards.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 glass-card border-slate-200">
          <CardHeader>
             <CardTitle className="flex items-center gap-2 text-slate-900">
                <FileText className="w-5 h-5 text-sky-600" />
                Current Rules Document
             </CardTitle>
             <CardDescription className="text-slate-500">This document serves as the foundation for the AI's compliance checking.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
             <div className="p-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-sky-50 rounded-full flex items-center justify-center mb-6">
                   <Upload className="w-8 h-8 text-sky-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-slate-900">Upload NKBA Standards</h3>
                <p className="text-slate-500 mb-6 max-w-xs mx-auto">Upload the latest official NKBA PDF. This will replace the existing file used by the engine.</p>
                <Button className="gradient-button h-11 px-8">Select PDF Document</Button>
             </div>

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-center gap-4">
                   <Calendar className="w-5 h-5 text-slate-400" />
                   <div>
                      <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Last Updated</p>
                      <p className="text-slate-700">February 14, 2024</p>
                   </div>
                </div>
                <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-center gap-4">
                   <History className="w-5 h-5 text-slate-400" />
                   <div>
                      <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Active Version</p>
                      <p className="text-slate-700">v31.4 (Professional Edition)</p>
                   </div>
                </div>
             </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-slate-200">
          <CardHeader>
             <CardTitle className="text-lg text-slate-900">System Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-100">
                <p className="text-sm text-emerald-700">The current ruleset covers 114 cabinet types and 42 safety protocols.</p>
             </div>
             <div className="p-4 rounded-lg bg-sky-50 border border-sky-100">
                <p className="text-sm text-sky-700">AI compliance accuracy: 98.4% based on the current document.</p>
             </div>
             
             <div className="pt-4 mt-4 border-t border-slate-100">
                <Button variant="outline" className="w-full border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50">
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
