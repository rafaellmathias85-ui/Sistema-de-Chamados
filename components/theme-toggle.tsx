'use client';

import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem('appTheme') as 'dark' | 'light' | null;
      if (saved === 'light') {
        setTheme('light');
      }
    } catch {}
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('appTheme', next);
    } catch {}
    if (next === 'light') {
      document.documentElement.classList.add('theme-light');
    } else {
      document.documentElement.classList.remove('theme-light');
    }
  };

  if (!mounted) return null;

  return (
    <div className="flex items-center gap-2">
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
        {theme === 'dark' ? '\uD83C\uDF19 Escuro' : '\u2600\uFE0F Claro'}
      </span>
      <button
        onClick={toggle}
        className={`theme-switch ${theme === 'light' ? 'light' : ''}`}
        aria-label="Alternar tema"
      >
        <span className="theme-switch-knob">
          {theme === 'dark' ? '\uD83C\uDF19' : '\u2600\uFE0F'}
        </span>
      </button>
    </div>
  );
}
