/**
 * Escudo genérico: muestra las iniciales del equipo en un círculo.
 * Sin imágenes con copyright.
 */
export function Escudo({ nombre, size = 36 }: { nombre: string; size?: number }) {
  const iniciales = nombre
    .trim()
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 3);

  return (
    <div
      className="flex flex-none items-center justify-center rounded-full bg-gradient-to-br from-white/20 to-white/[0.06] font-black text-white shadow-lg ring-1 ring-cesped-400/40 backdrop-blur"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      aria-hidden="true"
    >
      {iniciales || '?'}
    </div>
  );
}
