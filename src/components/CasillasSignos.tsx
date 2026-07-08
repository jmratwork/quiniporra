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
  const dim = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-10 w-10 text-sm';

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
    <div className="flex gap-1.5">
      {opciones.map((op) => {
        const marcado = seleccion.includes(op);
        return (
          <button
            key={op}
            type="button"
            aria-pressed={marcado}
            disabled={readOnly}
            onClick={() => toggle(op)}
            className={`${dim} flex items-center justify-center rounded-md border font-bold transition ${
              marcado
                ? 'border-quiniela bg-quiniela text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:border-quiniela'
            } ${readOnly ? 'cursor-default' : ''}`}
          >
            {op}
          </button>
        );
      })}
    </div>
  );
}
