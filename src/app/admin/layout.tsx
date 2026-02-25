import { AdminSidebar } from '@/components/admin/sidebar';
import { ShieldCheck, User, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logout } from './actions';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-[#020617] overflow-hidden">
      <AdminSidebar />
      
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 border-b border-slate-800 bg-slate-950/50 backdrop-blur-md flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-400">System Status:</span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-500">Live</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800">
              <User className="w-4 h-4 text-sky-500" />
              <span className="text-sm font-medium text-slate-300">Admin</span>
            </div>
            <form action={logout}>
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-red-400 hover:bg-red-500/10">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </form>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-8 bg-[#0f172a]/30">
          {children}
        </main>
      </div>
    </div>
  );
}
