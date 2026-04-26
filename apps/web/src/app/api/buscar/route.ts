import { NextResponse } from 'next/server';
import { prisma } from '@pila/db';
import { auth } from '@/auth';
import { getUserScope } from '@/lib/sucursal-scope';

export const dynamic = 'force-dynamic';

/**
 * GET /api/buscar?q=<texto>
 *
 * Buscador global que cruza varios módulos:
 *   - Cotizantes (número doc, primer apellido, primer nombre, ID)
 *   - Empresas planilla (NIT, nombre)
 *   - Empresa CC (código CCB-, NIT, razón social)
 *   - Comprobantes (consecutivo CMP-)
 *   - Planillas (consecutivo PLN-)
 *   - Consolidados de cartera (consecutivo CC-)
 *   - Incapacidades (consecutivo INC-)
 *   - Asesores comerciales (código AS-, nombre)
 *
 * Cada resultado trae `{ tipo, titulo, subtitulo, href }` para que el
 * cliente lo renderee de forma uniforme.
 *
 * Scope:
 *   - Staff (ADMIN/SOPORTE) ve todo el sistema.
 *   - SUCURSAL solo ve los recursos de su sucursal.
 *
 * Limita a un máximo de 5 resultados por categoría para mantener la UI
 * compacta. Si querés más, hacé click en "Ver todos" desde la categoría.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ groups: [] }, { status: 401 });
  }
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) {
    return NextResponse.json({ groups: [] });
  }

  const scope = await getUserScope();
  const esStaff = scope?.tipo === 'STAFF';
  const sucursalId = scope?.tipo === 'SUCURSAL' ? scope.sucursalId : null;

  // Helper: filtro por sucursal cuando aplica.
  const sucursalFilter = <T extends Record<string, unknown>>(extra: T): T =>
    sucursalId ? ({ ...extra, sucursalId } as T) : extra;

  const TAKE = 5;
  const ci = (val: string) => ({ contains: val, mode: 'insensitive' as const });

  // Las queries corren en paralelo. Cada bloque es independiente.
  const [
    cotizantes,
    empresas,
    cuentasCobro,
    comprobantes,
    planillas,
    consolidados,
    incapacidades,
    asesores,
  ] = await Promise.all([
    // Cotizantes
    prisma.cotizante.findMany({
      where: {
        ...(sucursalId ? { sucursalId } : {}),
        OR: [
          { numeroDocumento: ci(q) },
          { primerApellido: ci(q) },
          { primerNombre: ci(q) },
          { segundoApellido: ci(q) },
        ],
      },
      take: TAKE,
      select: {
        id: true,
        tipoDocumento: true,
        numeroDocumento: true,
        primerNombre: true,
        primerApellido: true,
        segundoApellido: true,
      },
    }),

    // Empresas planilla
    prisma.empresa.findMany({
      where: {
        OR: [{ nit: ci(q) }, { nombre: ci(q) }],
      },
      take: TAKE,
      select: { id: true, nit: true, nombre: true },
    }),

    // Cuenta de cobro (Empresa CC)
    prisma.cuentaCobro.findMany({
      where: {
        ...(sucursalId ? { sucursalId } : {}),
        OR: [{ codigo: ci(q) }, { nit: ci(q) }, { razonSocial: ci(q) }],
      },
      take: TAKE,
      select: {
        id: true,
        codigo: true,
        razonSocial: true,
        nit: true,
        sucursal: { select: { codigo: true } },
      },
    }),

    // Comprobantes — solo busca por consecutivo (lo más útil del usuario)
    prisma.comprobante.findMany({
      where: {
        consecutivo: ci(q),
        ...(sucursalId
          ? {
              OR: [
                { cotizante: { sucursalId } },
                { cuentaCobro: { sucursalId } },
                { asesorComercial: { OR: [{ sucursalId: null }, { sucursalId }] } },
              ],
            }
          : {}),
      },
      take: TAKE,
      select: {
        id: true,
        consecutivo: true,
        tipo: true,
        agrupacion: true,
        totalGeneral: true,
        periodo: { select: { anio: true, mes: true } },
      },
    }),

    // Planillas
    prisma.planilla.findMany({
      where: {
        consecutivo: ci(q),
        ...sucursalFilter({}),
      },
      take: TAKE,
      select: {
        id: true,
        consecutivo: true,
        tipoPlanilla: true,
        estado: true,
        periodoAporteAnio: true,
        periodoAporteMes: true,
      },
    }),

    // Cartera consolidados
    prisma.carteraConsolidado.findMany({
      where: {
        OR: [{ consecutivo: ci(q) }, { entidadNombre: ci(q) }, { empresaNit: ci(q) }],
      },
      take: TAKE,
      select: {
        id: true,
        consecutivo: true,
        entidadNombre: true,
        empresaRazonSocial: true,
        cantidadRegistros: true,
        estado: true,
      },
    }),

    // Incapacidades
    prisma.incapacidad.findMany({
      where: {
        consecutivo: ci(q),
        ...(sucursalId ? { sucursalId } : {}),
      },
      take: TAKE,
      select: {
        id: true,
        consecutivo: true,
        tipo: true,
        estado: true,
        cotizante: {
          select: { primerNombre: true, primerApellido: true, numeroDocumento: true },
        },
      },
    }),

    // Asesores comerciales
    prisma.asesorComercial.findMany({
      where: {
        ...(sucursalId ? { OR: [{ sucursalId: null }, { sucursalId }] } : {}),
        AND: {
          OR: [{ codigo: ci(q) }, { nombre: ci(q) }],
        },
      },
      take: TAKE,
      select: { id: true, codigo: true, nombre: true },
    }),
  ]);

  type ResultItem = {
    id: string;
    titulo: string;
    subtitulo: string;
    href: string;
  };
  type ResultGroup = {
    tipo: string;
    label: string;
    items: ResultItem[];
  };
  const groups: ResultGroup[] = [];

  if (cotizantes.length > 0) {
    groups.push({
      tipo: 'cotizante',
      label: 'Cotizantes',
      items: cotizantes.map((c) => ({
        id: c.id,
        titulo: [c.primerNombre, c.primerApellido, c.segundoApellido].filter(Boolean).join(' '),
        subtitulo: `${c.tipoDocumento} ${c.numeroDocumento}`,
        href: `/admin/base-datos?q=${encodeURIComponent(c.numeroDocumento)}`,
      })),
    });
  }

  if (empresas.length > 0 && esStaff) {
    groups.push({
      tipo: 'empresa',
      label: 'Empresas planilla',
      items: empresas.map((e) => ({
        id: e.id,
        titulo: e.nombre,
        subtitulo: `NIT ${e.nit}`,
        href: `/admin/empresas/${e.id}`,
      })),
    });
  }

  if (cuentasCobro.length > 0) {
    groups.push({
      tipo: 'cuenta-cobro',
      label: 'Empresa CC',
      items: cuentasCobro.map((c) => ({
        id: c.id,
        titulo: c.razonSocial,
        subtitulo: `${c.codigo}${c.nit ? ` · NIT ${c.nit}` : ''}${c.sucursal ? ` · ${c.sucursal.codigo}` : ''}`,
        href: '/admin/cuentas-cobro',
      })),
    });
  }

  if (comprobantes.length > 0) {
    groups.push({
      tipo: 'comprobante',
      label: 'Comprobantes',
      items: comprobantes.map((c) => ({
        id: c.id,
        titulo: c.consecutivo,
        subtitulo: `${c.tipo} · ${c.agrupacion} · ${c.periodo.anio}-${String(c.periodo.mes).padStart(2, '0')} · $${Number(c.totalGeneral).toLocaleString('es-CO')}`,
        href: `/admin/transacciones/historial?q=${encodeURIComponent(c.consecutivo)}`,
      })),
    });
  }

  if (planillas.length > 0) {
    groups.push({
      tipo: 'planilla',
      label: 'Planillas',
      items: planillas.map((p) => ({
        id: p.id,
        titulo: p.consecutivo,
        subtitulo: `Tipo ${p.tipoPlanilla} · ${p.estado} · ${p.periodoAporteAnio}-${String(p.periodoAporteMes).padStart(2, '0')}`,
        href: '/admin/planos',
      })),
    });
  }

  if (consolidados.length > 0 && esStaff) {
    groups.push({
      tipo: 'cartera-consolidado',
      label: 'Cartera (consolidados)',
      items: consolidados.map((c) => ({
        id: c.id,
        titulo: c.consecutivo,
        subtitulo: `${c.entidadNombre} · ${c.empresaRazonSocial} · ${c.cantidadRegistros} líneas`,
        href: `/admin/soporte/cartera/${c.id}`,
      })),
    });
  }

  if (incapacidades.length > 0) {
    groups.push({
      tipo: 'incapacidad',
      label: 'Incapacidades',
      items: incapacidades.map((i) => ({
        id: i.id,
        titulo: i.consecutivo,
        subtitulo: `${i.tipo.replaceAll('_', ' ').toLowerCase()} · ${i.estado} · ${i.cotizante.primerNombre} ${i.cotizante.primerApellido} (${i.cotizante.numeroDocumento})`,
        href: esStaff
          ? '/admin/soporte/incapacidades'
          : '/admin/administrativo/incapacidades?tab=historico',
      })),
    });
  }

  if (asesores.length > 0) {
    groups.push({
      tipo: 'asesor',
      label: 'Asesores comerciales',
      items: asesores.map((a) => ({
        id: a.id,
        titulo: a.nombre,
        subtitulo: a.codigo,
        href: '/admin/catalogos/asesores',
      })),
    });
  }

  return NextResponse.json({ groups });
}
