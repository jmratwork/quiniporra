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
      <div className="card p-6 text-center text-slate-600">
        <p className="font-medium">No se pudo conectar con la base de datos.</p>
        <p className="mt-1 text-sm text-slate-500">
          Revisa <code className="rounded bg-slate-100 px-1">DATABASE_URL</code> y
          ejecuta las migraciones.
        </p>
      </div>
    );
  }

  if (!vista) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-xl font-bold text-slate-800">Aún no hay jornada activa</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          El organizador todavía no ha iniciado la porra de esta jornada. Vuelve
          más tarde o, si eres el admin, entra en el panel para empezar.
        </p>
        <Link href="/admin" className="btn-primary mt-4">
          Ir al panel de administración
        </Link>
      </div>
    );
  }

  const cerrada = vista.estado === 'CERRADA';

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{vista.jornada}</h1>
            <p className="text-sm text-slate-500">
              {cerrada
                ? 'Porra cerrada — todos los partidos apostados'
                : `${vista.apostados} de ${vista.total} partidos apostados`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`badge ${
                cerrada
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {vista.estado}
            </span>
            {cerrada && <BotonImprimir />}
          </div>
        </div>

        {!cerrada && (
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-quiniela transition-all"
              style={{ width: `${(vista.apostados / vista.total) * 100}%` }}
            />
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Los 15 partidos
        </div>
        {vista.partidos.map((p) => (
          <FilaPartido key={p.numero} partido={p} mostrarSignos={cerrada} />
        ))}
      </section>

      {!cerrada && (
        <p className="text-center text-xs text-slate-400">
          Los pronósticos se revelarán cuando la porra esté completa (los 15
          partidos apostados).
        </p>
      )}
    </div>
  );
}
