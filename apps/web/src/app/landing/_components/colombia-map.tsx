'use client';

/**
 * Mapa de Colombia con los 32 departamentos como paths individuales.
 * Resalta los departamentos donde Sistema PILA tiene presencia.
 *
 * SVG real (no estilizado) bajado de github.com/VictorCazanave/svg-maps
 * — viewBox 613×694, ~53KB. Cada departamento tiene `id` con código de
 * 3 letras y `aria-label` con el nombre completo.
 *
 * Arquitectura del fix de re-render:
 * - <MapaSvgInner /> está memoizado con React.memo y recibe el HTML del
 *   SVG + callback onHover (con useCallback en el padre, ref estable).
 * - Solo se re-renderiza cuando cambia el SVG (1 vez al cargar).
 * - El padre tiene el state `hover` para el tooltip — al cambiar,
 *   re-renderea solo el tooltip, NO el SVG.
 * - Sin memo, React reconcilia el `dangerouslySetInnerHTML` y borra
 *   los `setAttribute('fill', ...)` que aplicó el useEffect → todos
 *   los paths quedan negros (bug visible al hacer hover).
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';

type DepartamentoActivo = {
  /** ID del path en el SVG (3 letras lowercase). */
  id: string;
  /** Nombre legible (Title Case). */
  nombre: string;
  /** Ciudad principal. */
  ciudad: string;
  /** Si es la sede principal. */
  sede?: boolean;
};

const DEPARTAMENTOS: DepartamentoActivo[] = [
  { id: 'ris', nombre: 'Risaralda', ciudad: 'Pereira', sede: true },
  { id: 'cal', nombre: 'Caldas', ciudad: 'Manizales' },
  { id: 'qui', nombre: 'Quindío', ciudad: 'Armenia' },
  { id: 'vac', nombre: 'Valle del Cauca', ciudad: 'Cali' },
  { id: 'ant', nombre: 'Antioquia', ciudad: 'Medellín' },
  { id: 'dc', nombre: 'Bogotá D.C.', ciudad: 'Bogotá' },
];

const ACTIVE_IDS = new Set(DEPARTAMENTOS.map((d) => d.id));
const SEDE_ID = DEPARTAMENTOS.find((d) => d.sede)?.id;

const COLOR_INACTIVE = '#E2E8F0'; // slate-200
const COLOR_ACTIVE = '#2F80ED'; // brand-blue
const COLOR_SEDE = '#1C4E80'; // brand-blue-dark
const COLOR_HOVER_ACTIVE = '#1C4E80';
const COLOR_HOVER_SEDE = '#0F3556';

/**
 * Componente memoizado que monta el SVG y aplica fills + listeners.
 * SOLO re-renderea cuando svgContent cambia (1 vez después del fetch).
 */
const MapaSvgInner = memo(function MapaSvgInner({
  svgContent,
  onHover,
}: {
  svgContent: string;
  onHover: (dep: DepartamentoActivo | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const root = ref.current.querySelector('svg');
    if (!root) return;

    root.setAttribute('width', '100%');
    root.setAttribute('height', '100%');
    root.removeAttribute('xmlns:xlink');

    const cleanups: Array<() => void> = [];

    root.querySelectorAll('path').forEach((path) => {
      const id = path.getAttribute('id');
      if (!id) return;
      const isActive = ACTIVE_IDS.has(id);
      const isSede = id === SEDE_ID;
      const baseColor = isSede ? COLOR_SEDE : isActive ? COLOR_ACTIVE : COLOR_INACTIVE;
      const hoverColor = isSede ? COLOR_HOVER_SEDE : COLOR_HOVER_ACTIVE;

      path.setAttribute('fill', baseColor);
      path.setAttribute('stroke', '#FFFFFF');
      path.setAttribute('stroke-width', '0.8');
      path.style.transition = 'fill 200ms ease-out';
      path.style.cursor = isActive ? 'pointer' : 'default';

      if (isActive) {
        const dep = DEPARTAMENTOS.find((d) => d.id === id) ?? null;
        const onEnter = () => {
          path.setAttribute('fill', hoverColor);
          onHover(dep);
        };
        const onLeave = () => {
          path.setAttribute('fill', baseColor);
          onHover(null);
        };
        path.addEventListener('mouseenter', onEnter);
        path.addEventListener('mouseleave', onLeave);
        cleanups.push(() => {
          path.removeEventListener('mouseenter', onEnter);
          path.removeEventListener('mouseleave', onLeave);
        });
      }
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [svgContent, onHover]);

  return (
    <div
      ref={ref}
      className="h-full w-full"
      // Seguro: contenido viene de /public/, no de input de usuario.
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
});

export function ColombiaMap() {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [hover, setHover] = useState<DepartamentoActivo | null>(null);

  // Carga del SVG — el browser lo cachea.
  useEffect(() => {
    fetch('/colombia-departamentos.svg')
      .then((r) => r.text())
      .then(setSvgContent)
      .catch(() => setSvgContent(''));
  }, []);

  // useCallback: la referencia del callback se mantiene estable entre
  // re-renders del padre (cuando cambia el hover). Eso permite que
  // React.memo del MapaSvgInner detecte que las props NO cambiaron y
  // saltee el re-render → preserva los setAttribute aplicados al DOM.
  const handleHover = useCallback((dep: DepartamentoActivo | null) => {
    setHover(dep);
  }, []);

  return (
    <div className="relative">
      <div className="relative mx-auto aspect-[613/694] max-w-md">
        {svgContent ? (
          <MapaSvgInner svgContent={svgContent} onHover={handleHover} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Cargando mapa…
          </div>
        )}
      </div>

      {hover && (
        <div className="pointer-events-none absolute right-2 top-2 rounded-lg bg-slate-900 px-3 py-1.5 text-white shadow-lg">
          <p className="text-[11px] font-bold">{hover.nombre}</p>
          <p className="text-[9px] text-slate-300">{hover.ciudad}</p>
        </div>
      )}

      <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        {DEPARTAMENTOS.map((d) => (
          <li key={d.id} className="flex items-center gap-2">
            <span
              className={`inline-flex h-2 w-2 shrink-0 rounded-full ${
                d.sede ? 'bg-brand-blue-dark' : 'bg-brand-blue'
              }`}
            />
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">{d.nombre}</p>
              <p className="truncate text-[10px] text-slate-500">
                {d.ciudad}
                {d.sede && (
                  <span className="ml-1 rounded bg-brand-blue-dark/10 px-1 text-[9px] font-bold uppercase text-brand-blue-dark">
                    Sede
                  </span>
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
