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
 * automática desde SELAE falla. El partido 15 es el Pleno al 15.
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
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Nombre de la jornada
          </label>
          <input
            className="input"
            placeholder="Jornada 34 - 2025/2026"
            value={jornada}
            onChange={(e) => setJornada(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Fecha de cierre (opcional)
          </label>
          <input
            type="datetime-local"
            className="input"
            value={fechaCierre}
            onChange={(e) => setFechaCierre(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        {partidos.map((p) => (
          <div
            key={p.numero}
            className="flex items-center gap-2 border-b border-slate-100 px-2 py-1.5 last:border-0"
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                p.numero === 15
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {p.numero}
            </span>
            <input
              className="input py-1"
              placeholder={p.numero === 15 ? 'Local (Pleno)' : 'Local'}
              value={p.local}
              onChange={(e) => actualiza(p.numero, 'local', e.target.value)}
            />
            <span className="text-xs text-slate-400">–</span>
            <input
              className="input py-1"
              placeholder="Visitante"
              value={p.visitante}
              onChange={(e) => actualiza(p.numero, 'visitante', e.target.value)}
            />
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={enviar}
        disabled={enviando}
        className="btn-primary w-full"
      >
        {enviando ? 'Creando…' : 'Crear jornada manualmente'}
      </button>
    </div>
  );
}
