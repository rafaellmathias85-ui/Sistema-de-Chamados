"use client";

import { useState, useEffect } from 'react';
import { Shield, ArrowUp, Monitor } from 'lucide-react';

const footerLinks = [
  { name: 'Início', href: '#inicio' },
  { name: 'Sobre', href: '#sobre' },
  { name: 'Serviços', href: '#servicos' },
  { name: 'Acesso Remoto', href: '/acesso-remoto' },
  { name: 'Contato', href: '#contato' },
];

export default function Footer() {
  const [year, setYear] = useState(2026);
  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  const handleNav = (href: string) => {
    // Rota interna → navegar
    if (href.startsWith('/')) {
      if (typeof window !== 'undefined') window.location.href = href;
      return;
    }
    // Se estiver fora da home, ir para home com o hash
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.location.href = '/' + href;
      return;
    }
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <footer className="bg-navy border-t border-white/5">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Links */}
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {footerLinks?.map((link) => {
              const isAccess = link?.href === '/acesso-remoto';
              return (
                <button
                  key={link?.href}
                  onClick={() => handleNav(link?.href ?? '#')}
                  className={
                    isAccess
                      ? 'font-lato text-sm font-semibold text-accent-blue hover:text-white transition-colors flex items-center gap-1'
                      : 'font-lato text-sm text-gray-400 hover:text-white transition-colors'
                  }
                >
                  {isAccess && <Monitor size={14} />}
                  {link?.name}
                </button>
              );
            })}
          </nav>

          {/* Back to top */}
          <button
            onClick={() => handleNav('#inicio')}
            className="w-10 h-10 bg-accent-blue/10 rounded-full flex items-center justify-center hover:bg-accent-blue/20 transition-colors"
          >
            <ArrowUp size={18} className="text-accent-blue" />
          </button>
        </div>

        <div className="mt-8 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-lato text-sm text-gray-500 text-center">
            © {year} Winner Tecnologia. Todos os direitos reservados.
          </p>
          <p className="font-lato text-xs text-gray-600 flex items-center gap-1">
            <Shield size={12} />
            Segurança, Performance e Inovação
          </p>
        </div>
      </div>
    </footer>
  );
}
