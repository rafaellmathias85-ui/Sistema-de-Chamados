"use client";

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const PHONE = '5511943506906';
const MESSAGE = encodeURIComponent(
  'Olá! Vim pelo site da Winner Tecnologia e gostaria de mais informações.'
);

export default function WhatsAppFloat() {
  const pathname = usePathname() || '/';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Não mostrar dentro do app de chamados/login
  const hide =
    pathname.startsWith('/tickets') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/chamado-whatsapp') ||
    pathname.startsWith('/acesso-remoto');

  if (hide) return null;

  return (
    <a
      href={`https://wa.me/${PHONE}?text=${MESSAGE}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      className={`fixed bottom-6 right-6 z-50 transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <span className="flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe57] text-white font-semibold px-4 py-3 rounded-full shadow-2xl shadow-[#25D366]/40 hover:scale-105 transition">
        <svg viewBox="0 0 32 32" className="w-6 h-6 fill-current" aria-hidden="true">
          <path d="M16 .5C7.45.5.5 7.45.5 16c0 2.82.74 5.58 2.14 8L.5 31.5l7.74-2.03A15.45 15.45 0 0 0 16 31.5C24.55 31.5 31.5 24.55 31.5 16S24.55.5 16 .5zm0 28a12.43 12.43 0 0 1-6.34-1.74l-.45-.27-4.59 1.2 1.23-4.47-.3-.46A12.5 12.5 0 1 1 28.5 16c0 6.9-5.6 12.5-12.5 12.5zm6.86-9.36c-.38-.19-2.23-1.1-2.58-1.22-.34-.13-.6-.19-.85.19-.25.38-.97 1.22-1.19 1.47-.22.25-.44.28-.81.09-.38-.19-1.59-.59-3.03-1.87-1.12-1-1.87-2.24-2.09-2.62-.22-.38-.02-.59.16-.78.17-.16.38-.44.56-.66.18-.22.25-.38.38-.63.13-.25.06-.47-.03-.66-.09-.19-.85-2.04-1.16-2.79-.31-.74-.62-.64-.85-.65-.22-.01-.47-.01-.72-.01s-.66.09-1 .47c-.34.38-1.31 1.28-1.31 3.13s1.34 3.63 1.53 3.88c.19.25 2.65 4.05 6.43 5.68.9.39 1.6.62 2.14.79.9.29 1.72.25 2.37.15.72-.11 2.23-.91 2.55-1.79.31-.88.31-1.63.22-1.79-.09-.16-.34-.25-.72-.44z" />
        </svg>
        <span className="hidden sm:inline">Fale conosco</span>
      </span>
    </a>
  );
}
