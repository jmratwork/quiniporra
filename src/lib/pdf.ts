import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import type { Signos } from './validation';
import { SIGNOS_1X2, VALORES_PLENO } from './validation';

/**
 * Genera el PDF del boleto de La Quiniela con pdf-lib.
 *
 * pdf-lib es JavaScript puro: funciona en el runtime serverless de Vercel sin
 * binarios ni dependencias nativas.
 *
 * Diseño tipo boleto:
 *  - Cabecera con la jornada y la fecha.
 *  - Filas 1-14 con local/visitante y casillas 1 / X / 2 (marcadas según la apuesta).
 *  - Fila 15 (Pleno al 15) con los goles 0 / 1 / M de cada equipo.
 *  - Columna con el nombre del apostante de cada partido.
 */

export interface PartidoPdf {
  numero: number;
  local: string;
  visitante: string;
  esPleno: boolean;
  signos: Signos | null;
  nombreJugador: string | null;
}

export interface BoletoPdf {
  jornada: string;
  fechaCierre: Date | string | null;
  partidos: PartidoPdf[];
}

// cesped-600 (#16a34a): el mismo verde de marca que la interfaz.
const VERDE = rgb(0.086, 0.639, 0.29);
const NEGRO = rgb(0.1, 0.1, 0.1);
const GRIS = rgb(0.6, 0.6, 0.6);
const BLANCO = rgb(1, 1, 1);

function fmtFecha(f: Date | string | null): string {
  if (!f) return '';
  const d = typeof f === 'string' ? new Date(f) : f;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function recorta(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function marca1x2(signos: Signos | null, signo: string): boolean {
  return signos?.tipo === '1X2' && signos.valores.includes(signo as never);
}

export async function generarPdfBoleto(boleto: BoletoPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const margen = 36;

  // --- Cabecera ---
  page.drawRectangle({
    x: margen,
    y: height - margen - 46,
    width: width - margen * 2,
    height: 46,
    color: VERDE,
  });
  page.drawText('LA QUINIELA — Boleto de la porra', {
    x: margen + 12,
    y: height - margen - 20,
    size: 15,
    font: bold,
    color: BLANCO,
  });
  page.drawText(
    `${boleto.jornada}${boleto.fechaCierre ? '   ·   Cierre: ' + fmtFecha(boleto.fechaCierre) : ''}`,
    {
      x: margen + 12,
      y: height - margen - 38,
      size: 10,
      font,
      color: BLANCO,
    },
  );

  // --- Geometría de la tabla ---
  const xNum = margen;
  const wNum = 22;
  const xLocal = xNum + wNum;
  const wLocal = 128;
  const xVisit = xLocal + wLocal;
  const wVisit = 128;
  const xSignos = xVisit + wVisit;
  const wSignos = 108;
  const xApost = xSignos + wSignos;
  const wApost = width - margen - xApost;

  const filaAlto = 34;
  let y = height - margen - 46 - 24;

  // Cabecera de columnas
  const dibujaCabecera = (yy: number) => {
    page.drawText('Nº', { x: xNum + 4, y: yy, size: 8, font: bold, color: GRIS });
    page.drawText('Local', { x: xLocal + 2, y: yy, size: 8, font: bold, color: GRIS });
    page.drawText('Visitante', { x: xVisit + 2, y: yy, size: 8, font: bold, color: GRIS });
    page.drawText('Pronóstico', { x: xSignos + 2, y: yy, size: 8, font: bold, color: GRIS });
    page.drawText('Apostante', { x: xApost + 2, y: yy, size: 8, font: bold, color: GRIS });
  };
  dibujaCabecera(y);
  y -= 10;
  page.drawLine({
    start: { x: margen, y },
    end: { x: width - margen, y },
    thickness: 1,
    color: VERDE,
  });

  // --- Filas ---
  const dibujaCelda1x2 = (
    px: number,
    py: number,
    etiqueta: string,
    marcado: boolean,
  ) => {
    const lado = 14;
    page.drawRectangle({
      x: px,
      y: py,
      width: lado,
      height: lado,
      borderColor: NEGRO,
      borderWidth: 1,
      color: marcado ? VERDE : BLANCO,
    });
    page.drawText(etiqueta, {
      x: px + 3.5,
      y: py + 3,
      size: 9,
      font: bold,
      color: marcado ? BLANCO : NEGRO,
    });
  };

  for (const p of boleto.partidos) {
    y -= filaAlto;
    const yTexto = y + filaAlto / 2 - 3;

    // separador
    page.drawLine({
      start: { x: margen, y: y - 2 },
      end: { x: width - margen, y: y - 2 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });

    page.drawText(String(p.numero), {
      x: xNum + 4,
      y: yTexto,
      size: 10,
      font: bold,
      color: p.esPleno ? VERDE : NEGRO,
    });
    page.drawText(recorta(p.local, 22), {
      x: xLocal + 2,
      y: yTexto,
      size: 9,
      font,
      color: NEGRO,
    });
    page.drawText(recorta(p.visitante, 22), {
      x: xVisit + 2,
      y: yTexto,
      size: 9,
      font,
      color: NEGRO,
    });

    if (!p.esPleno) {
      // Casillas 1 / X / 2
      let cx = xSignos + 2;
      for (const s of SIGNOS_1X2) {
        dibujaCelda1x2(cx, y + 8, s, marca1x2(p.signos, s));
        cx += 20;
      }
    } else {
      // Pleno al 15: goles 0/1/M por equipo
      dibujaPleno(page, font, bold, xSignos + 2, y, p.signos);
    }

    page.drawText(recorta(p.nombreJugador ?? '—', 18), {
      x: xApost + 2,
      y: yTexto,
      size: 9,
      font,
      color: p.nombreJugador ? NEGRO : GRIS,
    });
  }

  // Pie
  page.drawText(
    'Generado por quiniporra · pronósticos de la porra colaborativa',
    { x: margen, y: margen - 8, size: 7, font, color: GRIS },
  );

  return doc.save();
}

function dibujaPleno(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  x: number,
  yFila: number,
  signos: Signos | null,
) {
  const pleno = signos?.tipo === 'PLENO' ? signos : null;
  const filas: [string, string[]][] = [
    ['L', pleno?.local ?? []],
    ['V', pleno?.visitante ?? []],
  ];
  let yy = yFila + 18;
  for (const [etiqueta, marcados] of filas) {
    page.drawText(etiqueta, { x, y: yy, size: 7, font: bold, color: NEGRO });
    let cx = x + 10;
    for (const v of VALORES_PLENO) {
      const marcado = marcados.includes(v as never);
      page.drawRectangle({
        x: cx,
        y: yy - 1,
        width: 11,
        height: 11,
        borderColor: NEGRO,
        borderWidth: 0.8,
        color: marcado ? VERDE : BLANCO,
      });
      page.drawText(v, {
        x: cx + 2.5,
        y: yy + 1.5,
        size: 7,
        font: bold,
        color: marcado ? BLANCO : NEGRO,
      });
      cx += 15;
    }
    yy -= 13;
  }
}
