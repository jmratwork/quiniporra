'use client';

import { useCallback, useEffect, useState } from 'react';
import { CasillasSignos } from './CasillasSignos';
import { Toast, type MensajeToast } from './Toast';
import { SIGNOS_1X2, VALORES_PLENO } from '@/lib/validation';

interface DatosInvitacion {
  disponible: true;
  nombreJugador: string;
  multiplicidad: 'SIMPLE' | 'DOBLE' | 'TRIPLE';
  marcasExigidas: number;
  jornada: string;
  partido: {
    numero: number;
    local: string;
    visitante: string;
    esPleno: boolean;
  };
}

type Estado =
  | { fase: 'cargando' }
  | { fase: 'listo'; datos: DatosInvitacion }
  | { fase: 'tarde'; mensaje: string }
  | { fase: 'noexiste'; mensaje: string }
  | { fase: 'hecha' };

export function FormularioApuesta({ token }: { token: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });
  const [valores, setValores] = useState<string[]>([]);
  const [plenoLocal, setPlenoLocal] = useState<string[]>([]);
  const [plenoVisitante, setPlenoVisitante] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<MensajeToast | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/invitaciones/${token}`, { cache: 'no-store' });
      const json = await res.json();
      if (res.ok) {
        setEstado({ fase: 'listo', datos: json });
      } else if (res.status === 409) {
        setEstado({ fase: 'tarde', mensaje: json.error ?? 'Llegas tarde.' });
      } else {
        setEstado({ fase: 'noexiste', mensaje: json.error ?? 'Enlace no válido.' });
      }
    } catch {
      setEstado({ fase: 'noexiste', mensaje: 'No se pudo cargar la invitación.' });
    }
  }, [token]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (estado.fase === 'cargando') {
    return <div className="card p-8 text-center text-slate-500">Cargando invitación…</div>;
  }

  if (estado.fase === 'noexiste') {
    return (
      <div className="card p-8 text-center">
        <div className="text-3xl">🔎</div>
        <h1 className="mt-2 text-lg font-bold text-slate-800">Enlace no válido</h1>
        <p className="mt-1 text-sm text-slate-500">{estado.mensaje}</p>
      </div>
    );
  }

  if (estado.fase === 'tarde') {
    return (
      <div className="card border-red-200 p-8 text-center">
        <div className="text-3xl">⏱️</div>
        <h1 className="mt-2 text-lg font-bold text-red-700">Llegas tarde</h1>
        <p className="mt-1 text-sm text-slate-500">{estado.mensaje}</p>
        <p className="mt-2 text-xs text-slate-400">
          Otro jugador apostó este partido antes. Tu invitación ha quedado anulada.
        </p>
      </div>
    );
  }

  if (estado.fase === 'hecha') {
    return (
      <div className="card border-emerald-200 p-8 text-center">
        <div className="text-3xl">✅</div>
        <h1 className="mt-2 text-lg font-bold text-emerald-700">¡Apuesta registrada!</h1>
        <p className="mt-1 text-sm text-slate-500">
          Gracias por participar. Tu pronóstico ha quedado guardado.
        </p>
      </div>
    );
  }

  const { datos } = estado;
  const { partido, multiplicidad, marcasExigidas } = datos;

  const completo = partido.esPleno
    ? plenoLocal.length === marcasExigidas &&
      plenoVisitante.length === marcasExigidas
    : valores.length === marcasExigidas;

  async function enviar() {
    if (!completo || enviando) return;
    setEnviando(true);
    const signos = partido.esPleno
      ? { tipo: 'PLENO' as const, local: plenoLocal, visitante: plenoVisitante }
      : { tipo: '1X2' as const, valores };
    try {
      const res = await fetch('/api/apuestas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, signos }),
      });
      const json = await res.json();
      if (res.ok) {
        setEstado({ fase: 'hecha' });
      } else if (res.status === 409) {
        setEstado({ fase: 'tarde', mensaje: json.error ?? 'Llegas tarde.' });
      } else {
        setToast({ tipo: 'error', texto: json.error ?? 'No se pudo registrar la apuesta.' });
      }
    } catch {
      setToast({ tipo: 'error', texto: 'Error de red al enviar la apuesta.' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="card p-5">
        <p className="text-xs uppercase tracking-wide text-slate-400">{datos.jornada}</p>
        <h1 className="mt-1 text-lg font-bold text-slate-800">
          Hola, {datos.nombreJugador} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Te toca apostar el partido <strong>nº {partido.numero}</strong>.
        </p>

        <div className="mt-4 rounded-lg bg-slate-50 p-4 text-center">
          <div className="text-base font-semibold text-slate-800">
            {partido.local} <span className="text-slate-400">vs</span> {partido.visitante}
          </div>
          {partido.esPleno && (
            <div className="mt-1 text-xs font-medium text-amber-600">Pleno al 15</div>
          )}
        </div>

        <div className="mt-4 rounded-lg border border-quiniela/30 bg-quiniela-light px-3 py-2 text-sm text-quiniela-dark">
          Multiplicidad <strong>{multiplicidad.toLowerCase()}</strong>: debes marcar
          exactamente <strong>{marcasExigidas}</strong>{' '}
          {partido.esPleno ? 'valor(es) por equipo' : 'signo(s)'}.
        </div>

        <div className="mt-5">
          {partido.esPleno ? (
            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-600">
                  Goles {partido.local}
                </p>
                <CasillasSignos
                  opciones={VALORES_PLENO}
                  seleccion={plenoLocal}
                  max={marcasExigidas}
                  onChange={setPlenoLocal}
                />
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-600">
                  Goles {partido.visitante}
                </p>
                <CasillasSignos
                  opciones={VALORES_PLENO}
                  seleccion={plenoVisitante}
                  max={marcasExigidas}
                  onChange={setPlenoVisitante}
                />
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-600">Tu pronóstico</p>
              <CasillasSignos
                opciones={SIGNOS_1X2}
                seleccion={valores}
                max={marcasExigidas}
                onChange={setValores}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={enviar}
          disabled={!completo || enviando}
          className="btn-primary mt-6 w-full"
        >
          {enviando ? 'Enviando…' : 'Confirmar apuesta'}
        </button>
        {!completo && (
          <p className="mt-2 text-center text-xs text-slate-400">
            Marca exactamente las casillas exigidas para poder confirmar.
          </p>
        )}
      </div>

      <Toast mensaje={toast} onClose={() => setToast(null)} />
    </div>
  );
}
