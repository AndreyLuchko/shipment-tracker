import type { ReactNode } from 'react';

export const metadata = {
  title: 'Shipment Tracker',
  description: 'Track every shipment, regardless of carrier.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
