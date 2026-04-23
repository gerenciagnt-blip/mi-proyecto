import type { Metadata, Viewport } from 'next';
import { Montserrat, Roboto } from 'next/font/google';
import './globals.css';

// Evita el prerender estático del layout raíz. La app depende de
// sesión (NextAuth) en casi todas las rutas, así que no gana nada
// siendo estática y evita el bug conocido donde el /404 estático
// cae en el fallback de Pages Router e intenta importar <Html>.
export const dynamic = 'force-dynamic';

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const roboto = Roboto({
  subsets: ['latin'],
  variable: '--font-roboto',
  weight: ['300', '400', '500', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Sistema PILA',
  description: 'Tu seguridad social a un click',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#2F80ED',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${montserrat.variable} ${roboto.variable}`}>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
