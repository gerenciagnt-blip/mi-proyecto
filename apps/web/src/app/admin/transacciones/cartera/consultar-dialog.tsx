'use client';

import { useState } from 'react';
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const pctFmt = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n) + '%';

export type ConsultaCotizante = {
  cotizante: {
    tipoDocumento: string;
    numeroDocumento: string;
    nombreCompleto: string;
    email: string | null;
    telefono: string | null;
    celular: string | null;
    direccion: string | null;
    ciudad: string | null;
  };
  afiliaciones: Array<{
    id: string;
    empresaPlanilla: string | null;
    empresaCC: string | null;
    asesor: string | null;
    modalidad: 'DEPENDIENTE' | 'INDEPENDIENTE';
    nivelRiesgo: string;
    salario: number;
    plan: string | null;
    entidades: {
      eps: string | null;
      afp: string | null;
      arl: string | null;
      ccf: string | null;
    };
    // Preview del motor
    ibc: number;
    dias: number;
    totalSgss: number;
    totalAdmon: number;
    totalServicios: number;
    totalGeneral: number;
    conceptos: Array<{
      concepto: string;
      subconcepto: string | null;
      porcentaje: number;
      valor: number;
    }>;
  }>;
  totalGeneral: number;
};

export function ConsultarCotizanteButton({
  data,
}: {
  data: ConsultaCotizante;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        title="Consultar"
        onClick={() => setOpen(true)}
        className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      >
        <Eye className="h-3.5 w-3.5" />
      </button>
      {open && (
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title={data.cotizante.nombreCompleto}
          description={`${data.cotizante.tipoDocumento} ${data.cotizante.numeroDocumento}`}
          size="lg"
        >
          <div className="space-y-4">
            {/* Contacto */}
            <section className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-4">
              <Info label="Correo" value={data.cotizante.email ?? '—'} />
              <Info
                label="Celular"
                value={data.cotizante.celular ?? data.cotizante.telefono ?? '—'}
              />
              <Info
                label="Ciudad"
                value={data.cotizante.ciudad ?? '—'}
              />
              <Info
                label="Dirección"
                value={data.cotizante.direccion ?? '—'}
              />
            </section>

            {/* Afiliaciones */}
            {data.afiliaciones.map((a, idx) => (
              <section
                key={a.id}
                className="overflow-hidden rounded-lg border border-slate-200"
              >
                <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold">
                      Afiliación {idx + 1}
                      <span
                        className={cn(
                          'ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium',
                          a.modalidad === 'DEPENDIENTE'
                            ? 'bg-sky-100 text-sky-700'
                            : 'bg-amber-100 text-amber-700',
                        )}
                      >
                        {a.modalidad === 'DEPENDIENTE' ? 'Dep.' : 'Indep.'}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {a.plan ? `Plan ${a.plan} · ` : ''}Nivel {a.nivelRiesgo} · Salario{' '}
                      {copFmt.format(a.salario)}
                    </p>
                  </div>
                  <p className="font-mono text-sm font-bold text-brand-blue-dark">
                    {copFmt.format(a.totalGeneral)}
                  </p>
                </header>

                <div className="grid grid-cols-2 gap-2 p-3 text-xs sm:grid-cols-4">
                  <Info label="Empresa planilla" value={a.empresaPlanilla ?? '—'} />
                  <Info label="Empresa CC" value={a.empresaCC ?? '—'} />
                  <Info label="Asesor" value={a.asesor ?? '—'} />
                  <Info
                    label="IBC · Días"
                    value={`${copFmt.format(a.ibc)} · ${a.dias}`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50/50 p-3 text-xs sm:grid-cols-4">
                  <Info label="EPS" value={a.entidades.eps ?? '—'} />
                  <Info label="AFP" value={a.entidades.afp ?? '—'} />
                  <Info label="ARL" value={a.entidades.arl ?? '—'} />
                  <Info label="CCF" value={a.entidades.ccf ?? '—'} />
                </div>

                {/* Desglose por concepto */}
                {a.conceptos.length > 0 && (
                  <div className="border-t border-slate-100 p-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Detalle a facturar
                    </p>
                    <div className="overflow-hidden rounded-md border border-slate-200">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-400">
                          <tr>
                            <th className="px-3 py-1.5">Concepto</th>
                            <th className="px-3 py-1.5">Subconcepto</th>
                            <th className="px-3 py-1.5 text-right">%</th>
                            <th className="px-3 py-1.5 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {a.conceptos.map((c, i) => (
                            <tr key={i}>
                              <td className="px-3 py-1.5 font-medium">{c.concepto}</td>
                              <td className="px-3 py-1.5 text-slate-600">
                                {c.subconcepto ?? '—'}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono text-slate-600">
                                {pctFmt(c.porcentaje)}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono font-semibold">
                                {copFmt.format(c.valor)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-2 flex justify-end gap-4 text-xs">
                      <span>
                        <span className="text-slate-500">SGSS: </span>
                        <span className="font-mono font-semibold">
                          {copFmt.format(a.totalSgss)}
                        </span>
                      </span>
                      <span>
                        <span className="text-slate-500">Admón: </span>
                        <span className="font-mono font-semibold">
                          {copFmt.format(a.totalAdmon)}
                        </span>
                      </span>
                      <span>
                        <span className="text-slate-500">Serv: </span>
                        <span className="font-mono font-semibold">
                          {copFmt.format(a.totalServicios)}
                        </span>
                      </span>
                    </div>
                  </div>
                )}
              </section>
            ))}

            {/* Total consolidado */}
            <div className="rounded-lg border border-brand-blue/30 bg-brand-blue/5 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">
                  Total a facturar en el período
                </p>
                <p className="font-mono text-2xl font-bold text-brand-blue-dark">
                  {copFmt.format(data.totalGeneral)}
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>Cerrar</Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 font-medium text-slate-800">{value}</p>
    </div>
  );
}
