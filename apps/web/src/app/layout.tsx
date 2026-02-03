import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

import { NetworkIndicator } from '@/components/pwa/NetworkIndicator';
import { ServiceWorkerProvider } from '@/components/pwa/ServiceWorkerProvider';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/providers/auth-provider';
import { QueryProvider } from '@/providers/query-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'APCD OEM Empanelment Portal | NPC',
  description:
    'Air Pollution Control Devices OEM Empanelment Portal by National Productivity Council for CPCB',
  keywords: ['APCD', 'OEM', 'Empanelment', 'NPC', 'CPCB', 'Air Pollution Control'],
  manifest: '/manifest.json',
  themeColor: '#1e40af',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'APCD Portal',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ServiceWorkerProvider>
          <QueryProvider>
            <AuthProvider>
              {children}
              <Toaster />
              <NetworkIndicator />
            </AuthProvider>
          </QueryProvider>
        </ServiceWorkerProvider>
      </body>
    </html>
  );
}
