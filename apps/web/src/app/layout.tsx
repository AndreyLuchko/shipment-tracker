import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

import { siteUrl } from '@/lib/site-url';

import './globals.css';

const DESCRIPTION = 'Track every shipment, regardless of carrier.';

export const metadata = {
  title: 'Shipment Tracker',
  description: DESCRIPTION,
  metadataBase: new URL(siteUrl(process.env)),
  openGraph: {
    type: 'website' as const,
    siteName: 'Shipment Tracker',
    title: 'Shipment Tracker',
    description: DESCRIPTION,
  },
  twitter: { card: 'summary_large_image' as const },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-page text-ink antialiased">
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
