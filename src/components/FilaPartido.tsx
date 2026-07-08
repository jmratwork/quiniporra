import { CasillasSignos } from './CasillasSignos';
import { SIGNOS_1X2, VALORES_PLENO } from '@/lib/validation';
import type { Signos } from '@/lib/validation';

/**
 * Fila/tarjeta que muestra un partido y, si procede, la apuesta realizada.
 * Se usa en la home pública y en el panel de admin.
 */
export interface PartidoVista {
  numero: number;
  local: string;
  visitante: string;
  esPleno: boolean;
  estado: 'PENDIENTE' | 'APOSTADO';
  signos?: Signos | null;
  nombreJugador?: string | null;
  multiplicidad?: 'SIMPLE' | 'DOBLE' | 'TRIPLE' | null;
}

export function FilaPartido({
  partido,
  mostrarSignos,
}: {
  partido: PartidoVista;
  mostrarSignos: boolean;
}) {
  const apostado = partido.estado === 'APOSTADO';
  const signos = partido.signos ?? null;

  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-0">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          partido.esPleno
            ? 'bg-amber-100 text-amber-700'
            : 'bg-slate-100 text-slate-600'
        }`}
      >
        {partido.numero}
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-800">
          {partido.local} <span className="text-slate-400">–</span> {partido.visitante}
        </div>
        {partido.esPleno && (
          <div className="text-[11px] font-medium text-amber-600">Pleno al 15</div>
        )}
        {partido.multiplicidad && (
          <div className="text-[11px] text-slate-400">
            Multiplicidad: {partido.multiplicidad.toLowerCase()}
          </div>
        )}
      </div>

      {mostrarSignos && apostado && signos ? (
        <div className="flex flex-col items-end gap-1">
          {signos.tipo === '1X2' ? (
            <CasillasSignos
              opciones={SIGNOS_1X2}
              seleccion={signos.valores}
              max={3}
              readOnly
              size="sm"
            />
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <span className="w-3 text-[10px] text-slate-400">L</span>
                <CasillasSignos
                  opciones={VALORES_PLENO}
                  seleccion={signos.local}
                  max={3}
                  readOnly
                  size="sm"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 text-[10px] text-slate-400">V</span>
                <CasillasSignos
                  opciones={VALORES_PLENO}
                  seleccion={signos.visitante}
                  max={3}
                  readOnly
                  size="sm"
                />
              </div>
            </div>
          )}
          {partido.nombreJugador && (
            <span className="text-[11px] text-slate-500">{partido.nombreJugador}</span>
          )}
        </div>
      ) : (
        <span
          className={`badge ${
            apostado
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          {apostado ? 'Apostado' : 'Pendiente'}
        </span>
      )}
    </div>
  );
}
