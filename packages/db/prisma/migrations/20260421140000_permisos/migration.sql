-- CreateTable
CREATE TABLE "permisos" (
    "role" "Role" NOT NULL,
    "modulo" TEXT NOT NULL,
    "accion" TEXT NOT NULL,

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("role","modulo","accion")
);

