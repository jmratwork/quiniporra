import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'quiniporra — Porra de La Quiniela',
  description:
    'Organiza una porra colaborativa alrededor de la jornada actual de La Quiniela española.',
};

export const viewport: Viewport = {
  themeColor: '#04100a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="relative z-10 min-h-screen">
        <header className="border-b border-white/10 bg-noche-950/60 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-lg font-black tracking-tight text-white"
            >
              <span className="text-xl">🎯</span>
              <span>
                quini<span className="text-cesped-400">porra</span>
              </span>
            </Link>
            <nav className="flex items-center gap-5 text-sm font-medium">
              <Link href="/" className="text-slate-400 transition hover:text-cesped-300">
                Inicio
              </Link>
              <Link href="/admin" className="text-slate-400 transition hover:text-cesped-300">
                Admin
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</main>

        <footer className="mx-auto max-w-5xl px-4 py-10 text-center text-xs text-slate-500">
          quiniporra · porra colaborativa de La Quiniela · software libre
        </footer>
      </body>
    </html>
  );
}
