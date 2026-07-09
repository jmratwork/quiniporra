'use client';

import { useCallback, useEffect, useState } from 'react';
import { CasillasSignos } from './CasillasSignos';
import { Escudo } from './Escudo';
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
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="animate-pulse text-cesped-300">Cargando invitación…</p>
      </div>
    );
  }

  if (estado.fase === 'noexiste') {
    return (
      <div className="card mx-auto max-w-lg animate-rise-in p-10 text-center">
        <div className="text-4xl">🔎</div>
        <h1 className="mt-3 text-xl font-black text-white">Enlace no válido</h1>
        <p className="mt-1 text-sm text-slate-400">{estado.mensaje}</p>
      </div>
    );
  }

  if (estado.fase === 'tarde') {
    return (
      <div className="mx-auto max-w-lg animate-rise-in rounded-2xl border border-red-400/30 bg-red-400/[0.06] p-10 text-center shadow-2xl">
        <div className="text-4xl">⏱️</div>
        <h1 className="mt-3 text-xl font-black text-red-300">Llegas tarde</h1>
        <p className="mt-1 text-sm text-slate-300">{estado.mensaje}</p>
        <p className="mt-3 text-xs text-slate-500">
          Otro jugador apostó este partido antes. Tu invitación ha quedado anulada.
        </p>
      </div>
    );
  }

  if (estado.fase === 'hecha') {
    return (
      <div className="mx-auto max-w-lg animate-rise-in rounded-2xl border border-cesped-400/30 bg-cesped-400/[0.08] p-10 text-center shadow-glow">
        <div className="text-4xl">🍀</div>
        <h1 className="mt-3 text-xl font-black text-cesped-200">¡Apuesta registrada!</h1>
        <p className="mt-1 text-sm text-slate-300">
          Gracias por participar. Tu pronóstico ha quedado guardado.
        </p>
      </div>
    );
  }

  const { datos } = estado;
  const { partido, multiplicidad, marcasExigidas } = datos;

  const completo = partido.esPleno
    ? plenoLocal.length === marcasExigidas && plenoVisitante.length === marcasExigidas
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
        setToast({
          tipo: 'error',
          texto: json.error ?? 'No se pudo registrar la apuesta.',
        });
      }
    } catch {
      setToast({ tipo: 'error', texto: 'Error de red al enviar la apuesta.' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg animate-rise-in space-y-5">
      {/* Hero del partido */}
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-noche-700 to-noche-950 p-6 text-center shadow-2xl">
        <div className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-cesped-500/20 blur-3xl" />

        <div className="relative">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {datos.jornada}
          </p>
          <h1 className="mt-1 text-xl font-black text-white">
            Hola, {datos.nombreJugador} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Te toca apostar el partido{' '}
            <span className="font-bold text-cesped-300">nº {partido.numero}</span>
          </p>

          <div className="mt-6 flex items-center justify-center gap-4">
            <div className="flex flex-1 flex-col items-center gap-2">
              <Escudo nombre={partido.local} size={56} />
              <span className="text-sm font-bold text-white">{partido.local}</span>
            </div>
            <span className="text-2xl font-black text-cesped-400">–</span>
            <div className="flex flex-1 flex-col items-center gap-2">
              <Escudo nombre={partido.visitante} size={56} />
              <span className="text-sm font-bold text-white">{partido.visitante}</span>
            </div>
          </div>

          {partido.esPleno && (
            <span className="badge mt-4 bg-oro-400/15 text-oro-300 ring-oro-400/30">
              🏁 Pleno al 15
            </span>
          )}
        </div>
      </header>

      <div className="card p-5 sm:p-6">
        <div className="rounded-xl border border-cesped-400/30 bg-cesped-400/[0.08] px-4 py-3 text-sm text-cesped-100">
          Multiplicidad <strong className="font-black">{multiplicidad.toLowerCase()}</strong>
          : debes marcar exactamente{' '}
          <strong className="font-black">{marcasExigidas}</strong>{' '}
          {partido.esPleno ? 'valor(es) por equipo' : 'signo(s)'}.
        </div>

        <div className="mt-6">
          {partido.esPleno ? (
            <div className="space-y-5">
              <div>
                <span className="label">Goles {partido.local}</span>
                <CasillasSignos
                  opciones={VALORES_PLENO}
                  seleccion={plenoLocal}
                  max={marcasExigidas}
                  onChange={setPlenoLocal}
                />
              </div>
              <div>
                <span className="label">Goles {partido.visitante}</span>
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
              <span className="label">Tu pronóstico</span>
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
          className="btn-primary mt-7 w-full"
        >
          {enviando ? 'Enviando…' : 'Confirmar apuesta'}
        </button>
        {!completo && (
          <p className="mt-2 text-center text-xs text-slate-500">
            Marca exactamente las casillas exigidas para poder confirmar.
          </p>
        )}
      </div>

      <Toast mensaje={toast} onClose={() => setToast(null)} />
    </div>
  );
}
