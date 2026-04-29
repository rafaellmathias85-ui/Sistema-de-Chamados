"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Shield, Monitor, ExternalLink } from 'lucide-react';
import Image from 'next/image';

const navLinks = [
  { name: 'Início', href: '#inicio', type: 'anchor' as const },
  { name: 'Sobre', href: '#sobre', type: 'anchor' as const },
  { name: 'Serviços', href: '#servicos', type: 'anchor' as const },
  { name: 'Diferenciais', href: '#diferenciais', type: 'anchor' as const },
  { name: 'Acesso Remoto', href: '/acesso-remoto', type: 'link' as const },
  { name: 'WNR-Audit', href: 'https://wnrtecnologia.com.br/wnr-audit', type: 'external' as const },
  { name: 'Contato', href: '#contato', type: 'anchor' as const },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleNav = (href: string) => {
    setMobileOpen(false);
    // Se for link externo, abrir em nova aba
    if (href.startsWith('http')) {
      if (typeof window !== 'undefined') window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    // Se for rota interna, navega ate a pagina
    if (href.startsWith('/')) {
      if (typeof window !== 'undefined') window.location.href = href;
      return;
    }
    // Caso contrario rolar ate a seccao na home
    // Se estivermos fora da home, redirecionar com o hash
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.location.href = '/' + href;
      return;
    }
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-navy/95 backdrop-blur-md shadow-lg shadow-black/20'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <button onClick={() => handleNav('#inicio')} className="flex items-center gap-2 shrink-0">
            <div className="relative w-[160px] h-[50px] md:w-[200px] md:h-[60px]">
              <Image
                src="/logo.png"
                alt="Winner Tecnologia Logo"
                fill
                className="object-contain"
                priority
              />
            </div>
          </button>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks?.map((link) => {
              const isAccess = link?.href === '/acesso-remoto';
              const isExternal = link?.type === 'external';
              return (
                <button
                  key={link?.href}
                  onClick={() => handleNav(link?.href ?? '#')}
                  className={
                    isAccess || isExternal
                      ? 'px-4 py-2 text-sm font-semibold text-accent-blue hover:text-white hover:bg-accent-blue/20 rounded-md transition-all duration-200 flex items-center gap-1.5'
                      : 'px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/10 rounded-md transition-all duration-200'
                  }
                >
                  {isAccess && <Monitor size={16} />}
                  {isExternal && <ExternalLink size={16} />}
                  {link?.name}
                </button>
              );
            })}
            <a
              href="/login"
              className="ml-3 px-5 py-2.5 bg-accent-blue/20 border border-accent-blue/50 text-accent-blue text-sm font-semibold rounded-md hover:bg-accent-blue hover:text-white transition-all duration-200"
            >
              Área Restrita
            </a>
            <button
              onClick={() => handleNav('#contato')}
              className="ml-2 px-5 py-2.5 bg-accent-orange text-white text-sm font-semibold rounded-md hover:bg-orange-600 transition-all duration-200 shadow-lg shadow-orange-500/25"
            >
              Fale Conosco
            </button>
          </nav>

          {/* Mobile Toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden p-2 text-gray-300 hover:text-white"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-navy-light/98 backdrop-blur-md border-t border-white/10"
          >
            <div className="max-w-[1200px] mx-auto px-4 py-4 flex flex-col gap-1">
              {navLinks?.map((link) => {
                const isAccess = link?.href === '/acesso-remoto';
                const isExternal = link?.type === 'external';
                return (
                  <button
                    key={link?.href}
                    onClick={() => handleNav(link?.href ?? '#')}
                    className={
                      isAccess || isExternal
                        ? 'text-left px-4 py-3 text-accent-blue font-semibold hover:text-white hover:bg-accent-blue/20 rounded-md transition-all flex items-center gap-2'
                        : 'text-left px-4 py-3 text-gray-300 hover:text-white hover:bg-white/10 rounded-md transition-all'
                    }
                  >
                    {isAccess && <Monitor size={18} />}
                    {isExternal && <ExternalLink size={18} />}
                    {link?.name}
                  </button>
                );
              })}
              <a
                href="/login"
                className="mt-2 px-5 py-3 bg-accent-blue/20 border border-accent-blue/50 text-accent-blue font-semibold rounded-md hover:bg-accent-blue hover:text-white transition-all text-center"
              >
                Área Restrita
              </a>
              <button
                onClick={() => handleNav('#contato')}
                className="mt-2 px-5 py-3 bg-accent-orange text-white font-semibold rounded-md hover:bg-orange-600 transition-all"
              >
                Fale Conosco
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
