'use client';

import { useCallback, useEffect, useState } from 'react';
import { FormularioManual, type DatosManual } from '@/components/FormularioManual';
import { Toast, type MensajeToast } from '@/components/Toast';
import { BotonImprimir } from '@/components/BotonImprimir';
import { CasillasSignos } from '@/components/CasillasSignos';
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
  signos: { tipo: '1X2'; valores: string[] } | { tipo: 'PLENO'; local: string[]; visitante: string[] } | null;
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
  PENDIENTE: 'bg-amber-100 text-amber-700',
  USADA: 'bg-emerald-100 text-emerald-700',
  ANULADA: 'bg-slate-200 text-slate-500',
};

export default function AdminPage() {
  const [pin, setPin] = useState('');
  const [autenticado, setAutenticado] = useState(false);
  const [quiniela, setQuiniela] = useState<QuinielaAdmin | null>(null);
  const [cargando, setCargando] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [modoManual, setModoManual] = useState(false);
  const [toast, setToast] = useState<MensajeToast | null>(null);

  const cargar = useCallback(
    async (pinUsar: string): Promise<boolean> => {
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
            texto: 'Sesión iniciada, pero la base de datos no responde. Revisa DATABASE_URL y las migraciones.',
          });
        }
        return true;
      } catch {
        setToast({ tipo: 'error', texto: 'No se pudo conectar con el servidor.' });
        return false;
      } finally {
        setCargando(false);
      }
    },
    [],
  );

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
          texto: `No se pudo cargar la jornada desde SELAE. Usa el formulario manual.`,
        });
        setModoManual(true);
        return;
      }
      if (!res.ok) {
        setToast({ tipo: 'error', texto: json.error ?? 'Error al iniciar.' });
        return;
      }
      setToast({ tipo: 'exito', texto: 'Jornada cargada desde SELAE.' });
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
      <div className="mx-auto max-w-sm">
        <form onSubmit={login} className="card space-y-4 p-6">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Panel de administración</h1>
            <p className="text-sm text-slate-500">Introduce el PIN para continuar.</p>
          </div>
          <input
            type="password"
            className="input"
            placeholder="PIN de administración"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
          />
          <button type="submit" disabled={cargando} className="btn-primary w-full">
            {cargando ? 'Comprobando…' : 'Entrar'}
          </button>
        </form>
        <Toast mensaje={toast} onClose={() => setToast(null)} />
      </div>
    );
  }

  const cerrada = quiniela?.estado === 'CERRADA';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Administración</h1>
        <button onClick={salir} className="text-sm text-slate-500 hover:text-slate-700">
          Salir
        </button>
      </div>

      {/* Acciones principales */}
      <section className="card p-5">
        {!quiniela ? (
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold text-slate-800">Iniciar la jornada</h2>
              <p className="text-sm text-slate-500">
                Carga automáticamente la jornada actual de La Quiniela desde la web
                oficial de SELAE. Si la fuente falla, podrás introducir los 15
                partidos a mano.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => iniciar(false)}
                disabled={iniciando}
                className="btn-primary"
              >
                {iniciando ? 'Cargando…' : '▶ Iniciar (automático desde SELAE)'}
              </button>
              <button
                onClick={() => setModoManual((v) => !v)}
                className="btn-secondary"
              >
                {modoManual ? 'Ocultar formulario manual' : 'Introducir a mano'}
              </button>
            </div>

            {modoManual && (
              <div className="mt-2 border-t border-slate-100 pt-4">
                <FormularioManual onEnviar={(d) => crearManual(d)} enviando={iniciando} />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-slate-800">{quiniela.jornada}</h2>
                <span
                  className={`badge ${
                    cerrada
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {quiniela.estado}
                </span>
                <span className="badge bg-slate-100 text-slate-500">
                  {quiniela.origen === 'AUTOMATICO' ? 'auto' : 'manual'}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                {quiniela.apostados} de {quiniela.total} partidos apostados
              </p>
            </div>
            <div className="flex items-center gap-2">
              {cerrada && <BotonImprimir />}
              <button onClick={reiniciar} className="btn-danger">
                Reiniciar
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Tabla de seguimiento */}
      {quiniela && (
        <section className="card overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Seguimiento de los 15 partidos
          </div>
          <div className="divide-y divide-slate-100">
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
      onToast({ tipo: 'info', texto: texto });
    }
  }

  const apostado = partido.estado === 'APOSTADO';

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            partido.esPleno ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {partido.numero}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-800">
            {partido.local} <span className="text-slate-400">–</span> {partido.visitante}
            {partido.esPleno && (
              <span className="ml-2 text-[11px] font-medium text-amber-600">Pleno 15</span>
            )}
          </div>
          <div className="text-[11px] text-slate-400">
            {partido.multiplicidad
              ? `Multiplicidad: ${partido.multiplicidad.toLowerCase()}`
              : 'Sin invitación aún'}
          </div>
        </div>

        {apostado ? (
          <div className="flex flex-col items-end gap-1">
            {partido.signos && (
              partido.signos.tipo === '1X2' ? (
                <CasillasSignos
                  opciones={SIGNOS_1X2}
                  seleccion={partido.signos.valores}
                  max={3}
                  readOnly
                  size="sm"
                />
              ) : (
                <div className="flex flex-col gap-0.5">
                  <CasillasSignos opciones={VALORES_PLENO} seleccion={partido.signos.local} max={3} readOnly size="sm" />
                  <CasillasSignos opciones={VALORES_PLENO} seleccion={partido.signos.visitante} max={3} readOnly size="sm" />
                </div>
              )
            )}
            <span className="text-[11px] text-emerald-600">
              {partido.nombreJugador}
            </span>
          </div>
        ) : (
          !bloqueado && (
            <button
              onClick={() => setAbierto((v) => !v)}
              className="btn-secondary py-1 text-xs"
            >
              Invitar
            </button>
          )
        )}
      </div>

      {/* Invitaciones emitidas */}
      {partido.invitaciones.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-10">
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
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 pl-10">
          <div className="flex flex-wrap gap-2">
            <input
              className="input flex-1"
              placeholder="Nombre del jugador"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
            <select
              className="input w-auto"
              value={mult}
              onChange={(e) => setMult(e.target.value as Mult)}
            >
              <option value="SIMPLE">Simple (1 marca)</option>
              <option value="DOBLE">Doble (2 marcas)</option>
              <option value="TRIPLE">Triple (3 marcas)</option>
            </select>
            <button onClick={crearInvitacion} disabled={creando} className="btn-primary">
              {creando ? '…' : 'Generar enlace'}
            </button>
          </div>
          {enlace && (
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
              <input readOnly value={enlace} className="flex-1 bg-transparent text-xs text-slate-600 outline-none" />
              <button onClick={() => copiar(enlace)} className="btn-secondary py-1 text-xs">
                Copiar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
