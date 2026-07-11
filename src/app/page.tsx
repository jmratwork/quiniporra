import Link from 'next/link';
import { getQuinielaActiva, vistaPublica } from '@/lib/quiniela';
import { FilaPartido } from '@/components/FilaPartido';
import { BotonImprimir } from '@/components/BotonImprimir';

// Datos siempre frescos (Next 15: fetch/DB no se cachean por defecto, pero lo
// hacemos explícito para el estado de la quiniela).
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  let vista: ReturnType<typeof vistaPublica> | null = null;
  let errorBd = false;

  try {
    const q = await getQuinielaActiva();
    vista = q ? vistaPublica(q) : null;
  } catch {
    errorBd = true;
  }

  if (errorBd) {
    return (
      <div className="card animate-rise-in p-8 text-center">
        <p className="text-3xl">🔌</p>
        <p className="mt-2 font-bold text-white">
          No se pudo conectar con la base de datos.
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Revisa <code className="rounded bg-white/10 px-1.5 py-0.5 text-cesped-300">DATABASE_URL</code>{' '}
          y ejecuta las migraciones.
        </p>
      </div>
    );
  }

  if (!vista) {
    return (
      <div className="card animate-rise-in p-10 text-center">
        <p className="text-4xl">🎯</p>
        <h1 className="mt-3 text-2xl font-black text-white">Aún no hay jornada activa</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
          El organizador todavía no ha iniciado la porra de esta jornada. Vuelve más
          tarde o, si eres el admin, entra en el panel para empezar.
        </p>
        <Link href="/admin" className="btn-primary mt-6">
          Ir al panel de administración
        </Link>
      </div>
    );
  }

  const cerrada = vista.estado === 'CERRADA';
  const caducada = vista.estado === 'CADUCADA';
  const abierta = vista.estado === 'ABIERTA';
  const progreso = (vista.apostados / vista.total) * 100;

  return (
    <div className="animate-rise-in space-y-6">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-noche-700 to-noche-950 p-6 shadow-2xl sm:p-8">
        <div className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-cesped-500/20 blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              La Quiniela
            </p>
            <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">
              {vista.jornada}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`badge ${
                cerrada
                  ? 'bg-oro-400/15 text-oro-300 ring-oro-400/30'
                  : caducada
                    ? 'bg-red-400/15 text-red-300 ring-red-400/30'
                    : 'bg-cesped-400/15 text-cesped-300 ring-cesped-400/30'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  cerrada ? 'bg-oro-400' : caducada ? 'bg-red-400' : 'animate-pulse-dot bg-cesped-400'
                }`}
              />
              {vista.estado}
            </span>
            {cerrada && <BotonImprimir />}
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="stat-card">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Apostados
            </p>
            <p className="mt-1 text-3xl font-black text-cesped-300">
              {vista.apostados}
              <span className="text-lg text-slate-500">/{vista.total}</span>
            </p>
          </div>
          <div className="stat-card">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Pendientes
            </p>
            <p className="mt-1 text-3xl font-black text-cesped-300">
              {vista.total - vista.apostados}
            </p>
          </div>
        </div>

        {abierta && (
          <div className="relative mt-5">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cesped-500 to-cesped-300 transition-[width] duration-500"
                style={{ width: `${progreso}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {/* Boleto completo */}
      {cerrada && (
        <section className="overflow-hidden rounded-2xl border border-oro-400/30 bg-oro-400/[0.06] p-5 text-center shadow-glow-gold">
          <h2 className="text-lg font-black text-oro-300">🏁 Boleto completo</h2>
          <p className="mt-1 text-sm text-slate-300">
            Los 15 partidos están apostados. Ya puedes descargar el boleto.
          </p>
        </section>
      )}

      {/* Caducada por tiempo */}
      {caducada && (
        <section className="overflow-hidden rounded-2xl border border-red-400/30 bg-red-400/[0.06] p-5 text-center">
          <h2 className="text-lg font-black text-red-300">⏱️ Jornada caducada</h2>
          <p className="mt-1 text-sm text-slate-300">
            El plazo terminó con {vista.total - vista.apostados} partido(s) sin apostar,
            así que la porra no se completó.
          </p>
        </section>
      )}

      {/* Los 15 partidos */}
      <section className="card overflow-hidden">
        <div className="border-b border-white/10 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">
          Los 15 partidos
        </div>
        {vista.partidos.map((p) => (
          <FilaPartido key={p.numero} partido={p} mostrarSignos={cerrada} />
        ))}
      </section>

      {abierta && (
        <p className="text-center text-xs text-slate-500">
          Los pronósticos se revelarán cuando la porra esté completa (los 15 partidos
          apostados).
        </p>
      )}
    </div>
  );
}
