'use client';

import { useCallback, useEffect, useState } from 'react';
import { FormularioManual, type DatosManual } from '@/components/FormularioManual';
import { Toast, type MensajeToast } from '@/components/Toast';
import { BotonImprimir } from '@/components/BotonImprimir';
import { CasillasSignos } from '@/components/CasillasSignos';
import { Escudo } from '@/components/Escudo';
import { Select } from '@/components/Select';
import { SIGNOS_1X2, VALORES_PLENO, type Multiplicidad } from '@/lib/validation';

const CLAVE_PIN = 'quiniporra_pin';

type Mult = Multiplicidad;

interface InvitacionVista {
  id: string;
  nombreJugador: string;
  multiplicidad: Mult;
  estado: 'PENDIENTE' | 'USADA' | 'ANULADA';
  usedAt: string | null;
}

interface PartidoAdmin {
  numero: number;
  local: string;
  visitante: string;
  esPleno: boolean;
  multiplicidad: Mult | null;
  estado: 'PENDIENTE' | 'APOSTADO';
  signos:
    | { tipo: '1X2'; valores: string[] }
    | { tipo: 'PLENO'; local: string[]; visitante: string[] }
    | null;
  nombreJugador: string | null;
  invitaciones: InvitacionVista[];
}

interface QuinielaAdmin {
  jornada: string;
  estado: 'ABIERTA' | 'CERRADA';
  origen: 'AUTOMATICO' | 'MANUAL';
  fechaCierre: string | null;
  apostados: number;
  total: number;
  partidos: PartidoAdmin[];
}

const badgeInv: Record<InvitacionVista['estado'], string> = {
  PENDIENTE: 'bg-oro-400/15 text-oro-300 ring-oro-400/30',
  USADA: 'bg-cesped-400/15 text-cesped-300 ring-cesped-400/30',
  ANULADA: 'bg-white/[0.06] text-slate-500 ring-white/10',
};

