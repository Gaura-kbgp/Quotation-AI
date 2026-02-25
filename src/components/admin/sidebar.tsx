"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  Factory, 
  BookOpen, 
  Settings,
  ChevronRight
} from 'lucide-react';

const menuItems = [
  { name: 'Dashboard', icon: LayoutDashboard, href: '/admin/dashboard' },
  { name: 'Manufacturers', icon: Factory, href: '/admin/manufacturers' },
  { name: 'NKBA Rules', icon: BookOpen, href: '/admin/nkba' },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-72 admin-sidebar flex flex-col h-full shrink-0">
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <span className="font-bold text-white text-xl">K</span>
          </div>
          <div>
            <h1 className="font-bold text-slate-100 leading-tight">KABS</h1>
            <p className="text-[10px] text-sky-500 uppercase tracking-[0.2em] font-bold">Quotation AI</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {menuItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200",
                isActive 
                  ? "bg-sky-500/10 text-sky-400 border border-sky-500/20" 
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon className={cn("w-5 h-5", isActive ? "text-sky-400" : "text-slate-500 group-hover:text-slate-300")} />
                <span className="font-medium">{item.name}</span>
              </div>
              {isActive && <ChevronRight className="w-4 h-4 text-sky-500" />}
            </Link>
          );
        })}
      </nav>

      <div className="p-6 border-t border-slate-800/50">
        <Link 
          href="/admin/settings" 
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-all duration-200"
        >
          <Settings className="w-5 h-5 text-slate-500" />
          <span className="font-medium">Settings</span>
        </Link>
      </div>
    </aside>
  );
}
