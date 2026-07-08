/**
 * Botón con icono de impresora que descarga el PDF del boleto.
 * Es un simple enlace a /api/quiniela/pdf (que responde con attachment).
 */
export function BotonImprimir({
  className = 'btn-primary',
}: {
  className?: string;
}) {
  return (
    <a href="/api/quiniela/pdf" className={className} download>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
      Descargar PDF del boleto
    </a>
  );
}
