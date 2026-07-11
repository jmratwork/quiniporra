'use client';

import { useCallback, useEffect, useState } from 'react';
import { Toast, type MensajeToast } from '@/components/Toast';
import { BotonImprimir } from '@/components/BotonImprimir';
import { CasillasSignos } from '@/components/CasillasSignos';
import { Escudo } from '@/components/Escudo';
import { Select } from '@/components/Select';
import { SIGNOS_1X2, VALORES_PLENO, type Multiplicidad } from '@/lib/validation';

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
  estado: 'ABIERTA' | 'CERRADA' | 'CADUCADA';
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
  const [code, setCode] = useState('');
  const [pasoLogin, setPasoLogin] = useState<'pin' | 'codigo'>('pin');
  const [totpRequerido, setTotpRequerido] = useState(true);
  const [comprobandoSesion, setComprobandoSesion] = useState(true);
  const [autenticado, setAutenticado] = useState(false);
  const [quiniela, setQuiniela] = useState<QuinielaAdmin | null>(null);
  const [cargando, setCargando] = useState(false);
  const [toast, setToast] = useState<MensajeToast | null>(null);

  // Carga el estado de la quiniela. La autenticación va por cookie de sesión
  // (no se envía el PIN en cada petición). Si la sesión ya no es válida,
  // esAdmin llega como false y volvemos a la pantalla de login.
  const cargar = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/quiniela', { cache: 'no-store' });
      const json = await res.json();
      if (!json.esAdmin) {
        setAutenticado(false);
        return;
      }
      setQuiniela(json.quiniela ?? null);
      if (json.errorBd) {
        setToast({
          tipo: 'error',
          texto:
            'Sesión iniciada, pero la base de datos no responde. Revisa DATABASE_URL y las migraciones.',
        });
      }
    } catch {
      setToast({ tipo: 'error', texto: 'No se pudo conectar con el servidor.' });
    }
  }, []);

  // Al montar: ¿hay ya una sesión válida? ¿se exige el segundo factor?
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/session', { cache: 'no-store' });
        const json = await res.json();
        setTotpRequerido(!!json.totpRequerido);
        if (json.autenticado) {
          setAutenticado(true);
          await cargar();
        }
      } catch {
        /* pantalla de login */
      } finally {
        setComprobandoSesion(false);
      }
    })();
  }, [cargar]);

  function reiniciarLogin() {
    setPin('');
    setCode('');
    setPasoLogin('pin');
  }

  function sesionExpirada() {
    setAutenticado(false);
    setQuiniela(null);
    reiniciarLogin();
    setToast({ tipo: 'error', texto: 'Tu sesión ha caducado. Vuelve a entrar.' });
  }

  /** Envía el login. Paso 1: solo el PIN. Paso 2: PIN + código de verificación. */
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    try {
      const cuerpo = pasoLogin === 'pin' ? { pin } : { pin, code };
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setToast({ tipo: 'error', texto: json.error ?? 'No se pudo iniciar sesión.' });
        if (pasoLogin === 'codigo') setCode('');
        return;
      }

      // PIN correcto pero falta el segundo factor -> pasamos al paso del código.
      if (json.requiereCodigo) {
        setPasoLogin('codigo');
        return;
      }

      // Autenticado (2FA completado, o desactivado en desarrollo).
      reiniciarLogin();
      setAutenticado(true);
      await cargar();
    } catch {
      setToast({ tipo: 'error', texto: 'No se pudo conectar con el servidor.' });
    } finally {
      setCargando(false);
    }
  }

  async function salir() {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
    setAutenticado(false);
    setQuiniela(null);
    reiniciarLogin();
  }


  async function reiniciar() {
    if (!confirm('¿Borrar la Quiniela activa y todas sus apuestas?')) return;
    const res = await fetch('/api/quiniela', { method: 'DELETE' });
    if (res.status === 401) return sesionExpirada();
    if (res.ok) {
      setQuiniela(null);
      setToast({ tipo: 'info', texto: 'Quiniela reiniciada.' });
    } else {
      setToast({ tipo: 'error', texto: 'No se pudo reiniciar.' });
    }
  }

  // --- Comprobando sesión inicial ---
  if (comprobandoSesion) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="animate-pulse text-cesped-300">Comprobando sesión…</p>
      </div>
    );
  }

  // --- Login en dos pasos: 1) PIN, 2) código TOTP (solo si el PIN es correcto) ---
  if (!autenticado) {
    const enPaso1 = pasoLogin === 'pin';
    return (
      <div className="mx-auto max-w-sm animate-rise-in">
        <form onSubmit={login} className="card space-y-5 p-6 sm:p-7">
          <div className="text-center">
            <div className="text-4xl">{enPaso1 ? '🔒' : '🔑'}</div>
            <h1 className="mt-2 text-xl font-black text-white">Panel de administración</h1>
            <p className="mt-1 text-sm text-slate-400">
              {enPaso1
                ? 'Introduce el PIN para continuar.'
                : 'PIN correcto. Ahora el código de tu app de autenticación.'}
            </p>
          </div>

          {enPaso1 ? (
            <div>
              <label className="label" htmlFor="pin">
                PIN de administración
              </label>
              <input
                id="pin"
                type="password"
                autoComplete="current-password"
                className="input"
                placeholder="••••••••••••"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoFocus
              />
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="code">
                Código de verificación
              </label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="input text-center text-2xl font-black tracking-[0.4em] tabular-nums"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Código de 6 dígitos de Google Authenticator, Authy, 1Password…
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={
              cargando ||
              (enPaso1 ? pin.length === 0 : code.length !== 6)
            }
            className="btn-primary w-full"
          >
            {cargando ? 'Comprobando…' : enPaso1 ? 'Continuar' : 'Entrar'}
          </button>

          {!enPaso1 && (
            <button
              type="button"
              onClick={reiniciarLogin}
              className="w-full text-center text-xs font-medium text-slate-400 transition hover:text-cesped-300"
            >
              ← Volver a introducir el PIN
            </button>
          )}
        </form>
        <Toast mensaje={toast} onClose={() => setToast(null)} />
      </div>
    );
  }

  const cerrada = quiniela?.estado === 'CERRADA';
  const caducada = quiniela?.estado === 'CADUCADA';
  const abierta = quiniela?.estado === 'ABIERTA';
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
        <section className="card space-y-3 p-6 text-center">
          <div className="text-4xl">🗓️</div>
          <h2 className="text-lg font-black text-white">Aún no hay jornada activa</h2>
          <p className="mx-auto max-w-md text-sm text-slate-400">
            La jornada de La Quiniela se carga <strong>automáticamente</strong> los
            <strong> lunes</strong> (entresemana) y los <strong>jueves</strong> (fin de
            semana) a las <strong>18:00</strong> (hora de Barcelona). Aparecerá aquí y en
            la página de inicio en cuanto se cargue.
          </p>
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
                      : caducada
                        ? 'bg-red-400/15 text-red-300 ring-red-400/30'
                        : 'bg-cesped-400/15 text-cesped-300 ring-cesped-400/30'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      cerrada
                        ? 'bg-oro-400'
                        : caducada
                          ? 'bg-red-400'
                          : 'animate-pulse-dot bg-cesped-400'
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

          {abierta && (
            <div className="relative mt-5 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cesped-500 to-cesped-300 transition-[width] duration-500"
                style={{ width: `${progreso}%` }}
              />
            </div>
          )}
          {caducada && (
            <p className="relative mt-4 text-sm text-red-300">
              ⏱️ Caducada: el plazo terminó con {quiniela.total - quiniela.apostados}{' '}
              partido(s) sin apostar.
            </p>
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
                bloqueado={cerrada || caducada}
                onCambio={cargar}
                onSesionExpirada={sesionExpirada}
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
  bloqueado,
  onCambio,
  onSesionExpirada,
  onToast,
}: {
  partido: PartidoAdmin;
  bloqueado: boolean;
  onCambio: () => void;
  onSesionExpirada: () => void;
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numeroPartido: partido.numero,
          nombreJugador: nombre.trim(),
          multiplicidad: mult,
        }),
      });
      if (res.status === 401) {
        onSesionExpirada();
        return;
      }
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

  async function anularInvitacion(id: string) {
    if (!confirm('¿Anular esta invitación? El enlace dejará de servir para apostar.')) return;
    const res = await fetch(`/api/admin/invitaciones/${id}`, { method: 'DELETE' });
    if (res.status === 401) {
      onSesionExpirada();
      return;
    }
    if (res.ok) {
      onToast({ tipo: 'info', texto: 'Invitación anulada.' });
      onCambio();
    } else {
      const j = await res.json().catch(() => ({}));
      onToast({ tipo: 'error', texto: j.error ?? 'No se pudo anular la invitación.' });
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
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:pl-[4.75rem]">
          {partido.invitaciones.map((inv) => (
            <span
              key={inv.id}
              className={`badge ${badgeInv[inv.estado]}`}
              title={`${inv.nombreJugador} · ${inv.multiplicidad.toLowerCase()}`}
            >
              {inv.nombreJugador}: {inv.estado.toLowerCase()}
              {inv.estado === 'PENDIENTE' && !bloqueado && (
                <button
                  onClick={() => anularInvitacion(inv.id)}
                  className="ml-1 text-red-300 hover:text-red-200"
                  title="Anular invitación"
                  aria-label={`Anular la invitación de ${inv.nombreJugador}`}
                >
                  ✕
                </button>
              )}
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
