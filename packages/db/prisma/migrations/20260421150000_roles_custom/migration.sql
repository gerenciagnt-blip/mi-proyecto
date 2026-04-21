-- CreateTable
CREATE TABLE "roles_custom" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "basedOn" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_custom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permisos_custom" (
    "rolCustomId" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "accion" TEXT NOT NULL,

    CONSTRAINT "permisos_custom_pkey" PRIMARY KEY ("rolCustomId","modulo","accion")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_custom_nombre_key" ON "roles_custom"("nombre");

-- AddForeignKey
ALTER TABLE "permisos_custom" ADD CONSTRAINT "permisos_custom_rolCustomId_fkey" FOREIGN KEY ("rolCustomId") REFERENCES "roles_custom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

