import { CasillasSignos } from './CasillasSignos';
import { Escudo } from './Escudo';
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
    <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3 transition last:border-0 hover:bg-white/[0.02]">
      <span
        className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-black tabular-nums ring-1 ${
          partido.esPleno
            ? 'bg-oro-400/15 text-oro-300 ring-oro-400/30'
            : 'bg-white/[0.06] text-slate-300 ring-white/10'
        }`}
      >
        {partido.numero}
      </span>

      <div className="hidden sm:flex sm:items-center sm:gap-1.5">
        <Escudo nombre={partido.local} size={28} />
        <Escudo nombre={partido.visitante} size={28} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-white">
          {partido.local} <span className="font-normal text-slate-500">–</span>{' '}
          {partido.visitante}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {partido.esPleno && (
            <span className="font-bold uppercase tracking-wide text-oro-300">
              Pleno al 15
            </span>
          )}
          {partido.multiplicidad && (
            <span className="text-slate-500">
              Multiplicidad: {partido.multiplicidad.toLowerCase()}
            </span>
          )}
        </div>
      </div>

      {mostrarSignos && apostado && signos ? (
        <div className="flex flex-col items-end gap-1.5">
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
              <div className="flex items-center gap-1.5">
                <span className="w-3 text-[10px] font-bold text-slate-500">L</span>
                <CasillasSignos
                  opciones={VALORES_PLENO}
                  seleccion={signos.local}
                  max={3}
                  readOnly
                  size="sm"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 text-[10px] font-bold text-slate-500">V</span>
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
            <span className="text-[11px] font-medium text-slate-400">
              {partido.nombreJugador}
            </span>
          )}
        </div>
      ) : (
        <span
          className={`badge ${
            apostado
              ? 'bg-cesped-400/15 text-cesped-300 ring-cesped-400/30'
              : 'bg-white/[0.06] text-slate-400 ring-white/10'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              apostado ? 'bg-cesped-400' : 'animate-pulse-dot bg-slate-500'
            }`}
          />
          {apostado ? 'Apostado' : 'Pendiente'}
        </span>
      )}
    </div>
  );
}
