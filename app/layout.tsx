import type { Metadata } from 'next';
import './globals.css';
import Providers from './providers';

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  title: 'Winner Tecnologia | Segurança, Performance e Inovação',
  description: 'A Winner Tecnologia é especializada em Cyber Security, Cloud Computing, Microsoft 365, Azure, AWS, Backup em Nuvem, Antivírus BitDefender e Monitoramento 24/7.',
  keywords: 'cyber security, cloud computing, microsoft 365, azure, aws, backup, antivírus, monitoramento, TI',
  openGraph: {
    title: 'Winner Tecnologia | Segurança, Performance e Inovação',
    description: 'Transformamos desafios tecnológicos em vantagem competitiva para empresas.',
    images: ['/og-image.png'],
    type: 'website',
  },
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <script src="https://apps.abacus.ai/chatllm/appllm-lib.js" />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('appTheme');if(t==='light'){document.documentElement.classList.add('theme-light')}}catch(e){}})()` }} />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
