import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

import { QueryProvider } from '@/providers/query-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'APCD OEM Empanelment Portal | NPC',
  description: 'Air Pollution Control Devices OEM Empanelment Portal by National Productivity Council for CPCB',
  keywords: ['APCD', 'OEM', 'Empanelment', 'NPC', 'CPCB', 'Air Pollution Control'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <QueryProvider>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
