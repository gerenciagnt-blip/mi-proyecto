'use client';

/**
 * Mapa de Colombia con marcadores en los departamentos donde Sistema
 * PILA tiene presencia. SVG inline (sin librerías de mapas), silueta
 * simplificada del país + 6 puntos destacados con halo pulsante y
 * tooltip al hover.
 *
 * No es un mapa cartográfico exacto — es una representación
 * estilizada que comunica la presencia regional sin agregar pesos
 * de librerías geo (~5KB inline vs ~150KB con leaflet/react-simple-maps).
 *
 * El path de la silueta usa coordenadas aproximadas dentro de un
 * viewBox 500×600 (ratio 5:6 típico del país norte-sur). Si en el
 * futuro se necesita un mapa cartográfico real, reemplazar el path
 * de `outline` por uno de un GeoJSON de Colombia simplificado.
 */

type Departamento = {
  /** Slug interno (no se muestra). */
  id: string;
  /** Nombre legible. */
  nombre: string;
  /** Ciudad principal del departamento. */
  ciudad: string;
  /** Coordenadas aproximadas en el viewBox 500×600 del SVG. */
  cx: number;
  cy: number;
  /** Si es la sede principal (se destaca con tono distinto). */
  sede?: boolean;
};

const DEPARTAMENTOS: Departamento[] = [
  { id: 'risaralda', nombre: 'Risaralda', ciudad: 'Pereira', cx: 196, cy: 326, sede: true },
  { id: 'caldas', nombre: 'Caldas', ciudad: 'Manizales', cx: 215, cy: 312 },
  { id: 'quindio', nombre: 'Quindío', ciudad: 'Armenia', cx: 200, cy: 342 },
  { id: 'valle', nombre: 'Valle del Cauca', ciudad: 'Cali', cx: 168, cy: 374 },
  { id: 'antioquia', nombre: 'Antioquia', ciudad: 'Medellín', cx: 188, cy: 252 },
  { id: 'bogota', nombre: 'Bogotá D.C.', ciudad: 'Bogotá', cx: 252, cy: 348 },
];

/**
 * Path simplificado de la silueta de Colombia. ~30 puntos del contorno
 * exterior. No incluye divisiones internas — solo el outline para que
 * los marcadores se ubiquen sobre un país reconocible.
 */
const COLOMBIA_OUTLINE =
  'M 240 30 L 268 38 L 295 50 L 305 75 L 318 95 L 328 120 L 335 145 L 340 175 L 350 200 L 365 220 L 380 240 L 395 270 L 405 300 L 410 335 L 408 370 L 395 405 L 378 440 L 358 470 L 332 500 L 305 525 L 280 545 L 250 555 L 220 552 L 195 540 L 178 520 L 165 495 L 158 465 L 152 435 L 148 405 L 142 375 L 135 350 L 122 325 L 108 305 L 95 280 L 88 250 L 92 225 L 105 200 L 122 175 L 138 150 L 152 125 L 165 100 L 178 78 L 192 60 L 210 45 L 225 35 Z';

export function ColombiaMap() {
  return (
    <div className="relative">
      {/* Mapa SVG */}
      <div className="relative mx-auto aspect-[5/6] max-w-md">
        <svg
          viewBox="0 0 500 600"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full"
          aria-label="Mapa de Colombia con departamentos donde Sistema PILA tiene presencia"
        >
          {/* Silueta del país */}
          <path
            d={COLOMBIA_OUTLINE}
            fill="rgb(241 245 249)"
            stroke="rgb(203 213 225)"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Marcadores: halo pulsante + punto sólido + label */}
          {DEPARTAMENTOS.map((d) => {
            const color = d.sede ? '#1C4E80' : '#2F80ED';
            return (
              <g key={d.id} className="group cursor-pointer">
                {/* Halo pulsante (animación CSS pura) */}
                <circle
                  cx={d.cx}
                  cy={d.cy}
                  r={14}
                  fill={color}
                  opacity="0.25"
                  className="origin-center animate-ping"
                  style={{ animationDuration: '2s' }}
                />
                {/* Anillo intermedio */}
                <circle cx={d.cx} cy={d.cy} r={9} fill={color} opacity="0.45" />
                {/* Punto central */}
                <circle
                  cx={d.cx}
                  cy={d.cy}
                  r={5}
                  fill={color}
                  className="transition-transform duration-300 group-hover:scale-150"
                />
                {/* Tooltip al hover (visible solo en desktop) */}
                <g className="pointer-events-none opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <rect
                    x={d.cx - 60}
                    y={d.cy - 42}
                    width="120"
                    height="28"
                    rx="6"
                    fill="rgb(15 23 42)"
                  />
                  <text
                    x={d.cx}
                    y={d.cy - 28}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill="white"
                  >
                    {d.nombre}
                  </text>
                  <text
                    x={d.cx}
                    y={d.cy - 18}
                    textAnchor="middle"
                    fontSize="9"
                    fill="rgb(148 163 184)"
                  >
                    {d.ciudad}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

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
