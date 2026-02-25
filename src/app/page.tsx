import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShieldCheck } from 'lucide-react';

export default function Home() {
  return (
    <main className="relative flex flex-col items-center justify-center min-h-screen p-6 text-center overflow-hidden bg-white">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-sky-500/5 blur-[120px] rounded-full"></div>
        <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] bg-blue-600/5 blur-[120px] rounded-full"></div>
      </div>

      {/* Admin Login Button */}
      <div className="absolute top-8 right-8">
        <Link href="/admin/login">
          <Button variant="outline" className="rounded-full border-sky-200 text-sky-600 hover:bg-sky-50 transition-all duration-300">
            <ShieldCheck className="w-4 h-4 mr-2" />
            Admin Login
          </Button>
        </Link>
      </div>

      {/* Hero Section */}
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8 text-slate-900 font-headline">
          KABS <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-500 to-sky-600">Quotation AI</span>
        </h1>
        <p className="text-xl text-slate-500 mb-12 max-w-2xl mx-auto leading-relaxed">
          The next generation of kitchen and bathroom quotation management. Precision driven by intelligence.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
          <Link href="/quotation-ai">
            <Button className="gradient-button h-16 px-10 text-lg w-full sm:w-auto shadow-xl">
              Quotation AI
            </Button>
          </Link>
          <Link href="/design-ai">
            <Button className="h-16 px-10 text-lg w-full sm:w-auto border-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all duration-300 rounded-xl">
              Design AI
            </Button>
          </Link>
        </div>
      </div>

      <footer className="absolute bottom-8 text-slate-400 text-sm">
        &copy; {new Date().getFullYear()} KABS Inc. All rights reserved.
      </footer>
    </main>
  );
}
