import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../lib/auth-context';
import { RealtimeProvider } from '../lib/realtime-context';
import { NotificationsProvider } from '../lib/notifications-context';
import { QueryProvider } from '../lib/query-client';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'WorkGrid — Hierarchical Office Task Tracker',
  description: 'Scalable multi-tenant office task tracker for 2,000+ members',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`light ${inter.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
      </head>
      <body className="bg-surface text-on-surface antialiased min-h-screen font-sans">
        <QueryProvider>
          <AuthProvider>
            <RealtimeProvider>
              <NotificationsProvider>{children}</NotificationsProvider>
            </RealtimeProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
