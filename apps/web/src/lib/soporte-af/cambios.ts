/**
 * Resolver de snapshots SoporteAfiliacion a "cambios" legibles.
 *
 * Los snapshots guardan IDs crudos (empresaId, planSgssId) por eficiencia y
 * trazabilidad, pero la UI necesita mostrar nombres/fechas formateadas. Este
 * módulo hace el lookup en BD de los IDs únicos referenciados por un
 * conjunto de snapshots y produce un arreglo de filas listas para renderizar.
 */

import { prisma } from '@pila/db';

/** Filas que la UI renderiza en la sección "Cambios detectados". */
export type CambioRow = {
  campo: 'estado' | 'fechaIngreso' | 'empresaId' | 'nivelRiesgo' | 'planSgssId';
  label: string;
  antes: string;
  despues: string;
};

/** Formato ISO yyyy-MM-dd → dd/MM/yyyy (para mostrar fechas). */
function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const v = String(iso).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

type Snap = Record<string, unknown> | null;

/**
 * Resuelve las diferencias entre antes/después a un arreglo de `CambioRow`.
 * Sólo incluye campos que efectivamente cambiaron. Los IDs de empresa/plan
 * se resuelven a sus nombres en un solo round-trip por tipo.
 */
export async function resolverCambios(
  antes: Snap,
  despues: Snap,
): Promise<CambioRow[]> {
  if (!antes || !despues) return [];

  const empresaIds = new Set<string>();
  const planIds = new Set<string>();

  for (const s of [antes, despues]) {
    if (typeof s.empresaId === 'string') empresaIds.add(s.empresaId);
    if (typeof s.planSgssId === 'string') planIds.add(s.planSgssId);
  }

  const [empresas, planes] = await Promise.all([
    empresaIds.size > 0
      ? prisma.empresa.findMany({
          where: { id: { in: Array.from(empresaIds) } },
          select: { id: true, nombre: true, nit: true },
        })
      : Promise.resolve([]),
    planIds.size > 0
      ? prisma.planSgss.findMany({
          where: { id: { in: Array.from(planIds) } },
          select: { id: true, codigo: true, nombre: true },
        })
      : Promise.resolve([]),
  ]);

  const empresaMap = new Map(
    empresas.map((e) => [e.id, `${e.nombre} (NIT ${e.nit})`]),
  );
  const planMap = new Map(
    planes.map((p) => [p.id, `${p.codigo} · ${p.nombre}`]),
  );

  const resolveValor = (
    campo: CambioRow['campo'],
    v: unknown,
  ): string => {
    if (v == null || v === '') return '—';
    switch (campo) {
      case 'empresaId':
        return empresaMap.get(String(v)) ?? '—';
      case 'planSgssId':
        return planMap.get(String(v)) ?? '—';
      case 'fechaIngreso':
        return fmtFecha(String(v));
      case 'estado':
        return String(v) === 'ACTIVA' ? 'Activa' : 'Inactiva';
      case 'nivelRiesgo':
        return String(v);
      default:
        return String(v);
    }
  };

  const plan: Array<[CambioRow['campo'], string]> = [
    ['estado', 'Estado'],
    ['fechaIngreso', 'Fecha ingreso'],
    ['empresaId', 'Empresa'],
    ['nivelRiesgo', 'Nivel ARL'],
    ['planSgssId', 'Plan SGSS'],
  ];

  const out: CambioRow[] = [];
  for (const [campo, label] of plan) {
    const a = antes[campo];
    const d = despues[campo];
    if (a === d) continue;
    out.push({
      campo,
      label,
      antes: resolveValor(campo, a),
      despues: resolveValor(campo, d),
    });
  }
  return out;
}
