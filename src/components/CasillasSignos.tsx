'use client';

/**
 * Grupo de casillas seleccionables (1/X/2 o 0/1/M).
 *
 * Reutilizable tanto para apostar (interactivo, con límite de marcas) como
 * para mostrar una apuesta ya hecha (readOnly).
 */
export function CasillasSignos({
  opciones,
  seleccion,
  max,
  onChange,
  readOnly = false,
  size = 'md',
}: {
  opciones: readonly string[];
  seleccion: string[];
  max: number;
  onChange?: (nueva: string[]) => void;
  readOnly?: boolean;
  size?: 'sm' | 'md';
}) {
  const dim = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-12 w-12 text-base';

  function toggle(valor: string) {
    if (readOnly || !onChange) return;
    if (seleccion.includes(valor)) {
      onChange(seleccion.filter((v) => v !== valor));
    } else {
      if (seleccion.length >= max) return; // no permite más marcas que la multiplicidad
      onChange([...seleccion, valor]);
    }
  }

  return (
    <div className="flex gap-2">
      {opciones.map((op) => {
        const marcado = seleccion.includes(op);
        const lleno = !marcado && seleccion.length >= max;
        return (
          <button
            key={op}
            type="button"
            aria-pressed={marcado}
            disabled={readOnly}
            onClick={() => toggle(op)}
            className={`${dim} flex items-center justify-center rounded-xl font-black tabular-nums transition ${
              marcado
                ? 'bg-gradient-to-b from-cesped-400 to-cesped-600 text-noche-950 shadow-glow ring-1 ring-cesped-400/40'
                : 'border border-white/10 bg-white/[0.03] text-slate-300'
            } ${
              readOnly
                ? 'cursor-default'
                : marcado
                  ? 'hover:from-cesped-300 hover:to-cesped-500'
                  : lleno
                    ? 'opacity-40'
                    : 'hover:border-cesped-400/60 hover:bg-white/[0.08] active:scale-[0.96]'
            }`}
          >
            {op}
          </button>
        );
      })}
    </div>
  );
}
