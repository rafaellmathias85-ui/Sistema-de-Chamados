'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard,
  Ticket,
  Columns3,
  BookOpen,
  BarChart3,
  DollarSign,
  CalendarDays,
  Monitor,
  HardDrive,
  Activity,
  Building2,
  Shield,
  Settings,
  MessageCircle,
  LogOut,
  Pin,
  PinOff,
  Menu,
  X,
  Sparkles,
  HeartPulse,
  Archive,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  section: 'principal' | 'sistema';
}

interface SidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string;
  };
}

const COLLAPSED_W = 64;
const EXPANDED_W = 220;

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  const [expanded, setExpanded] = useState(false);
  const [fixed, setFixed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem('sidebarFixed') === 'true') {
        setFixed(true);
        setExpanded(true);
      }
    } catch {}
  }, []);

  const togglePin = useCallback(() => {
    setFixed((prev) => {
      const next = !prev;
      try { localStorage.setItem('sidebarFixed', String(next)); } catch {}
      if (!next) setExpanded(false);
      return next;
    });
  }, []);

  const onEnter = useCallback(() => { if (!fixed) setExpanded(true); }, [fixed]);
  const onLeave = useCallback(() => { if (!fixed) setExpanded(false); }, [fixed]);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const isAdmin = user.role === 'ADMIN';
  const isSupport = user.role === 'SUPPORT';
  const isFinance = user.role === 'FINANCE';
  const isClient = user.role === 'CLIENT';
  const isSpecial = user.role === 'SPECIAL';
  const isStaff = isAdmin || isSupport || isFinance;

  // Parse allowed menus para perfil SPECIAL
  let specialMenus: string[] = [];
  if (isSpecial && (user as any).allowedMenus) {
    try { specialMenus = JSON.parse((user as any).allowedMenus); } catch {}
  }
  const hasMenu = (key: string) => isSpecial ? specialMenus.includes(key) : true;

  // Mapa de chaves de menu para filtragem SPECIAL
  // Keys: dashboard, tickets, workspace, kb, rmm, inventory, ai-chat, finance, reports, agenda, telemetry, security, admin
  const allNavItems: (NavItem & { menuKey: string })[] = [
    { menuKey: 'dashboard', name: 'Dashboard', href: '/tickets/dashboard', icon: LayoutDashboard, section: 'principal' },
    { menuKey: 'tickets', name: 'Chamados', href: '/tickets/list', icon: Ticket, section: 'principal' },
    { menuKey: 'workspace', name: 'Workspace', href: '/tickets/workspace', icon: Columns3, section: 'principal' },
    { menuKey: 'kb', name: 'Base de Conhecimento', href: '/tickets/kb', icon: BookOpen, section: 'principal' },
    { menuKey: 'rmm', name: 'RMM', href: '/tickets/rmm', icon: Monitor, section: 'principal' },
    { menuKey: 'inventory', name: 'Inventário', href: '/tickets/inventory', icon: HardDrive, section: 'principal' },
    { menuKey: 'ai-chat', name: 'Assistente IA', href: '/tickets/ai-chat', icon: Sparkles, section: 'principal' },
    { menuKey: 'finance', name: 'Financeiro', href: '/tickets/finance', icon: DollarSign, section: 'sistema' },
    { menuKey: 'reports', name: 'Relatórios', href: '/tickets/reports', icon: BarChart3, section: 'sistema' },
    { menuKey: 'agenda', name: 'Agenda', href: '/tickets/agenda', icon: CalendarDays, section: 'sistema' },
    { menuKey: 'telemetry', name: 'Telemetria', href: '/tickets/telemetry', icon: Activity, section: 'sistema' },
    { menuKey: 'security', name: 'Segurança', href: '/tickets/security', icon: Shield, section: 'sistema' },
    { menuKey: 'admin', name: 'Administração', href: '/tickets/admin', icon: Settings, section: 'sistema' },
    { menuKey: 'admin-email', name: 'Config. Email', href: '/tickets/admin/settings', icon: MessageCircle, section: 'sistema' },
    { menuKey: 'admin-company', name: 'Config. Empresa', href: '/tickets/admin/company', icon: Building2, section: 'sistema' },
    { menuKey: 'archive', name: 'Arquivo de Chamados', href: '/tickets/archive', icon: Archive, section: 'sistema' },
    { menuKey: 'admin-whatsapp', name: 'WhatsApp', href: '/tickets/admin/whatsapp', icon: MessageCircle, section: 'sistema' },
    { menuKey: 'monitoring', name: 'Monitoramento', href: '/tickets/monitoring', icon: HeartPulse, section: 'sistema' },
  ];

  // Filtrar com base no role
  const navigation: NavItem[] = isSpecial
    ? allNavItems.filter(n => hasMenu(n.menuKey)).map(({ menuKey, ...rest }) => rest)
    : [
        allNavItems[0],  // Dashboard - sempre
        allNavItems[1],  // Chamados - sempre
        ...((isAdmin || isSupport) ? [allNavItems[2]] : []),  // Workspace
        ...(!isClient ? [allNavItems[3]] : []),  // KB
        ...((isAdmin || isSupport) ? [allNavItems[4]] : []),  // RMM
        ...(isClient ? [allNavItems[5]] : []),  // Inventário
        allNavItems[6],  // AI Chat - sempre
        ...((isAdmin || isFinance) ? [allNavItems[7]] : []),  // Financeiro (oculto para SUPPORT)
        ...(isStaff ? [allNavItems[8]] : []),  // Relatórios
        ...((isAdmin || isSupport || isFinance) ? [allNavItems[9]] : []),  // Agenda
        ...(isAdmin ? [allNavItems[10]] : []),  // Telemetria
        allNavItems[11],  // Segurança - sempre
        ...(isAdmin ? [allNavItems[12], allNavItems[13], allNavItems[14]] : []),
        ...((isAdmin || isSupport) ? [allNavItems[15]] : []),  // Arquivo de Chamados (ADMIN + SUPPORT)
        ...(isAdmin ? [allNavItems[16]] : []),
        ...(isAdmin ? [allNavItems[17]] : []),  // Monitoramento (oculto para SUPPORT)
      ].map(({ menuKey, ...rest }: any) => rest as NavItem);

  const principal = navigation.filter((n) => n.section === 'principal');
  const sistema = navigation.filter((n) => n.section === 'sistema');

  const isActive = (href: string) => {
    const p = pathname || '';
    if (href === '/tickets/dashboard') return p === '/tickets/dashboard' || p === '/tickets';
    if (href === '/tickets/admin/settings') return p === '/tickets/admin/settings';
    if (href === '/tickets/admin/company') return p === '/tickets/admin/company';
    if (href === '/tickets/admin') return p === '/tickets/admin';
    if (href === '/tickets/archive') return p === '/tickets/archive' || p.startsWith('/tickets/archive/');
    return p === href || p.startsWith(href + '/');
  };

  const roleLabel = isAdmin ? 'Administrador' : isSupport ? 'Suporte' : isFinance ? 'Financeiro' : 'Cliente';
  const initials = user.name ? user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '?';
  const show = expanded || fixed;
  const w = mounted ? (show ? EXPANDED_W : COLLAPSED_W) : COLLAPSED_W;

  const NavItem = ({ item, mob }: { item: NavItem; mob?: boolean }) => {
    const act = isActive(item.href);
    const vis = show || mob;
    return (
      <Link
        href={item.href}
        className="group relative flex items-center gap-3 rounded-lg"
        style={{
          padding: vis ? '8px 12px' : '8px 0',
          justifyContent: vis ? 'flex-start' : 'center',
          background: act ? 'rgba(59,130,246,0.18)' : 'transparent',
          color: act ? '#60a5fa' : 'rgba(255,255,255,0.6)',
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => { if (!act) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
        onMouseLeave={(e) => { if (!act) e.currentTarget.style.background = 'transparent'; }}
      >
        <item.icon size={20} style={{ flexShrink: 0 }} />
        <span style={{ opacity: vis ? 1 : 0, transition: 'opacity 0.18s ease', whiteSpace: 'nowrap', overflow: 'hidden', fontSize: 13, fontWeight: 500 }}>
          {item.name}
        </span>
        {!vis && (
          <span
            className="pointer-events-none absolute opacity-0 group-hover:opacity-100"
            style={{
              left: 60, top: '50%', transform: 'translateY(-50%)',
              background: '#1e293b', color: '#e2e8f0', padding: '4px 10px',
              borderRadius: 6, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
              border: '1px solid rgba(255,255,255,0.1)', zIndex: 100,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)', transition: 'opacity 0.15s',
            }}
          >
            {item.name}
          </span>
        )}
      </Link>
    );
  };

  const SectionLabel = ({ label, mob }: { label: string; mob?: boolean }) => (
    <div style={{
      opacity: (show || mob) ? 0.5 : 0, transition: 'opacity 0.18s ease',
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
      color: 'rgba(255,255,255,0.4)', padding: (show || mob) ? '12px 12px 4px' : '12px 0 4px',
      textAlign: (show || mob) ? 'left' : 'center',
    }}>
      {label}
    </div>
  );

  const content = (mob = false) => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center border-b" style={{
        borderColor: 'rgba(255,255,255,0.08)', minHeight: 56,
        padding: (show || mob) ? '14px' : '14px 0', justifyContent: (show || mob) ? 'space-between' : 'center',
      }}>
        <Link href="/tickets" className="flex items-center gap-2" style={{ overflow: 'hidden' }}>
          <div className="relative" style={{ width: 28, height: 28, flexShrink: 0 }}>
            <Image src="/favicon.png" alt="Winner" fill className="object-contain" />
          </div>
          <span style={{
            opacity: (show || mob) ? 1 : 0, transition: 'opacity 0.18s ease',
            fontWeight: 700, color: '#fff', fontSize: 14, whiteSpace: 'nowrap',
            fontFamily: 'Montserrat, sans-serif',
          }}>
            Winner
          </span>
        </Link>
        {!mob && show && (
          <button onClick={togglePin} title={fixed ? 'Desfixar sidebar' : 'Fixar sidebar aberta'}
            style={{
              color: fixed ? '#3b82f6' : 'rgba(255,255,255,0.4)', padding: 4, borderRadius: 6,
              background: fixed ? 'rgba(59,130,246,0.12)' : 'transparent', transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { if (!fixed) e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
            onMouseLeave={(e) => { if (!fixed) e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
          >
            {fixed ? <PinOff size={16} /> : <Pin size={16} />}
          </button>
        )}
        {mob && (
          <button onClick={() => setMobileOpen(false)} style={{ color: 'rgba(255,255,255,0.5)' }}>
            <X size={20} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden" style={{ padding: '8px' }}>
        <SectionLabel label="Principal" mob={mob} />
        {principal.map((item) => <NavItem key={item.name} item={item} mob={mob} />)}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />
        <SectionLabel label="Sistema" mob={mob} />
        {sistema.map((item) => <NavItem key={item.name} item={item} mob={mob} />)}
      </nav>

      {/* Footer */}
      <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.08)', padding: (show || mob) ? 12 : '12px 0' }}>
        <div className="flex items-center gap-3" style={{ justifyContent: (show || mob) ? 'flex-start' : 'center' }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #3b82f6, #f97316)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 13,
          }}>
            {initials}
          </div>
          <div style={{ opacity: (show || mob) ? 1 : 0, transition: 'opacity 0.18s ease', overflow: 'hidden', whiteSpace: 'nowrap', minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', margin: 0 }}>{user.name}</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{roleLabel}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="group relative flex items-center gap-2 w-full rounded-lg"
          style={{
            marginTop: 8, padding: (show || mob) ? '6px 12px' : '6px 0',
            justifyContent: (show || mob) ? 'flex-start' : 'center',
            color: 'rgba(255,255,255,0.4)', fontSize: 13, transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
        >
          <LogOut size={18} style={{ flexShrink: 0 }} />
          <span style={{ opacity: (show || mob) ? 1 : 0, transition: 'opacity 0.18s ease', whiteSpace: 'nowrap' }}>Sair</span>
          {!(show || mob) && (
            <span className="pointer-events-none absolute opacity-0 group-hover:opacity-100"
              style={{
                left: 60, top: '50%', transform: 'translateY(-50%)',
                background: '#1e293b', color: '#e2e8f0', padding: '4px 10px',
                borderRadius: 6, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
                border: '1px solid rgba(255,255,255,0.1)', zIndex: 100,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)', transition: 'opacity 0.15s',
              }}
            >
              Sair
            </span>
          )}
        </button>
      </div>
    </div>
  );

  const handleSignOut = async () => { await signOut({ callbackUrl: '/login' }); };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        className="hidden md:flex flex-col flex-shrink-0"
        style={{
          width: w, minWidth: w,
          transition: 'width 0.28s ease, min-width 0.28s ease',
          background: '#1a1f2e', borderRight: '1px solid rgba(255,255,255,0.08)',
          height: '100vh', position: 'sticky', top: 0, zIndex: 40, overflow: 'visible',
        }}
      >
        {content(false)}
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && <div className="md:hidden fixed inset-0 bg-black/60 z-50" onClick={() => setMobileOpen(false)} />}

      {/* Mobile drawer */}
      <aside
        className="md:hidden fixed top-0 left-0 z-50 h-full"
        style={{
          width: EXPANDED_W, background: '#1a1f2e',
          transform: mobileOpen ? 'translateX(0)' : `translateX(-${EXPANDED_W}px)`,
          transition: 'transform 0.28s ease',
          borderRight: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {content(true)}
      </aside>

      {/* Mobile hamburger - absolutely positioned, only visible when sidebar closed on mobile */}
      {!mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          className="md:hidden fixed top-3 left-3 z-40 text-gray-400 hover:text-white p-2 rounded-lg"
          style={{ background: 'rgba(26,31,46,0.9)' }}
          aria-label="Abrir menu"
        >
          <Menu size={22} />
        </button>
      )}
    </>
  );
}