export default function AdminPage() {
  const [pin, setPin] = useState('');
  const [autenticado, setAutenticado] = useState(false);
  const [quiniela, setQuiniela] = useState<QuinielaAdmin | null>(null);
  const [cargando, setCargando] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [modoManual, setModoManual] = useState(false);
  const [toast, setToast] = useState<MensajeToast | null>(null);

  const cargar = useCallback(async (pinUsar: string): Promise<boolean> => {
    setCargando(true);
    try {
      const res = await fetch('/api/quiniela', {
        headers: { 'x-admin-pin': pinUsar },
        cache: 'no-store',
      });
      const json = await res.json();
      if (!json.esAdmin) {
        setToast({ tipo: 'error', texto: 'PIN incorrecto.' });
        return false;
      }
      setQuiniela(json.quiniela ?? null);
      if (json.errorBd) {
        setToast({
          tipo: 'error',
          texto:
            'Sesión iniciada, pero la base de datos no responde. Revisa DATABASE_URL y las migraciones.',
        });
      }
      return true;
    } catch {
      setToast({ tipo: 'error', texto: 'No se pudo conectar con el servidor.' });
      return false;
    } finally {
      setCargando(false);
    }
  }, []);

  // Restaura sesión si había PIN guardado.
  useEffect(() => {
    const guardado = sessionStorage.getItem(CLAVE_PIN);
    if (guardado) {
      setPin(guardado);
      cargar(guardado).then((ok) => {
        if (ok) setAutenticado(true);
        else sessionStorage.removeItem(CLAVE_PIN);
      });
    }
  }, [cargar]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    const ok = await cargar(pin);
    if (ok) {
      sessionStorage.setItem(CLAVE_PIN, pin);
      setAutenticado(true);
    }
  }

  function salir() {
    sessionStorage.removeItem(CLAVE_PIN);
    setAutenticado(false);
    setPin('');
    setQuiniela(null);
  }

  async function iniciar(confirmar = false) {
    setIniciando(true);
    setModoManual(false);
    try {
      const res = await fetch('/api/quiniela/iniciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin },
        body: JSON.stringify({ confirmar }),
      });
      const json = await res.json();
      if (res.status === 409) {
        if (
          confirm(
            'Ya existe una Quiniela activa. ¿Reemplazarla? Se borrarán sus partidos, invitaciones y apuestas.',
          )
        ) {
          setIniciando(false);
          return iniciar(true);
        }
        return;
      }
      if (res.status === 502) {
        setToast({
          tipo: 'error',
          texto: 'No se pudo cargar la jornada automáticamente. Usa el formulario manual.',
        });
        setModoManual(true);
        return;
      }
      if (!res.ok) {
        setToast({ tipo: 'error', texto: json.error ?? 'Error al iniciar.' });
        return;
      }
      setToast({ tipo: 'exito', texto: 'Jornada cargada correctamente.' });
      await cargar(pin);
    } finally {
      setIniciando(false);
    }
  }

  async function crearManual(datos: DatosManual, confirmar = false) {
    setIniciando(true);
    try {
      const res = await fetch('/api/quiniela/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin },
        body: JSON.stringify({ ...datos, confirmar }),
      });
      const json = await res.json();
      if (res.status === 409) {
        if (confirm('Ya existe una Quiniela activa. ¿Reemplazarla?')) {
          setIniciando(false);
          return crearManual(datos, true);
        }
        return;
      }
      if (!res.ok) {
        setToast({ tipo: 'error', texto: json.detalle ?? json.error ?? 'Error.' });
        return;
      }
      setToast({ tipo: 'exito', texto: 'Jornada creada manualmente.' });
      setModoManual(false);
      await cargar(pin);
    } finally {
      setIniciando(false);
    }
  }

  async function reiniciar() {
    if (!confirm('¿Borrar la Quiniela activa y todas sus apuestas?')) return;
    const res = await fetch('/api/quiniela', {
      method: 'DELETE',
      headers: { 'x-admin-pin': pin },
    });
    if (res.ok) {
      setQuiniela(null);
      setToast({ tipo: 'info', texto: 'Quiniela reiniciada.' });
    } else {
      setToast({ tipo: 'error', texto: 'No se pudo reiniciar.' });
    }
  }

  // --- Login ---
  if (!autenticado) {
    return (
      <div className="mx-auto max-w-sm animate-rise-in">
        <form onSubmit={login} className="card space-y-5 p-6 sm:p-7">
          <div className="text-center">
            <div className="text-4xl">🔒</div>
            <h1 className="mt-2 text-xl font-black text-white">Panel de administración</h1>
            <p className="mt-1 text-sm text-slate-400">Introduce el PIN para continuar.</p>
          </div>
          <div>
            <label className="label" htmlFor="pin">
              PIN de administración
            </label>
            <input
              id="pin"
              type="password"
              className="input"
              placeholder="••••••••••••"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoFocus
            />
          </div>
          <button type="submit" disabled={cargando} className="btn-primary w-full">
            {cargando ? 'Comprobando…' : 'Entrar'}
          </button>
        </form>
        <Toast mensaje={toast} onClose={() => setToast(null)} />
      </div>
    );
  }

  const cerrada = quiniela?.estado === 'CERRADA';
  const progreso = quiniela ? (quiniela.apostados / quiniela.total) * 100 : 0;

  return (
    <div className="animate-rise-in space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-white">Administración</h1>
        <button
          onClick={salir}
          className="text-sm font-medium text-slate-400 transition hover:text-cesped-300"
        >
          Salir
        </button>
      </div>

      {/* Acciones principales */}
      {!quiniela ? (
        <section className="card space-y-5 p-6">
          <div>
            <h2 className="text-lg font-black text-white">Iniciar la jornada</h2>
            <p className="mt-1 text-sm text-slate-400">
              Carga automáticamente la jornada actual de La Quiniela. Si la fuente falla,
              podrás introducir los 15 partidos a mano.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => iniciar(false)} disabled={iniciando} className="btn-primary">
              {iniciando ? 'Cargando…' : '▶ Iniciar (automático)'}
            </button>
            <button onClick={() => setModoManual((v) => !v)} className="btn-ghost">
              {modoManual ? 'Ocultar formulario manual' : 'Introducir a mano'}
            </button>
          </div>

          {modoManual && (
            <div className="border-t border-white/10 pt-5">
              <FormularioManual onEnviar={(d) => crearManual(d)} enviando={iniciando} />
            </div>
          )}
        </section>
      ) : (
        <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-noche-700 to-noche-950 p-6 shadow-2xl">
          <div className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-cesped-500/20 blur-3xl" />

          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black text-white">{quiniela.jornada}</h2>
                <span
                  className={`badge ${
                    cerrada
                      ? 'bg-oro-400/15 text-oro-300 ring-oro-400/30'
                      : 'bg-cesped-400/15 text-cesped-300 ring-cesped-400/30'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      cerrada ? 'bg-oro-400' : 'animate-pulse-dot bg-cesped-400'
                    }`}
                  />
                  {quiniela.estado}
                </span>
                <span className="badge bg-white/[0.06] text-slate-400 ring-white/10">
                  {quiniela.origen === 'AUTOMATICO' ? 'auto' : 'manual'}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-slate-400">
                <span className="font-bold text-cesped-300">{quiniela.apostados}</span> de{' '}
                {quiniela.total} partidos apostados
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {cerrada && <BotonImprimir />}
              <button onClick={reiniciar} className="btn-danger">
                Reiniciar
              </button>
            </div>
          </div>

          {!cerrada && (
            <div className="relative mt-5 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cesped-500 to-cesped-300 transition-[width] duration-500"
                style={{ width: `${progreso}%` }}
              />
            </div>
          )}
        </header>
      )}

      {/* Tabla de seguimiento */}
      {quiniela && (
        <section className="card overflow-hidden">
          <div className="border-b border-white/10 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">
            Seguimiento de los 15 partidos
          </div>
          <div>
            {quiniela.partidos.map((p) => (
              <PartidoAdminFila
                key={p.numero}
                partido={p}
                pin={pin}
                bloqueado={cerrada}
                onCambio={() => cargar(pin)}
                onToast={setToast}
              />
            ))}
          </div>
        </section>
      )}

      <Toast mensaje={toast} onClose={() => setToast(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fila de partido en el panel de admin (con generación de invitaciones)
// ---------------------------------------------------------------------------

function PartidoAdminFila({
  partido,
  pin,
  bloqueado,
  onCambio,
  onToast,
}: {
  partido: PartidoAdmin;
  pin: string;
  bloqueado: boolean;
  onCambio: () => void;
  onToast: (m: MensajeToast) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [mult, setMult] = useState<Mult>('SIMPLE');
  const [creando, setCreando] = useState(false);
  const [enlace, setEnlace] = useState<string | null>(null);

  async function crearInvitacion() {
    if (!nombre.trim()) {
      onToast({ tipo: 'error', texto: 'Indica el nombre del jugador.' });
      return;
    }
    setCreando(true);
    try {
      const res = await fetch('/api/invitaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin },
        body: JSON.stringify({
          numeroPartido: partido.numero,
          nombreJugador: nombre.trim(),
          multiplicidad: mult,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        onToast({ tipo: 'error', texto: json.error ?? 'No se pudo crear la invitación.' });
        return;
      }
      setEnlace(json.enlace);
      setNombre('');
      onCambio();
    } finally {
      setCreando(false);
    }
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      onToast({ tipo: 'exito', texto: 'Enlace copiado al portapapeles.' });
    } catch {
      onToast({ tipo: 'info', texto });
    }
  }

  const apostado = partido.estado === 'APOSTADO';

  return (
    <div className="border-b border-white/5 px-4 py-3 transition last:border-0 hover:bg-white/[0.02]">
      <div className="flex items-center gap-3">
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
            {partido.esPleno && (
              <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-oro-300">
                Pleno 15
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500">
            {partido.multiplicidad
              ? `Multiplicidad: ${partido.multiplicidad.toLowerCase()}`
              : 'Sin invitación aún'}
          </div>
        </div>

        {apostado ? (
          <div className="flex flex-col items-end gap-1.5">
            {partido.signos &&
              (partido.signos.tipo === '1X2' ? (
                <CasillasSignos
                  opciones={SIGNOS_1X2}
                  seleccion={partido.signos.valores}
                  max={3}
                  readOnly
                  size="sm"
                />
              ) : (
                <div className="flex flex-col gap-1">
                  <CasillasSignos
                    opciones={VALORES_PLENO}
                    seleccion={partido.signos.local}
                    max={3}
                    readOnly
                    size="sm"
                  />
                  <CasillasSignos
                    opciones={VALORES_PLENO}
                    seleccion={partido.signos.visitante}
                    max={3}
                    readOnly
                    size="sm"
                  />
                </div>
              ))}
            <span className="text-[11px] font-medium text-cesped-300">
              {partido.nombreJugador}
            </span>
          </div>
        ) : (
          !bloqueado && (
            <button
              onClick={() => setAbierto((v) => !v)}
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              Invitar
            </button>
          )
        )}
      </div>

      {/* Invitaciones emitidas */}
      {partido.invitaciones.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 sm:pl-[4.75rem]">
          {partido.invitaciones.map((inv) => (
            <span
              key={inv.id}
              className={`badge ${badgeInv[inv.estado]}`}
              title={`${inv.nombreJugador} · ${inv.multiplicidad.toLowerCase()}`}
            >
              {inv.nombreJugador}: {inv.estado.toLowerCase()}
            </span>
          ))}
        </div>
      )}

      {/* Formulario de nueva invitación */}
      {abierto && !apostado && !bloqueado && (
        <div className="mt-3 animate-rise-in space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:ml-[4.75rem]">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
            <input
              className="input sm:flex-1"
              placeholder="Nombre del jugador"
              aria-label="Nombre del jugador"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
            <Select
              value={mult}
              onChange={setMult}
              ariaLabel="Multiplicidad"
              className="sm:w-44"
              opciones={[
                { value: 'SIMPLE', label: 'Simple (1 marca)' },
                { value: 'DOBLE', label: 'Doble (2 marcas)' },
                { value: 'TRIPLE', label: 'Triple (3 marcas)' },
              ]}
            />
            <button onClick={crearInvitacion} disabled={creando} className="btn-primary">
              {creando ? '…' : 'Generar enlace'}
            </button>
          </div>
          {enlace && (
            <div className="flex items-center gap-2 rounded-xl border border-cesped-400/30 bg-cesped-400/[0.08] px-3 py-2">
              <input
                readOnly
                value={enlace}
                aria-label="Enlace de invitación"
                className="flex-1 bg-transparent font-mono text-xs text-cesped-200 outline-none"
              />
              <button onClick={() => copiar(enlace)} className="btn-ghost px-3 py-1.5 text-xs">
                Copiar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
