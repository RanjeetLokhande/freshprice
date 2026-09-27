import type { Metadata, Viewport } from 'next';
import { QueryProvider } from '@/client/query-provider';
import { ServiceWorkerRegister } from '@/components/sw-register';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Fresh Price', template: '%s · Fresh Price' },
  description: 'Daily fruit & vegetable prices and cost calculation',
  applicationName: 'Fresh Price',
  appleWebApp: { capable: true, title: 'Fresh Price', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/apple-180.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2f7d32' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1411' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <QueryProvider>{children}</QueryProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
