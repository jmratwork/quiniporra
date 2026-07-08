import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'quiniporra — Porra de La Quiniela',
  description:
    'Organiza una porra colaborativa alrededor de la jornada actual de La Quiniela española.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-bold text-quiniela">
              <span className="text-xl">🎯</span>
              <span>quiniporra</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="text-slate-600 hover:text-quiniela">
                Inicio
              </Link>
              <Link href="/admin" className="text-slate-600 hover:text-quiniela">
                Admin
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 py-8 text-center text-xs text-slate-400">
          quiniporra · porra colaborativa de La Quiniela · software libre
        </footer>
      </body>
    </html>
  );
}
