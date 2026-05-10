import type { Metadata } from 'next';
import './globals.css';
import Providers from './providers';
import JsonLd from '@/components/seo/json-ld';
import WhatsAppFloat from '@/components/whatsapp-float';

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || 'https://wticorp.com.br';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Winner Tecnologia | Cyber Security, Cloud & TI Gerenciada',
    template: '%s | Winner Tecnologia',
  },
  description:
    'Provedor de TI gerenciada (MSP) especializado em Cyber Security, Cloud Computing, Microsoft 365, Azure, AWS, Backup em Nuvem, Antivírus e Monitoramento 24/7. Solicite um diagnóstico gratuito.',
  keywords: [
    'cyber security',
    'segurança da informação',
    'cloud computing',
    'microsoft 365',
    'azure',
    'aws',
    'backup em nuvem',
    'antivírus corporativo',
    'monitoramento 24/7',
    'ti gerenciada',
    'msp',
    'msp brasil',
    'lgpd',
    'compliance',
    'suporte de ti',
    'helpdesk',
  ],
  authors: [{ name: 'Winner Tecnologia' }],
  creator: 'Winner Tecnologia',
  publisher: 'Winner Tecnologia',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Winner Tecnologia | Cyber Security, Cloud & TI Gerenciada',
    description:
      'MSP especializado em Cyber Security, Cloud, Microsoft 365 e Monitoramento 24/7. Transformamos tecnologia em vantagem competitiva.',
    url: SITE_URL,
    siteName: 'Winner Tecnologia',
    locale: 'pt_BR',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Winner Tecnologia - Cyber Security, Cloud e TI Gerenciada',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Winner Tecnologia | Cyber Security, Cloud & TI Gerenciada',
    description: 'MSP especializado em Cyber Security, Cloud e Monitoramento 24/7.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.png', type: 'image/png' },
    ],
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
  category: 'technology',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <meta name="theme-color" content="#0a1628" />
        <meta name="format-detection" content="telephone=no" />
        <JsonLd />
        <script src="https://apps.abacus.ai/chatllm/appllm-lib.js" async />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('appTheme');if(t==='light'){document.documentElement.classList.add('theme-light')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
        <WhatsAppFloat />
      </body>
    </html>
  );
}
