'use client';

import { useTransition } from 'react';
import { updateTipoModalidadAction } from './actions';

type Modalidad = 'DEPENDIENTE' | 'INDEPENDIENTE';

export function ModalidadToggle({
  tipoId,
  current,
}: {
  tipoId: string;
  current: Modalidad;
}) {
  const [pending, start] = useTransition();

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as Modalidad;
    if (val === current) return;
    start(async () => {
      await updateTipoModalidadAction(tipoId, val);
    });
  };

  const cls =
    current === 'DEPENDIENTE'
      ? 'bg-sky-50 text-sky-700 ring-sky-200'
      : 'bg-amber-50 text-amber-700 ring-amber-200';

  return (
    <select
      value={current}
      onChange={onChange}
      disabled={pending}
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset focus:outline-none focus:ring-2 focus:ring-brand-blue/40 disabled:cursor-wait disabled:opacity-60 ${cls}`}
    >
      <option value="DEPENDIENTE">Dep.</option>
      <option value="INDEPENDIENTE">Indep.</option>
    </select>
  );
}
