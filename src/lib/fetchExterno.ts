import { JornadaFetchError } from './errors';

/**
 * Descarga el cuerpo de una URL externa como texto, con dos salvaguardas frente
 * a fuentes remotas no confiables (SELAE, Mundo Deportivo):
 *
 *  - **Timeout** (AbortController): evita que una función serverless quede
 *    bloqueada si el servidor remoto no responde.
 *  - **Límite de tamaño**: aborta la lectura si el cuerpo supera `maxBytes`,
 *    para no agotar memoria ante una respuesta desproporcionada (o un
 *    intermediario/CDN malicioso).
 *
 * Devuelve el estado y el texto; el llamante decide cómo interpretarlos.
 * Lanza JornadaFetchError ante fallo de red, timeout o exceso de tamaño.
 */

export interface RespuestaExterna {
  ok: boolean;
  status: number;
  statusText: string;
  texto: string;
}

const TIMEOUT_MS = 25_000;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function fetchTextoExterno(
  url: string,
  opts: {
    headers: Record<string, string>;
    timeoutMs?: number;
    maxBytes?: number;
  },
): Promise<RespuestaExterna> {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: opts.headers,
      cache: 'no-store',
      signal: controlador.signal,
    });

    // Descarte temprano si el servidor anuncia un tamaño excesivo.
    const declarado = Number(res.headers.get('content-length'));
    if (Number.isFinite(declarado) && declarado > maxBytes) {
      throw new JornadaFetchError('La respuesta remota excede el tamaño máximo permitido.');
    }

    const texto = await leerTextoLimitado(res, maxBytes);
    return { ok: res.ok, status: res.status, statusText: res.statusText, texto };
  } catch (e) {
    if (e instanceof JornadaFetchError) throw e;
    if (e instanceof Error && e.name === 'AbortError') {
      throw new JornadaFetchError(`La petición a ${host(url)} superó el tiempo máximo.`);
    }
    throw new JornadaFetchError(
      `No se pudo conectar con ${host(url)}.`,
      e instanceof Error ? e.message : String(e),
    );
  } finally {
    clearTimeout(temporizador);
  }
}

/** Lee el cuerpo por streaming, abortando si supera maxBytes. */
async function leerTextoLimitado(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) {
    // Sin stream disponible: cae al método directo y trunca por seguridad.
    const t = await res.text();
    if (t.length > maxBytes) {
      throw new JornadaFetchError('La respuesta remota excede el tamaño máximo permitido.');
    }
    return t;
  }

  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new JornadaFetchError('La respuesta remota excede el tamaño máximo permitido.');
      }
      partes.push(value);
    }
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const p of partes) {
    buffer.set(p, offset);
    offset += p.length;
  }
  return new TextDecoder('utf-8').decode(buffer);
}

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'la fuente externa';
  }
}
