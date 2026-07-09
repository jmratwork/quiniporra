'use client';

import { useState } from 'react';

export interface PartidoManual {
  numero: number;
  local: string;
  visitante: string;
}

export interface DatosManual {
  jornada: string;
  fechaCierre: string | null;
  partidos: PartidoManual[];
}

const FILAS = Array.from({ length: 15 }, (_, i) => i + 1);

/**
 * Formulario de fallback: introducir los 15 partidos a mano cuando la carga
 * automática falla. El partido 15 es el Pleno al 15.
 */
export function FormularioManual({
  onEnviar,
  enviando,
}: {
  onEnviar: (datos: DatosManual) => void;
  enviando: boolean;
}) {
  const [jornada, setJornada] = useState('');
  const [fechaCierre, setFechaCierre] = useState('');
  const [partidos, setPartidos] = useState<PartidoManual[]>(
    FILAS.map((n) => ({ numero: n, local: '', visitante: '' })),
  );
  const [error, setError] = useState<string | null>(null);

  function actualiza(numero: number, campo: 'local' | 'visitante', valor: string) {
    setPartidos((prev) =>
      prev.map((p) => (p.numero === numero ? { ...p, [campo]: valor } : p)),
    );
  }

  function enviar() {
    if (!jornada.trim()) {
      setError('Indica el nombre de la jornada.');
      return;
    }
    if (partidos.some((p) => !p.local.trim() || !p.visitante.trim())) {
      setError('Rellena los dos equipos de los 15 partidos.');
      return;
    }
    setError(null);
    onEnviar({
      jornada: jornada.trim(),
      fechaCierre: fechaCierre ? new Date(fechaCierre).toISOString() : null,
      partidos: partidos.map((p) => ({
        numero: p.numero,
        local: p.local.trim(),
        visitante: p.visitante.trim(),
      })),
    });
  }

  return (
    <div className="animate-rise-in space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="manual-jornada">
            Nombre de la jornada
          </label>
          <input
            id="manual-jornada"
            className="input"
            placeholder="Jornada 34 - 2025/2026"
            value={jornada}
            onChange={(e) => setJornada(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="manual-cierre">
            Fecha de cierre (opcional)
          </label>
          <input
            id="manual-cierre"
            type="datetime-local"
            className="input"
            value={fechaCierre}
            onChange={(e) => setFechaCierre(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        {partidos.map((p) => (
          <div
            key={p.numero}
            className="flex items-center gap-2 border-b border-white/5 px-3 py-2 last:border-0"
          >
            <span
              className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-black tabular-nums ring-1 ${
                p.numero === 15
                  ? 'bg-oro-400/15 text-oro-300 ring-oro-400/30'
                  : 'bg-white/[0.06] text-slate-300 ring-white/10'
              }`}
            >
              {p.numero}
            </span>
            <input
              className="input py-1.5 text-sm"
              placeholder={p.numero === 15 ? 'Local (Pleno al 15)' : 'Local'}
              aria-label={`Equipo local del partido ${p.numero}`}
              value={p.local}
              onChange={(e) => actualiza(p.numero, 'local', e.target.value)}
            />
            <span className="text-xs text-slate-600">–</span>
            <input
              className="input py-1.5 text-sm"
              placeholder="Visitante"
              aria-label={`Equipo visitante del partido ${p.numero}`}
              value={p.visitante}
              onChange={(e) => actualiza(p.numero, 'visitante', e.target.value)}
            />
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-xl border border-red-400/30 bg-red-400/[0.08] px-3 py-2 text-sm font-medium text-red-200">
          {error}
        </p>
      )}

      <button type="button" onClick={enviar} disabled={enviando} className="btn-primary w-full">
        {enviando ? 'Creando…' : 'Crear jornada manualmente'}
      </button>
    </div>
  );
}
