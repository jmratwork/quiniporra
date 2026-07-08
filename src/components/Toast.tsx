'use client';

import { useEffect } from 'react';

export type TipoToast = 'exito' | 'error' | 'info';

export interface MensajeToast {
  tipo: TipoToast;
  texto: string;
}

const estilos: Record<TipoToast, string> = {
  exito: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-slate-800 text-white',
};

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
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div
        role="status"
        className={`max-w-md rounded-lg px-4 py-3 text-sm shadow-lg ${estilos[mensaje.tipo]}`}
      >
        {mensaje.texto}
      </div>
    </div>
  );
}
