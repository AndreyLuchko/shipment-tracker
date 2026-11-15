import type { ReactNode } from 'react';

import './globals.css';

export const metadata = {
  title: 'Shipment Tracker',
  description: 'Track every shipment, regardless of carrier.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
