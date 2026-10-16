import { prisma } from './prisma';
import { obtenerJornadaActual } from './jornadaFetcher';
import { archivarQuiniela } from './historico';

/**
 * Carga automática (programada) de la jornada actual de La Quiniela.
 *
 * Se dispara desde un cron (lunes y viernes a las 10:00 de Barcelona, ver
 * vercel.json) y desde el botón "Cargar jornada" del panel de admin
 * (POST /api/admin/jornada). Es **idempotente y NO destructiva**: nunca borra
 * una porra en curso.
 *
 * Regla de decisión (ver `decidirAccionCarga`):
 *  - No hay ninguna quiniela             -> crear.
 *  - Ya existe la MISMA jornada           -> sin cambios (idempotente).
 *  - La fuente publica una jornada ANTERIOR a la cargada -> omitir: solo puede
 *    ser una página vieja (caché intermedia), y nunca se retrocede.
 *  - Existe otra jornada que SIGUE ABIERTA EN PLAZO (fechaCierre en el futuro)
 *    -> omitir (no se destruye una porra con apuestas a medias).
 *  - Cualquier otra jornada distinta      -> reemplazar. La fuente solo publica
 *    la jornada abierta en cada momento, así que ver otra distinta implica que
 *    la anterior ya terminó (CERRADA/CADUCADA, pasada su cierre, o de cierre
 *    desconocido). Se archiva antes de borrar, así que nada se pierde.
 */

export type AccionCarga =
  | 'crear'
  | 'sin-cambios'
  | 'reemplazar'
  | 'omitir-activa'
  | 'omitir-antigua';

export interface ExistenteMin {
  jornada: string;
  estado: 'ABIERTA' | 'CERRADA' | 'CADUCADA';
  fechaCierre: Date | null;
}

/** "Jornada 14 - 2027" -> { numero: 14, anyo: 2027 }; anyo null si no lo lleva. */
function parteEtiqueta(jornada: string): { numero: number; anyo: number | null } | null {
  const m = jornada.match(/^Jornada (\d+)(?: - (\d{4}))?$/);
  return m ? { numero: Number(m[1]), anyo: m[2] ? Number(m[2]) : null } : null;
}

/**
 * ¿`nueva` es una jornada ANTERIOR a `existente`? Por temporada (año) y, dentro
 * de la misma, por número. Si las etiquetas no son comparables (formato
 * desconocido, o una con año y otra sin él) responde false.
 */
export function esJornadaAnterior(nueva: string, existente: string): boolean {
  const a = parteEtiqueta(nueva);
  const b = parteEtiqueta(existente);
  if (!a || !b || (a.anyo === null) !== (b.anyo === null)) return false;
  if (a.anyo !== b.anyo) return (a.anyo ?? 0) < (b.anyo ?? 0);
  return a.numero < b.numero;
}

export function decidirAccionCarga(
  existente: ExistenteMin | null,
  jornadaNueva: string,
  ahora = Date.now(),
): AccionCarga {
  if (!existente) return 'crear';
  if (existente.jornada === jornadaNueva) return 'sin-cambios';
  if (esJornadaAnterior(jornadaNueva, existente.jornada)) return 'omitir-antigua';

  // Solo se respeta la jornada existente si sigue DEMOSTRABLEMENTE abierta a
  // apuestas: estado ABIERTA y con una fecha de cierre que aún no ha llegado.
  // Si el cierre es desconocido (null) no se puede afirmar que siga en plazo, y
  // como la fuente solo publica la jornada abierta, ver otra distinta implica
  // que esta ya pasó: se reemplaza (archivando antes) para no quedar atascada.
  const sigueAbiertaEnPlazo =
    existente.estado === 'ABIERTA' &&
    existente.fechaCierre !== null &&
    ahora <= existente.fechaCierre.getTime();

  return sigueAbiertaEnPlazo ? 'omitir-activa' : 'reemplazar';
}

export interface ResultadoCarga {
  accion: AccionCarga;
  jornada: string;
}

/**
 * Obtiene la jornada actual de la fuente y aplica la acción que corresponda.
 * Lanza JornadaFetchError si la fuente falla (el cron devolverá 502 y se
 * reintentará en el siguiente disparo). Con `usarCache: false` consulta siempre
 * la fuente (carga pedida desde el panel).
 */
export async function cargarJornadaAutomatica(
  opts: { usarCache?: boolean } = {},
): Promise<ResultadoCarga> {
  const jornada = await obtenerJornadaActual({ usarCache: opts.usarCache });

  const existente = await prisma.quiniela.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, jornada: true, estado: true, fechaCierre: true },
  });

  const accion = decidirAccionCarga(existente, jornada.jornada);

  // Registro seguro de la decisión (solo nombres/estado/acción, sin datos).
  console.info(
    `[cargaJornada] fuente="${jornada.jornada}" cierre=${jornada.fechaCierre ?? 'null'} | ` +
      `existente=${existente ? `"${existente.jornada}" ${existente.estado} cierre=${existente.fechaCierre?.toISOString() ?? 'null'}` : 'ninguna'} | ` +
      `accion=${accion}`,
  );

  if (accion === 'sin-cambios' || accion === 'omitir-activa' || accion === 'omitir-antigua') {
    return { accion, jornada: jornada.jornada };
  }

  await prisma.$transaction(async (tx) => {
    if (accion === 'reemplazar' && existente) {
      // M4: archiva el boleto anterior (si tenía apuestas) antes de borrarlo.
      await archivarQuiniela(tx, existente.id);
      await tx.quiniela.delete({ where: { id: existente.id } });
    }
    await tx.quiniela.create({
      data: {
        jornada: jornada.jornada,
        fechaCierre: jornada.fechaCierre ? new Date(jornada.fechaCierre) : null,
        estado: 'ABIERTA',
        origen: 'AUTOMATICO',
        partidos: {
          create: jornada.partidos.map((p) => ({
            numero: p.numero,
            local: p.local,
            visitante: p.visitante,
            esPleno: p.esPleno,
          })),
        },
      },
    });
  });

  return { accion, jornada: jornada.jornada };
}
