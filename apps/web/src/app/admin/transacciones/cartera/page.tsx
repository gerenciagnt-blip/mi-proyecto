import Link from 'next/link';
import { Wallet, Search, AlertCircle } from 'lucide-react';
import type { Prisma } from '@pila/db';
import { prisma } from '@pila/db';
import { calcularLiquidacion } from '@/lib/liquidacion/calcular';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  formatCOP,
  fullName,
  nombreCompleto as getNombreCompleto,
} from '@/lib/format';
import {
  puedeCerrarPeriodo,
  debeFacturarseEnPeriodo,
  opcionesFacturacion,
} from './helpers';
import {
  ConsultarCotizanteButton,
  type ConsultaCotizante,
} from './consultar-dialog';
import { GestionButton } from './gestion-dialog';
import { CerrarPeriodoButton } from './cerrar-periodo-button';

export const metadata = { title: 'Cartera de cotizantes — Sistema PILA' };
export const dynamic = 'force-dynamic';

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

type SP = { q?: string };

export default async function CarteraPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';

  // Período vigente = mes en curso
  const now = new Date();
  const anio = now.getFullYear();
  const mes = now.getMonth() + 1;
  const periodo = await prisma.periodoContable.findUnique({
    where: { anio_mes: { anio, mes } },
  });

  if (!periodo) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <Wallet className="h-6 w-6 text-brand-blue" />
            Cartera de cotizantes
          </h1>
        </header>
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            No hay período contable del mes en curso. Ve a{' '}
            <Link href="/admin/transacciones" className="underline">
              Transacción
            </Link>{' '}
            para inicializarlo.
          </span>
        </Alert>
      </div>
    );
  }

  // Cotizantes con MENSUALIDAD procesada y no anulada en el período.
  // Las vinculaciones/afiliaciones NO cuentan — un cotizante puede tener
  // su afiliación pagada y aún así aparecer en cartera por la mensualidad.
  const conFactura = await prisma.comprobante.findMany({
    where: {
      periodoId: periodo.id,
      agrupacion: 'INDIVIDUAL',
      tipo: 'MENSUALIDAD',
      estado: { not: 'ANULADO' },
      procesadoEn: { not: null },
    },
    select: { cotizanteId: true },
  });
  const facturadosIds = new Set(
    conFactura.map((c) => c.cotizanteId).filter((x): x is string => x != null),
  );

  // Filtro por nombre/documento
  const whereCot: Prisma.CotizanteWhereInput = {
    afiliaciones: { some: { estado: 'ACTIVA' } },
    id: { notIn: Array.from(facturadosIds) },
  };
  if (q) {
    whereCot.OR = [
      { numeroDocumento: { contains: q, mode: 'insensitive' } },
      { primerNombre: { contains: q, mode: 'insensitive' } },
      { segundoNombre: { contains: q, mode: 'insensitive' } },
      { primerApellido: { contains: q, mode: 'insensitive' } },
      { segundoApellido: { contains: q, mode: 'insensitive' } },
    ];
  }

  // Cargo cotizantes + afiliaciones + todo lo que el motor necesita, en un solo query
  const cotizantes = await prisma.cotizante.findMany({
    where: whereCot,
    orderBy: [{ primerApellido: 'asc' }, { primerNombre: 'asc' }],
    include: {
      afiliaciones: {
        where: { estado: 'ACTIVA' },
        include: {
          empresa: {
            select: {
              id: true,
              nombre: true,
              exoneraLey1607: true,
              arl: { select: { nombre: true } },
            },
          },
          cuentaCobro: { select: { razonSocial: true } },
          asesorComercial: { select: { nombre: true } },
          planSgss: {
            select: {
              codigo: true,
              nombre: true,
              incluyeEps: true,
              incluyeAfp: true,
              incluyeArl: true,
              incluyeCcf: true,
            },
          },
          eps: { select: { nombre: true } },
          afp: { select: { nombre: true } },
          arl: { select: { nombre: true } },
          ccf: { select: { nombre: true } },
          serviciosAdicionales: {
            include: {
              servicio: {
                select: { id: true, codigo: true, nombre: true, precio: true },
              },
            },
          },
        },
      },
      gestionesCartera: {
        where: { periodoId: periodo.id },
        select: { id: true },
      },
    },
  });

  // Tarifas + FSP — cargo una sola vez
  const [tarifas, fspRangos] = await Promise.all([
    prisma.tarifaSgss.findMany({ where: { active: true } }),
    prisma.fspRango.findMany({
      where: { active: true },
      orderBy: { smlvDesde: 'asc' },
    }),
  ]);

  // Cotizantes que YA tienen alguna mensualidad procesada en cualquier
  // período — para decidir si aplica la regla interna de ARL obligatoria.
  const cotIdsCartera = cotizantes.map((c) => c.id);
  const conMens =
    cotIdsCartera.length > 0
      ? await prisma.comprobante.findMany({
          where: {
            cotizanteId: { in: cotIdsCartera },
            tipo: 'MENSUALIDAD',
            estado: { not: 'ANULADO' },
            procesadoEn: { not: null },
          },
          select: { cotizanteId: true },
          distinct: ['cotizanteId'],
        })
      : [];
  const cotsConMens = new Set(
    conMens.map((r) => r.cotizanteId).filter((x): x is string => x != null),
  );

  type FilaCartera = {
    cotizanteId: string;
    tipoDoc: string;
    numDoc: string;
    nombre: string;
    nombreCompleto: string;
    modalidad: 'DEPENDIENTE' | 'INDEPENDIENTE';
    empresaPlanilla: string | null;
    empresaCC: string | null;
    asesor: string | null;
    fechaIngreso: string; // yyyy-mm-dd de la afiliación más reciente
    totalGeneral: number;
    gestionesCount: number;
    consulta: ConsultaCotizante;
  };

  const filas: FilaCartera[] = [];
  let totalGeneralCartera = 0;

  for (const c of cotizantes) {
    if (c.afiliaciones.length === 0) continue;

    // Aplica el filtro de temporalidad: solo incluir afiliaciones que DEBEN
    // facturarse en este período (según modalidad + formaPago).
    const afsElegibles = c.afiliaciones.filter((af) =>
      debeFacturarseEnPeriodo(
        {
          modalidad: af.modalidad,
          formaPago: af.formaPago,
          fechaIngreso: af.fechaIngreso,
        },
        { anio: periodo.anio, mes: periodo.mes },
      ),
    );
    if (afsElegibles.length === 0) continue;

    let totalCot = 0;
    const afilsConsulta: ConsultaCotizante['afiliaciones'] = [];

    // Para los campos de la tabla, tomamos la primera afiliación elegible
    const primera = afsElegibles[0];
    if (!primera) continue;

    const esPrimeraMens = !cotsConMens.has(c.id);

    for (const af of afsElegibles) {
      const opciones = opcionesFacturacion(
        {
          modalidad: af.modalidad,
          formaPago: af.formaPago,
          fechaIngreso: af.fechaIngreso,
        },
        { anio: periodo.anio, mes: periodo.mes },
      );

      const calc = calcularLiquidacion(
        {
          afiliacion: {
            id: af.id,
            modalidad: af.modalidad,
            nivelRiesgo: af.nivelRiesgo,
            salario: af.salario,
            valorAdministracion: af.valorAdministracion,
            fechaIngreso: af.fechaIngreso,
            empresa: af.empresa,
            planSgss: af.planSgss,
            eps: af.eps,
            afp: af.afp,
            arl: af.arl,
            ccf: af.ccf,
            serviciosAdicionales: af.serviciosAdicionales.map((s) => ({
              id: s.servicio.id,
              codigo: s.servicio.codigo,
              nombre: s.servicio.nombre,
              precio: s.servicio.precio,
            })),
          },
          periodo: { anio: periodo.anio, mes: periodo.mes },
          smlv: periodo.smlvSnapshot,
          forzarTipo: opciones.forzarTipo ?? 'MENSUALIDAD', // cartera = mensualidad
          aplicaArlObligatoria: esPrimeraMens,
        },
        tarifas,
        fspRangos,
      );
      if (!calc) continue;

      totalCot += calc.totalGeneral;

      afilsConsulta.push({
        id: af.id,
        empresaPlanilla: af.empresa?.nombre ?? null,
        empresaCC: af.cuentaCobro?.razonSocial ?? null,
        asesor: af.asesorComercial?.nombre ?? null,
        modalidad: af.modalidad,
        nivelRiesgo: af.nivelRiesgo,
        salario: Number(af.salario),
        plan: af.planSgss?.nombre ?? null,
        entidades: {
          eps: af.eps?.nombre ?? null,
          afp: af.afp?.nombre ?? null,
          arl:
            af.modalidad === 'DEPENDIENTE'
              ? af.empresa?.arl?.nombre ?? null
              : af.arl?.nombre ?? null,
          ccf: af.ccf?.nombre ?? null,
        },
        ibc: calc.ibc,
        dias: calc.diasCotizados,
        totalSgss: calc.totalSgss,
        totalAdmon: calc.totalAdmon,
        totalServicios: calc.totalServicios,
        totalGeneral: calc.totalGeneral,
        conceptos: calc.conceptos.map((x) => ({
          concepto: x.concepto,
          subconcepto: x.subconcepto ?? null,
          porcentaje: x.porcentaje,
          valor: x.valor,
        })),
      });
    }

    if (afilsConsulta.length === 0) continue;

    filas.push({
      cotizanteId: c.id,
      tipoDoc: c.tipoDocumento,
      numDoc: c.numeroDocumento,
      nombre: fullName(c),
      nombreCompleto: getNombreCompleto(c),
      modalidad: primera.modalidad,
      empresaPlanilla: primera.empresa?.nombre ?? null,
      empresaCC: primera.cuentaCobro?.razonSocial ?? null,
      asesor: primera.asesorComercial?.nombre ?? null,
      fechaIngreso: primera.fechaIngreso.toISOString().slice(0, 10),
      totalGeneral: totalCot,
      gestionesCount: c.gestionesCartera.length,
      consulta: {
        cotizante: {
          tipoDocumento: c.tipoDocumento,
          numeroDocumento: c.numeroDocumento,
          nombreCompleto: getNombreCompleto(c),
          email: c.email,
          telefono: c.telefono,
          celular: c.celular,
          direccion: c.direccion,
          ciudad: null, // municipio.nombre — se puede cargar si hace falta
        },
        afiliaciones: afilsConsulta,
        totalGeneral: totalCot,
      },
    });

    totalGeneralCartera += totalCot;
  }

  // Regla: si el período está CERRADO pero hay cotizantes pendientes de
  // mensualidad, lo reabrimos automáticamente. Un período con cartera
  // activa no debería estar cerrado.
  let periodoEstado: 'ABIERTO' | 'CERRADO' = periodo.estado;
  if (periodo.estado === 'CERRADO' && filas.length > 0) {
    await prisma.periodoContable.update({
      where: { id: periodo.id },
      data: { estado: 'ABIERTO', cerradoEn: null },
    });
    periodoEstado = 'ABIERTO';
  }

  // Cálculo "¿se puede cerrar?"
  const habilitadoCierre = puedeCerrarPeriodo({ anio: periodo.anio, mes: periodo.mes });
  const ultimoDia = new Date(periodo.anio, periodo.mes, 0);
  const diasRestantes = Math.max(
    0,
    Math.ceil((ultimoDia.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <Wallet className="h-6 w-6 text-brand-blue" />
            Cartera de cotizantes
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cotizantes sin factura de mensualidad en el período{' '}
            <span className="font-mono font-medium">
              {anio}-{String(mes).padStart(2, '0')}
            </span>{' '}
            ({MESES[mes - 1]}). Total estimado:{' '}
            <strong className="font-mono">
              {formatCOP(totalGeneralCartera)}
            </strong>
          </p>
        </div>
        {periodoEstado === 'ABIERTO' && (
          <CerrarPeriodoButton
            periodoId={periodo.id}
            periodoLabel={`${anio}-${String(mes).padStart(2, '0')}`}
            habilitado={habilitadoCierre}
            diasRestantes={diasRestantes}
            cotizantesPendientes={filas.length}
            totalPendiente={totalGeneralCartera}
          />
        )}
      </header>

      {/* Filtros */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <form
            method="GET"
            action="/admin/transacciones/cartera"
            className="flex flex-wrap items-center gap-2"
          >
            <div className="relative flex-1 min-w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Buscar por número de documento, nombres o apellidos…"
                className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400"
              />
            </div>
            <button
              type="submit"
              className="h-9 rounded-lg bg-brand-blue px-3 text-sm font-medium text-white hover:bg-brand-blue-dark"
            >
              Buscar
            </button>
            {q && (
              <Link
                href="/admin/transacciones/cartera"
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Limpiar
              </Link>
            )}
            <span className="ml-auto text-xs text-slate-500">
              {filas.length} {filas.length === 1 ? 'cotizante' : 'cotizantes'}
            </span>
          </form>
        </div>

        {filas.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-400">
            {q
              ? 'Sin resultados con la búsqueda actual.'
              : 'Toda la cartera del período está al día.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2">Tipo doc</th>
                  <th className="px-4 py-2">N° documento</th>
                  <th className="px-4 py-2">Nombre</th>
                  <th className="px-4 py-2">Modalidad</th>
                  <th className="px-4 py-2">Empresa planilla</th>
                  <th className="px-4 py-2">Empresa CC</th>
                  <th className="px-4 py-2">Asesor</th>
                  <th className="px-4 py-2">Fecha ingreso</th>
                  <th className="px-4 py-2 text-right">Total a pagar</th>
                  <th className="px-4 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filas.map((r) => (
                  <tr key={r.cotizanteId}>
                    <td className="px-4 py-2.5 font-mono text-xs">{r.tipoDoc}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{r.numDoc}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{r.nombre}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium',
                          r.modalidad === 'DEPENDIENTE'
                            ? 'bg-sky-100 text-sky-700'
                            : 'bg-amber-100 text-amber-700',
                        )}
                      >
                        {r.modalidad === 'DEPENDIENTE' ? 'Dep.' : 'Indep.'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {r.empresaPlanilla ?? (
                        <span className="italic text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {r.empresaCC ?? <span className="italic text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {r.asesor ?? <span className="italic text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                      {r.fechaIngreso}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold text-brand-blue-dark">
                      {formatCOP(r.totalGeneral)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <ConsultarCotizanteButton data={r.consulta} />
                        <GestionButton
                          cotizanteId={r.cotizanteId}
                          periodoId={periodo.id}
                          cotizanteNombre={r.nombreCompleto}
                          gestionesIniciales={r.gestionesCount}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
