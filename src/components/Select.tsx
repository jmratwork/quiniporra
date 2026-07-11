'use client';

import { useEffect, useId, useRef, useState } from 'react';

export interface OpcionSelect<T extends string> {
  value: T;
  label: string;
}

/**
 * Desplegable accesible propio (patrón WAI-ARIA "Listbox" colapsable).
 *
 * Sustituye al <select> nativo porque el popup de opciones nativo NO se puede
 * estilar de forma fiable entre navegadores (Chrome en Windows y Safari
 * ignoran color/background en <option>), lo que en un tema oscuro deja las
 * opciones no seleccionadas con contraste insuficiente.
 *
 * Aquí las opciones se pintan con colores explícitos (texto claro sobre
 * `noche-900` opaco → contraste WCAG AA holgado) y es totalmente navegable con
 * teclado: ↑/↓, Inicio/Fin, Enter/Espacio para elegir, Escape/clic fuera para
 * cerrar. El foco se mantiene en el botón y la opción activa se comunica con
 * `aria-activedescendant`.
 */
export function Select<T extends string>({
  value,
  onChange,
  opciones,
  ariaLabel,
  className = '',
  disabled = false,
}: {
  value: T;
  onChange: (v: T) => void;
  opciones: OpcionSelect<T>[];
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const baseId = useId();

  const indiceSeleccion = Math.max(
    0,
    opciones.findIndex((o) => o.value === value),
  );
  const seleccion = opciones[indiceSeleccion] ?? opciones[0];
  const optId = (i: number) => `${baseId}-opt-${i}`;

  // Cierra al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return;
    function onDocMouseDown(e: MouseEvent) {
      if (
        contenedorRef.current &&
        !contenedorRef.current.contains(e.target as Node)
      ) {
        setAbierto(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [abierto]);

  // Al abrir, sincroniza la opción activa con la seleccionada y enfoca la lista.
  useEffect(() => {
    if (abierto) {
      setActivo(indiceSeleccion);
      listaRef.current?.focus();
    }
    // Solo al cambiar `abierto`; indiceSeleccion se lee en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  function abrir() {
    if (!disabled) setAbierto(true);
  }

  function elegir(i: number) {
    onChange(opciones[i].value);
    setAbierto(false);
    botonRef.current?.focus();
  }

  function onKeyBoton(e: React.KeyboardEvent) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      abrir();
    }
  }

  function onKeyLista(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActivo((a) => Math.min(opciones.length - 1, a + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActivo((a) => Math.max(0, a - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActivo(0);
        break;
      case 'End':
        e.preventDefault();
        setActivo(opciones.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        elegir(activo);
        break;
      case 'Escape':
        e.preventDefault();
        setAbierto(false);
        botonRef.current?.focus();
        break;
      case 'Tab':
        setAbierto(false);
        break;
    }
  }

  return (
    <div ref={contenedorRef} className={`relative ${className}`}>
      <button
        ref={botonRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        onKeyDown={onKeyBoton}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-left text-slate-100 transition hover:bg-white/[0.06] focus:border-cesped-400 focus:bg-white/[0.06] focus:outline-none disabled:pointer-events-none disabled:opacity-50"
      >
        <span className="truncate">{seleccion.label}</span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`h-4 w-4 flex-none text-slate-400 transition-transform ${
            abierto ? 'rotate-180' : ''
          }`}
        >
          <path d="m6 8 4 4 4-4" />
        </svg>
      </button>

      {abierto && (
        <ul
          ref={listaRef}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-activedescendant={optId(activo)}
          onKeyDown={onKeyLista}
          className="absolute z-30 mt-1.5 max-h-64 w-full min-w-max animate-rise-in overflow-auto rounded-xl border border-white/10 bg-noche-900 p-1 shadow-2xl ring-1 ring-black/40 focus:outline-none"
        >
          {opciones.map((op, i) => {
            const seleccionada = op.value === value;
            const activa = i === activo;
            return (
              <li
                key={op.value}
                id={optId(i)}
                role="option"
                aria-selected={seleccionada}
                onMouseEnter={() => setActivo(i)}
                onClick={() => elegir(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                  activa ? 'bg-cesped-400/20 text-cesped-100' : 'text-slate-100'
                }`}
              >
                <span>{op.label}</span>
                {seleccionada && (
                  <span className="text-cesped-300" aria-hidden="true">
                    ✓
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
