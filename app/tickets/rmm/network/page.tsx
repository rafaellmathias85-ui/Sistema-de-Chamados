'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NetworkRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/tickets/rmm/governance/network');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="tm-text-muted text-sm">Redirecionando para Diagnóstico de Rede...</p>
    </div>
  );
}