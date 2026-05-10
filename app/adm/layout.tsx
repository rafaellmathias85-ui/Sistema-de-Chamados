import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import Link from 'next/link';
import { LogOut } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdmLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login?callbackUrl=/adm');
  if (session.user.role !== 'ADMIN') redirect('/login?error=forbidden');

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/adm" className="font-bold text-slate-900">Painel Winner</Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/adm" className="text-slate-600 hover:text-slate-900">Dashboard</Link>
              <Link href="/adm/blog" className="text-slate-600 hover:text-slate-900">Blog</Link>
              <Link href="/adm/cases" className="text-slate-600 hover:text-slate-900">Cases</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">{session.user.email}</span>
            <Link href="/api/auth/signout" className="flex items-center gap-1 text-slate-600 hover:text-red-600">
              <LogOut className="w-4 h-4" /> Sair
            </Link>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
