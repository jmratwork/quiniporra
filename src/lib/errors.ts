/**
 * Error de obtención de la jornada desde una fuente externa.
 * Vive en su propio módulo para que el fetcher de SELAE y el de Mundo
 * Deportivo puedan compartirlo sin dependencias circulares.
 */
export class JornadaFetchError extends Error {
  constructor(
    message: string,
    public readonly detalle?: string,
  ) {
    super(message);
    this.name = 'JornadaFetchError';
  }
}
