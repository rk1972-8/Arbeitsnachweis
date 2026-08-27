import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PwaRegistration } from './pwa-registration';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0d7154',
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'http://localhost:3000'),
  title: 'Mifrro Arbeitsnachweis',
  description: 'Digitale Arbeitsnachweise für Mifrro Vertriebs GmbH',
  applicationName: 'Mifrro Arbeitsnachweis',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Arbeitsnachweis',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'Mifrro Arbeitsnachweis',
    description: 'Digital. Schnell. Direkt aus dem Einsatz.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mifrro Arbeitsnachweis',
    description: 'Digital. Schnell. Direkt aus dem Einsatz.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <head>
        <meta content="yes" name="apple-mobile-web-app-capable" />
        <meta content="yes" name="mobile-web-app-capable" />
      </head>
      <body><PwaRegistration />{children}</body>
    </html>
  );
}
