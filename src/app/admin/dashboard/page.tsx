"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Factory, BookOpen, Database, Quote, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [mRes, sRes, fRes] = await Promise.all([
        supabase.from('manufacturers').select('*', { count: 'exact', head: true }),
        supabase.from('manufacturer_specifications').select('*', { count: 'exact', head: true }),
        supabase.from('manufacturer_files').select('*', { count: 'exact', head: true }),
      ]);

      setStats({
        manufacturers: mRes.count || 0,
        specifications: sRes.count || 0,
        files: fRes.count || 0,
        status: 'Live'
      });
      setLoading(false);
    };

    fetchStats();
  }, []);

  if (loading) return <div className="flex items-center justify-center p-20"><Loader2 className="animate-spin text-sky-500" /></div>;

  const cards = [
    { name: 'Active Manufacturers', value: stats.manufacturers, icon: Factory, color: 'text-sky-600', bg: 'bg-sky-50' },
    { name: 'Specifications Stored', value: stats.specifications.toLocaleString(), icon: Database, color: 'text-purple-600', bg: 'bg-purple-50' },
    { name: 'Technical Documents', value: stats.files, icon: BookOpen, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { name: 'System Status', value: stats.status, icon: Quote, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Overview of the Production AI platform.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((stat) => (
          <Card key={stat.name} className="glass-card border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-slate-500">{stat.name}</CardTitle>
              <div className={`${stat.bg} p-2 rounded-lg`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 glass-card border-slate-200">
          <CardHeader>
            <CardTitle className="text-slate-900">System Activity</CardTitle>
          </CardHeader>
          <CardContent className="h-64 flex flex-col items-center justify-center border-t border-slate-100">
             <Database className="w-12 h-12 text-slate-200 mb-4" />
             <p className="text-slate-400 font-medium">Monitoring specifications extraction pipeline...</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-slate-200">
          <CardHeader>
            <CardTitle className="text-slate-900">Recent Logs</CardTitle>
          </CardHeader>
          <CardContent className="border-t border-slate-100 py-4">
             <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                   <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                   <p className="text-xs text-emerald-700 font-medium">Specs extraction engine active</p>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-sky-50 border border-sky-100">
                   <div className="w-2 h-2 rounded-full bg-sky-500"></div>
                   <p className="text-xs text-sky-700 font-medium">Supabase Storage buckets verified</p>
                </div>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
