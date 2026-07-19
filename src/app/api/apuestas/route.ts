import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hashToken } from '@/lib/tokens';
import {
  apuestaInputSchema,
  validaSignosContraMultiplicidad,
} from '@/lib/validation';
import { TOTAL_PARTIDOS } from '@/lib/quiniela';
import { ipDe } from '@/lib/rateLimit';
import { rateLimitPersistente } from '@/lib/authStore';
import { ok, error, manejaError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/apuestas
 * Registra la apuesta de una invitación.
 *
 * Auth: token de invitación (en el cuerpo).
 *  - 400 si los signos no cumplen la multiplicidad exigida.
 *  - 409 si el partido ya está apostado o el token ya se usó ("llegas tarde").
 *  - 404 si el token no existe.
 *
 * La unicidad "una sola apuesta por partido" está garantizada por la
 * restricción única (quinielaId, numeroPartido) en la BD, de modo que dos
 * peticiones simultáneas no pueden crear dos apuestas: la segunda choca con
 * el constraint y recibe 409 (no depende solo de comprobaciones en código).
 *
 * Si es la apuesta n.º 15, la Quiniela pasa a CERRADA en la misma transacción.
 */
export async function POST(req: NextRequest) {
  try {
    // Rate limit por IP para el endpoint público, compartido entre instancias
    // (Postgres); ante fallo de BD cae a memoria (fail-safe), no bloquea apuestas.
    const rl = await rateLimitPersistente(`apuestas:${ipDe(req)}`, 30, 60_000);
    if (!rl.permitido) {
      return error('Demasiadas peticiones. Espera unos segundos.', 429);
    }

    const body = await req.json().catch(() => ({}));
    const datos = apuestaInputSchema.parse(body);

    const tokenHash = hashToken(datos.token);
    const inv = await prisma.invitacion.findUnique({
      where: { tokenHash },
      include: { partido: { include: { apuesta: true, quiniela: true } } },
    });

    if (!inv) {
      return error('Invitación no encontrada o enlace no válido.', 404);
    }

    // Token de un solo uso.
    if (inv.estado !== 'PENDIENTE') {
      return error('Esta invitación ya fue utilizada o anulada.', 409);
    }
    // Regla del primero que llega.
    if (inv.partido.apuesta) {
      await prisma.invitacion.update({
        where: { id: inv.id },
        data: { estado: 'ANULADA' },
      });
      return error('Llegas tarde: este partido ya ha sido apostado.', 409);
    }
    if (inv.partido.quiniela.estado === 'CERRADA') {
      return error('La Quiniela ya está cerrada.', 409);
    }
    if (inv.partido.quiniela.estado === 'CADUCADA') {
      return error('La Quiniela ha caducado: pasó la fecha de cierre.', 409);
    }
    // Caducidad perezosa: si ya pasó la fecha de cierre y sigue ABIERTA (por
    // tanto, incompleta), se marca CADUCADA y se rechaza la apuesta.
    const fechaCierre = inv.partido.quiniela.fechaCierre;
    if (fechaCierre && Date.now() > fechaCierre.getTime()) {
      await prisma.quiniela.updateMany({
        where: { id: inv.partido.quinielaId, estado: 'ABIERTA' },
        data: { estado: 'CADUCADA' },
      });
      return error('La Quiniela ha caducado: pasó la fecha de cierre.', 409);
    }

    // Validación de signos contra la multiplicidad exigida.
    const errSignos = validaSignosContraMultiplicidad(
      datos.signos,
      inv.multiplicidad,
      inv.partido.esPleno,
    );
    if (errSignos) {
      return error(errSignos, 400);
    }

    // Transacción: crear apuesta + marcar invitación como usada + cerrar
    // la Quiniela si es la 15.ª apuesta.
    try {
      const resultado = await prisma.$transaction(async (tx) => {
        const apuesta = await tx.apuesta.create({
          data: {
            partidoId: inv.partido.id,
            invitacionId: inv.id,
            quinielaId: inv.partido.quinielaId,
            numeroPartido: inv.partido.numero,
            nombreJugador: inv.nombreJugador,
            signos: datos.signos as unknown as Prisma.InputJsonValue,
          },
        });

        await tx.invitacion.update({
          where: { id: inv.id },
          data: { estado: 'USADA', usedAt: new Date() },
        });

        const total = await tx.apuesta.count({
          where: { quinielaId: inv.partido.quinielaId },
        });

        let cerrada = false;
        if (total >= TOTAL_PARTIDOS) {
          await tx.quiniela.update({
            where: { id: inv.partido.quinielaId },
            data: { estado: 'CERRADA' },
          });
          cerrada = true;
        }

        return { apuesta, cerrada, apostados: total };
      });

      return ok(
        {
          ok: true,
          apostados: resultado.apostados,
          total: TOTAL_PARTIDOS,
          quinielaCerrada: resultado.cerrada,
        },
        201,
      );
    } catch (e) {
      // Violación de restricción única -> otro jugador se adelantó.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        await prisma.invitacion
          .update({ where: { id: inv.id }, data: { estado: 'ANULADA' } })
          .catch(() => {});
        return error('Llegas tarde: este partido ya ha sido apostado.', 409);
      }
      throw e;
    }
  } catch (e) {
    return manejaError(e);
  }
}
