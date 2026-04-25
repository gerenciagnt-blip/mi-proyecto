-- Añade dos valores al enum CarteraEstado:
--   ENVIADA    — estado intermedio del consolidado: soporte ya respondió a
--                la entidad, esperando confirmación de conciliación.
--   MORA_REAL  — la línea es mora real (no es la cartera firme aún, pero ya
--                se considera deuda válida). Junto con CARTERA_REAL son los
--                dos estados que disparan visibilidad al aliado en el
--                módulo Administrativo.
--
-- Operación aditiva: ALTER TYPE ADD VALUE no toca filas existentes.

ALTER TYPE "CarteraEstado" ADD VALUE IF NOT EXISTS 'ENVIADA';
ALTER TYPE "CarteraEstado" ADD VALUE IF NOT EXISTS 'MORA_REAL';
