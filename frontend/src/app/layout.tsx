import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hierarchical Office Task Tracker',
  description: 'Scalable multi-tenant office task tracker for 2,000+ members',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-slate-950 text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
