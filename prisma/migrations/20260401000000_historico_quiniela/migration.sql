-- CreateTable
CREATE TABLE "historicos_quiniela" (
    "id" TEXT NOT NULL,
    "jornada" TEXT NOT NULL,
    "fechaCierre" TIMESTAMP(3),
    "estado" "EstadoQuiniela" NOT NULL,
    "apostados" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "archivadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historicos_quiniela_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historicos_quiniela_archivadaEn_idx" ON "historicos_quiniela"("archivadaEn");
