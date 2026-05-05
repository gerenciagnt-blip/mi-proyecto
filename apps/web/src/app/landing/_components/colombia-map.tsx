'use client';

/**
 * Mapa de Colombia con los 32 departamentos como paths individuales.
 * Resalta los departamentos donde Sistema PILA tiene presencia.
 *
 * SVG real (no estilizado) bajado de github.com/VictorCazanave/svg-maps
 * — viewBox 613×694, ~53KB. Cada departamento tiene `id` con código de
 * 3 letras y `aria-label` con el nombre completo.
 *
 * El SVG se carga vía fetch al `public/colombia-departamentos.svg`,
 * se inyecta inline con dangerouslySetInnerHTML, y se aplican clases
 * CSS a los paths por ID. No requiere SVGR ni librería de mapas.
 */

import { useEffect, useRef, useState } from 'react';

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

export function ColombiaMap() {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [hover, setHover] = useState<DepartamentoActivo | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Carga del SVG raw — se cachea por el browser.
  useEffect(() => {
    fetch('/colombia-departamentos.svg')
      .then((r) => r.text())
      .then(setSvgContent)
      .catch(() => setSvgContent(''));
  }, []);

  // Aplica clases / fills por ID después de inyectar el SVG en el DOM.
  useEffect(() => {
    if (!svgContent || !containerRef.current) return;
    const root = containerRef.current.querySelector('svg');
    if (!root) return;

    // Default: gris claro a todos los paths.
    root.querySelectorAll('path').forEach((path) => {
      const id = path.getAttribute('id');
      if (!id) return;
      const isActive = ACTIVE_IDS.has(id);
      const isSede = id === SEDE_ID;
      path.setAttribute('fill', isSede ? '#1C4E80' : isActive ? '#2F80ED' : '#E2E8F0');
      path.setAttribute('stroke', '#FFFFFF');
      path.setAttribute('stroke-width', '0.8');
      path.style.transition = 'fill 200ms ease-out, transform 200ms ease-out';
      path.style.cursor = isActive ? 'pointer' : 'default';
      if (isActive) {
        const dep = DEPARTAMENTOS.find((d) => d.id === id);
        path.addEventListener('mouseenter', () => {
          path.setAttribute(
            'fill',
            isSede ? '#0F3556' : '#1C4E80', // tono más oscuro al hover
          );
          if (dep) setHover(dep);
        });
        path.addEventListener('mouseleave', () => {
          path.setAttribute('fill', isSede ? '#1C4E80' : '#2F80ED');
          setHover(null);
        });
      }
    });

    // Que el SVG llene el contenedor.
    root.setAttribute('width', '100%');
    root.setAttribute('height', '100%');
    root.removeAttribute('xmlns:xlink');
  }, [svgContent]);

  return (
    <div className="relative">
      {/* Mapa — render condicional: skeleton mientras carga, SVG inline cuando ya está */}
      <div className="relative mx-auto aspect-[613/694] max-w-md">
        {svgContent ? (
          <div
            ref={containerRef}
            className="h-full w-full"
            // dangerouslySetInnerHTML es seguro acá: el contenido viene
            // de /public/ (controlado por nosotros), no de input de
            // usuario. Y NO se mezcla con children — eso causaba el
            // error "Can only set one of children or props.dangerouslySetInnerHTML".
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Cargando mapa…
          </div>
        )}
      </div>

      {/* Tooltip flotante encima del mapa con el hover actual */}
      {hover && (
        <div className="pointer-events-none absolute right-2 top-2 rounded-lg bg-slate-900 px-3 py-1.5 text-white shadow-lg">
          <p className="text-[11px] font-bold">{hover.nombre}</p>
          <p className="text-[9px] text-slate-300">{hover.ciudad}</p>
        </div>
      )}

      {/* Lista de departamentos debajo del mapa */}
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
