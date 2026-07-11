-- CreateTable
CREATE TABLE "sesiones_revocadas" (
    "jti" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesiones_revocadas_pkey" PRIMARY KEY ("jti")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "clave" TEXT NOT NULL,
    "contador" INTEGER NOT NULL DEFAULT 0,
    "reset" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "totp_step" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "ultimoStep" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "totp_step_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sesiones_revocadas_expiraEn_idx" ON "sesiones_revocadas"("expiraEn");
