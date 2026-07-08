-- CreateEnum
CREATE TYPE "EstadoQuiniela" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "OrigenQuiniela" AS ENUM ('AUTOMATICO', 'MANUAL');

-- CreateEnum
CREATE TYPE "Multiplicidad" AS ENUM ('SIMPLE', 'DOBLE', 'TRIPLE');

-- CreateEnum
CREATE TYPE "EstadoInvitacion" AS ENUM ('PENDIENTE', 'USADA', 'ANULADA');

-- CreateTable
CREATE TABLE "quinielas" (
    "id" TEXT NOT NULL,
    "jornada" TEXT NOT NULL,
    "fechaCierre" TIMESTAMP(3),
    "estado" "EstadoQuiniela" NOT NULL DEFAULT 'ABIERTA',
    "origen" "OrigenQuiniela" NOT NULL DEFAULT 'AUTOMATICO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quinielas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partidos" (
    "id" TEXT NOT NULL,
    "quinielaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "local" TEXT NOT NULL,
    "visitante" TEXT NOT NULL,
    "multiplicidad" "Multiplicidad",
    "esPleno" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "partidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitaciones" (
    "id" TEXT NOT NULL,
    "partidoId" TEXT NOT NULL,
    "nombreJugador" TEXT NOT NULL,
    "multiplicidad" "Multiplicidad" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "estado" "EstadoInvitacion" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "invitaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apuestas" (
    "id" TEXT NOT NULL,
    "partidoId" TEXT NOT NULL,
    "invitacionId" TEXT NOT NULL,
    "quinielaId" TEXT NOT NULL,
    "numeroPartido" INTEGER NOT NULL,
    "nombreJugador" TEXT NOT NULL,
    "signos" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apuestas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partidos_quinielaId_idx" ON "partidos"("quinielaId");

-- CreateIndex
CREATE UNIQUE INDEX "partidos_quinielaId_numero_key" ON "partidos"("quinielaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "invitaciones_tokenHash_key" ON "invitaciones"("tokenHash");

-- CreateIndex
CREATE INDEX "invitaciones_partidoId_idx" ON "invitaciones"("partidoId");

-- CreateIndex
CREATE UNIQUE INDEX "apuestas_partidoId_key" ON "apuestas"("partidoId");

-- CreateIndex
CREATE UNIQUE INDEX "apuestas_invitacionId_key" ON "apuestas"("invitacionId");

-- CreateIndex
CREATE INDEX "apuestas_quinielaId_idx" ON "apuestas"("quinielaId");

-- CreateIndex
CREATE UNIQUE INDEX "apuestas_quinielaId_numeroPartido_key" ON "apuestas"("quinielaId", "numeroPartido");

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_quinielaId_fkey" FOREIGN KEY ("quinielaId") REFERENCES "quinielas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_partidoId_fkey" FOREIGN KEY ("partidoId") REFERENCES "partidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apuestas" ADD CONSTRAINT "apuestas_partidoId_fkey" FOREIGN KEY ("partidoId") REFERENCES "partidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apuestas" ADD CONSTRAINT "apuestas_invitacionId_fkey" FOREIGN KEY ("invitacionId") REFERENCES "invitaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
