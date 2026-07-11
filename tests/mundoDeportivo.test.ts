import { describe, it, expect } from 'vitest';
import {
  parseaBoleto,
  limpiaNombreEquipo,
  capitaliza,
  pareceUnPartido,
  posicionEnMismaLinea,
} from '../src/lib/mundoDeportivo';

// Fixture que replica los DOS bloques reales de la página + ruido
// (botones 1/X/2, porcentajes sueltos, enlaces legales, y un duplicado).
const HTML_BOLETO = `
<div><span>ESPAÑA - BÉLGICA</span><span>1</span><span>21:00</span><span>72</span><span>18</span></div>
<div><span>NORUEGA - INGLATERRA</span><span>2</span><span>23:00</span><span>58</span></div>
<div><span>ARGENTINA - SUIZA</span><span>3</span></div>
<div><span>VPS - SJK</span><span>4</span></div>
<div><span>FC LAHTI - HJK HELSINKI</span><span>5</span></div>
<div><span>TPS - AC OULU</span><span>6</span></div>
<div><span>IF GNISTAN - IFK MARIEHAMN</span><span>7</span></div>
<div><span>FREDRIKSTAD - LILLESTROM</span><span>8</span></div>
<div><span>AALESUNDS - MOLDE</span><span>9</span></div>
<div><span>TROMSO - VALERENGA</span><span>10</span></div>
<div><span>KFUM OSLO - BODOGLIMT</span><span>11</span></div>
<div><span>ROSENBORG - KRISTIANSUND</span><span>12</span></div>
<div><span>SANDEFJORD - HAMKAN</span><span>13</span></div>
<div><span>14.</span><span>BRANN - IK START</span><span>1</span><span>X</span><span>2</span></div>
<div><span>15.</span><span>SARPSBORG - VIKING</span><span>0</span><span>1</span><span>2</span><span>M</span></div>
<div><span>ESPAÑA - BÉLGICA</span></div>
<div><span>Política de cookies - aviso legal</span></div>
`;

/** ¿La cadena contiene algún carácter Unicode invisible / bidireccional? */
function tieneInvisibles(s: string): boolean {
  for (const c of s) {
    const n = c.codePointAt(0) ?? 0;
    if (
      n === 0x00ad ||
      n === 0xfeff ||
      (n >= 0x200b && n <= 0x200f) ||
      (n >= 0x202a && n <= 0x202e) ||
      (n >= 0x2060 && n <= 0x2069)
    ) {
      return true;
    }
  }
  return false;
}

describe('parseaBoleto', () => {
  const partidos = parseaBoleto(HTML_BOLETO);

  it('extrae exactamente 15 partidos numerados 1..15', () => {
    expect(partidos).toHaveLength(15);
    expect(partidos.map((p) => p.numero)).toEqual([...Array(15)].map((_, i) => i + 1));
  });

  it('detecta el Pleno al 15 (posición en la línea anterior con punto "15.")', () => {
    const pleno = partidos[14];
    expect(pleno.esPleno).toBe(true);
    expect(pleno.local).toBe('Sarpsborg');
    expect(pleno.visitante).toBe('Viking');
  });

  it('resuelve el bloque compacto (posición en la línea siguiente)', () => {
    expect(partidos[0]).toMatchObject({ numero: 1, local: 'España', visitante: 'Bélgica' });
  });

  it('deduplica partidos repetidos entre bloques', () => {
    expect(partidos.filter((p) => p.local === 'España')).toHaveLength(1);
  });

  it('descarta el ruido legal y los botones 1/X/2', () => {
    expect(partidos.some((p) => /cookies|aviso|legal/i.test(p.local + p.visitante))).toBe(false);
    expect(partidos.every((p) => p.numero >= 1 && p.numero <= 15)).toBe(true);
  });
});

describe('limpiaNombreEquipo', () => {
  it('elimina ángulos y caracteres de control', () => {
    expect(limpiaNombreEquipo('Real <b>Madrid</b>')).toBe('Real b Madrid /b');
  });

  it('elimina caracteres Unicode invisibles / bidi (Trojan Source)', () => {
    // Construido con code points para no meter invisibles en el fuente:
    // zero-width space, RLO, PDI, BOM, soft hyphen entre las letras A B C D.
    const cp = [0x200b, 0x202e, 0x2069, 0xfeff, 0x00ad];
    const invis =
      'A' +
      String.fromCharCode(cp[0]) +
      'B' +
      String.fromCharCode(cp[1]) +
      'C' +
      String.fromCharCode(cp[2]) +
      'D' +
      String.fromCharCode(cp[3]) +
      String.fromCharCode(cp[4]);
    const out = limpiaNombreEquipo(invis);
    expect(tieneInvisibles(out)).toBe(false);
    // Cada invisible se sustituye por un espacio (saneado seguro), no se fusiona.
    expect(out).toBe('A B C D');
  });

  it('trunca a la longitud máxima', () => {
    expect(limpiaNombreEquipo('A'.repeat(100)).length).toBe(48);
  });
});

describe('capitaliza', () => {
  it('capitaliza respetando el español', () => {
    expect(capitaliza('ESPAÑA')).toBe('España');
    expect(capitaliza('IFK MARIEHAMN')).toBe('Ifk Mariehamn');
  });
});

describe('pareceUnPartido / posicionEnMismaLinea', () => {
  it('reconoce un emparejamiento y descarta ruido largo', () => {
    expect(pareceUnPartido('Real Madrid - Barcelona')).toBe(true);
    expect(pareceUnPartido('solo texto sin guion')).toBe(false);
  });

  it('extrae la posición cuando va en la misma línea', () => {
    expect(posicionEnMismaLinea('15 Real Madrid - Barcelona')[0]).toBe(15);
    expect(posicionEnMismaLinea('Real Madrid - Barcelona 7')[0]).toBe(7);
  });
});
