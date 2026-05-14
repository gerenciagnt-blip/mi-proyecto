-- Sprint Chat interno · presencia — agrega heartbeat timestamp en User.
-- El cliente hace ping cada ~60s mientras tenga el panel admin abierto;
-- el widget de chat marca como ONLINE a quien tenga `now - lastActiveAt
-- < 2 min`. Nullable (los users nuevos parten sin actividad reciente).

-- AlterTable
ALTER TABLE "users" ADD COLUMN "lastActiveAt" TIMESTAMP(3);

-- CreateIndex (optimiza el listado online + algunas estadísticas futuras)
CREATE INDEX "users_lastActiveAt_idx" ON "users"("lastActiveAt" DESC);
