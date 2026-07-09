'use client';

import { useEffect } from 'react';

export type TipoToast = 'exito' | 'error' | 'info';

export interface MensajeToast {
  tipo: TipoToast;
  texto: string;
}

const estilos: Record<TipoToast, string> = {
  exito: 'ring-cesped-400/40 text-cesped-100',
  error: 'ring-red-400/40 text-red-100',
  info: 'ring-white/20 text-slate-100',
};

const iconos: Record<TipoToast, string> = {
  exito: '✓',
  error: '✕',
  info: 'i',
};

const iconoColor: Record<TipoToast, string> = {
  exito: 'bg-cesped-400/20 text-cesped-300',
  error: 'bg-red-400/20 text-red-300',
  info: 'bg-white/10 text-slate-300',
};

/**
 * Toast accesible que se autodescarta. role=alert para lectores de pantalla.
 */
export function Toast({
  mensaje,
  onClose,
  autoCloseMs = 4000,
}: {
  mensaje: MensajeToast | null;
  onClose: () => void;
  autoCloseMs?: number;
}) {
  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(t);
  }, [mensaje, onClose, autoCloseMs]);

  if (!mensaje) return null;

  return (
    <div
      role="alert"
      className={`fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md animate-rise-in items-center gap-3 rounded-2xl border border-white/10 bg-noche-900/90 px-4 py-3 font-medium shadow-2xl ring-1 backdrop-blur-md sm:inset-x-0 ${estilos[mensaje.tipo]}`}
    >
      <span
        className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-sm font-black ${iconoColor[mensaje.tipo]}`}
        aria-hidden="true"
      >
        {iconos[mensaje.tipo]}
      </span>
      <span>{mensaje.texto}</span>
    </div>
  );
}
