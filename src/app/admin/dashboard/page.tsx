import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Factory, BookOpen, Users, Quote } from 'lucide-react';

const stats = [
  { name: 'Active Manufacturers', value: '12', icon: Factory, color: 'text-sky-600', bg: 'bg-sky-50' },
  { name: 'Quotations Generated', value: '1,284', icon: Quote, color: 'text-purple-600', bg: 'bg-purple-50' },
  { name: 'NKBA Rules Version', value: 'v2024.1', icon: BookOpen, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { name: 'Platform Users', value: '45', icon: Users, color: 'text-amber-600', bg: 'bg-amber-50' },
];

export default function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Overview of the KABS Quotation AI platform.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
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
          <CardContent className="h-64 flex items-center justify-center border-t border-slate-100">
            <span className="text-slate-400">Activity chart placeholder</span>
          </CardContent>
        </Card>
        <Card className="glass-card border-slate-200">
          <CardHeader>
            <CardTitle className="text-slate-900">Pending Actions</CardTitle>
          </CardHeader>
          <CardContent className="border-t border-slate-100">
             <div className="space-y-4 py-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                   <div className="w-2 h-2 rounded-full bg-sky-500"></div>
                   <p className="text-sm text-slate-600">New pricing sheet uploaded</p>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                   <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                   <p className="text-sm text-slate-600">NKBA Rules updated successfully</p>
                </div>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
