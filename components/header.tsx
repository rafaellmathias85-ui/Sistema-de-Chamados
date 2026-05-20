"use client";

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Monitor, ExternalLink, ChevronDown } from 'lucide-react';
import Image from 'next/image';

type NavLink =
  | { name: string; href: string; type: 'anchor' | 'link' | 'external' }
  | { name: string; type: 'dropdown'; items: { name: string; href: string; type: 'link' | 'external' }[] };

const navLinks: NavLink[] = [
  { name: 'Início', href: '#inicio', type: 'anchor' },
  { name: 'Sobre', href: '#sobre', type: 'anchor' },
  { name: 'Serviços', href: '/servicos', type: 'link' },
  { name: 'Cases', href: '/cases', type: 'link' },
  { name: 'Blog', href: '/blog', type: 'link' },
  {
    name: 'Acessos',
    type: 'dropdown',
    items: [
      { name: 'Acesso Remoto', href: '/acesso-remoto', type: 'link' },
      { name: 'WNR-Audit', href: 'https://wnrtecnologia.com.br/wnraudit', type: 'external' },
    ],
  },
  { name: 'Contato', href: '#contato', type: 'anchor' },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [mobileAccessOpen, setMobileAccessOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAccessOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleNav = (href: string) => {
    setMobileOpen(false);
    setAccessOpen(false);
    setMobileAccessOpen(false);
    if (href.startsWith('http')) {
      if (typeof window !== 'undefined') window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    if (href.startsWith('/')) {
      if (typeof window !== 'undefined') window.location.href = href;
      return;
    }
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
        scrolled ? 'bg-navy/95 backdrop-blur-md shadow-lg shadow-black/20' : 'bg-transparent'
      }`}
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 md:h-20">
          <button onClick={() => handleNav('#inicio')} className="flex items-center gap-2 shrink-0">
            <div className="relative w-[160px] h-[50px] md:w-[200px] md:h-[60px]">
              <Image src="/logo.png" alt="Winner Tecnologia Logo" fill className="object-contain" priority />
            </div>
          </button>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => {
              if (link.type === 'dropdown') {
                return (
                  <div key={link.name} className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setAccessOpen((v) => !v)}
                      className="px-4 py-2 text-sm font-semibold text-accent-blue hover:text-white hover:bg-accent-blue/20 rounded-md transition-all duration-200 flex items-center gap-1.5"
                    >
                      <Monitor size={16} />
                      {link.name}
                      <ChevronDown size={14} className={`transition-transform ${accessOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                      {accessOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className="absolute top-full left-0 mt-2 min-w-[200px] bg-navy-light/98 backdrop-blur-md border border-white/10 rounded-lg shadow-xl py-2"
                        >
                          {link.items.map((item) => (
                            <button
                              key={item.name}
                              onClick={() => handleNav(item.href)}
                              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-accent-blue hover:bg-white/5 transition flex items-center gap-2"
                            >
                              {item.type === 'external' ? <ExternalLink size={14} /> : <Monitor size={14} />}
                              {item.name}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              }
              return (
                <button
                  key={link.href}
                  onClick={() => handleNav(link.href)}
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/10 rounded-md transition-all duration-200"
                >
                  {link.name}
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

          <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden p-2 text-gray-300 hover:text-white">
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
              {navLinks.map((link) => {
                if (link.type === 'dropdown') {
                  return (
                    <div key={link.name}>
                      <button
                        onClick={() => setMobileAccessOpen((v) => !v)}
                        className="w-full text-left px-4 py-3 text-accent-blue font-semibold hover:text-white hover:bg-accent-blue/20 rounded-md transition-all flex items-center justify-between"
                      >
                        <span className="flex items-center gap-2">
                          <Monitor size={18} />
                          {link.name}
                        </span>
                        <ChevronDown size={16} className={`transition-transform ${mobileAccessOpen ? 'rotate-180' : ''}`} />
                      </button>
                      <AnimatePresence>
                        {mobileAccessOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden pl-6"
                          >
                            {link.items.map((item) => (
                              <button
                                key={item.name}
                                onClick={() => handleNav(item.href)}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-accent-blue rounded transition flex items-center gap-2"
                              >
                                {item.type === 'external' ? <ExternalLink size={14} /> : <Monitor size={14} />}
                                {item.name}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                }
                return (
                  <button
                    key={link.href}
                    onClick={() => handleNav(link.href)}
                    className="text-left px-4 py-3 text-gray-300 hover:text-white hover:bg-white/10 rounded-md transition-all"
                  >
                    {link.name}
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
