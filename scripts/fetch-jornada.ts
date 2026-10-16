/**
 * Script de prueba en local del fetcher de la jornada.
 *
 *   npm run fetch:jornada
 *
 * Hace peticiones REALES a Mundo Deportivo (y a SELAE solo de respaldo):
 *   1. Intenta obtener la jornada ABIERTA a apuestas con sus 15 partidos.
 *   2. Si no lo consigue, demuestra que el parser de SELAE funciona mostrando
 *      los 15 partidos de la última jornada disponible (buscadorSorteos solo
 *      expone jornadas ya publicadas/celebradas).
 *
 * En la app, si la carga falla, el cron la reintenta en su siguiente disparo y
 * el admin puede reintentarla desde el panel (botón "Cargar jornada").
 */
import {
  obtenerJornadaActual,
  obtenerCabeceraJornada,
  obtenerUltimaJornadaConPartidos,
  JornadaFetchError,
  type JornadaObtenida,
} from '../src/lib/jornadaFetcher';

const NOMBRE_FUENTE: Record<string, string> = {
  MUNDO_DEPORTIVO: 'Mundo Deportivo',
  SELAE: 'SELAE (buscadorSorteos)',
};

function imprimeJornada(j: JornadaObtenida) {
  console.log(`   ${j.jornada}${j.celebrada ? '  (jornada ya celebrada)' : '  (abierta a apuestas)'}`);
  console.log(`   Fuente de los partidos: ${NOMBRE_FUENTE[j.fuente] ?? j.fuente}`);
  if (j.fechaCierre)
    console.log(`   Cierre:   ${new Date(j.fechaCierre).toLocaleString('es-ES')}`);
  if (j.fechaSorteo)
    console.log(`   Sorteo:   ${new Date(j.fechaSorteo).toLocaleString('es-ES')}`);
  if (j.idSorteo) console.log(`   idSorteo: ${j.idSorteo}`);
  console.log('\n   Nº  Local                      Visitante');
  console.log('   ──  ─────────────────────────  ─────────────────────────');
  for (const p of j.partidos) {
    const marca = p.esPleno ? '  ← Pleno al 15' : '';
    console.log(
      `   ${String(p.numero).padStart(2)}  ${p.local.padEnd(25)}  ${p.visitante.padEnd(25)}${marca}`,
    );
  }
  console.log(`\n   Total: ${j.partidos.length} partidos.`);
}

function hoyYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

async function main() {
  console.log(
    '→ Consultando la jornada ABIERTA de La Quiniela…\n' +
      '  (fuente primaria: Mundo Deportivo · SELAE solo como respaldo)\n',
  );

  try {
    const jornada = await obtenerJornadaActual({ usarCache: false });
    console.log('✅ Jornada abierta obtenida con sus 15 partidos:\n');
    imprimeJornada(jornada);
    process.exit(0);
  } catch (e) {
    if (!(e instanceof JornadaFetchError)) {
      console.error('❌ Error inesperado:', e);
      process.exit(1);
    }

    console.warn('⚠️  No se pudieron obtener los partidos de la jornada abierta.');
    console.warn(`   Motivo: ${e.message}`);
    if (e.detalle) console.warn(`   Detalle: ${e.detalle}\n`);

    // Diagnóstico: ¿responde al menos la cabecera?
    try {
      const cab = await obtenerCabeceraJornada();
      console.warn(
        `   (Cabecera SÍ accesible: jornada ${cab.numeroJornada}, año ${cab.anyo}, ` +
          `cierre ${cab.fechaCierre})\n`,
      );
    } catch {
      /* ignorar */
    }

    // Demostración del parser con la última jornada con partidos disponible.
    console.log('→ Demostrando el parser con la última jornada disponible en SELAE…\n');
    try {
      const ultima = await obtenerUltimaJornadaConPartidos(hoyYmd());
      console.log('✅ 15 partidos reales obtenidos y parseados correctamente:\n');
      imprimeJornada(ultima);
      console.log(
        '\n   El fetcher y el parser funcionan. La jornada abierta se cargará cuando la\n' +
          '   fuente publique sus 15 partidos (cron, o botón "Cargar jornada" del panel).',
      );
      process.exit(0);
    } catch (e2) {
      console.error(
        `❌ Tampoco se pudo acceder a datos de SELAE: ${
          e2 instanceof Error ? e2.message : String(e2)
        }`,
      );
      console.error(
        '\n   → La fuente externa no está accesible ahora mismo (posible bloqueo de\n' +
          '     red/Akamai). Vuelve a intentarlo más tarde.',
      );
      process.exit(1);
    }
  }
}

main();
