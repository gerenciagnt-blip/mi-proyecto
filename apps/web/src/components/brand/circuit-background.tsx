/**
 * Fondo decorativo con trazos de circuito animados.
 *
 * Se renderiza como dos SVGs absolutos en las esquinas superior-izquierda e
 * inferior-derecha, con trazos que salen del borde hacia el interior (estilo
 * PCB). Cada path se anima con stroke-dasharray para simular corriente
 * viajando. Los nodos en los giros pulsan opacidad.
 *
 * - Mantiene intacto el gradiente de fondo original.
 * - Semitransparente (opacity 0.35 por defecto) para no competir con el
 *   contenido central.
 * - pointer-events: none → no afecta la interacción del usuario.
 * - Se oculta en <sm para no saturar la pantalla en móvil.
 */
export function CircuitBackground() {
  return (
    <>
      {/* SVG esquina superior-izquierda */}
      <svg
        aria-hidden
        viewBox="0 0 640 520"
        preserveAspectRatio="xMinYMin meet"
        className="pointer-events-none absolute left-0 top-0 hidden h-[50vh] w-[55vw] sm:block lg:h-[60vh] lg:w-[48vw]"
      >
        <defs>
          <linearGradient id="circuitGradTL" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2F80ED" />
            <stop offset="60%" stopColor="#27AE60" />
            <stop offset="100%" stopColor="#31DFDE" />
          </linearGradient>
        </defs>
        <g
          fill="none"
          stroke="url(#circuitGradTL)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="circuit-traces"
        >
          {/* Trace 1 — horizontal que baja en L */}
          <path d="M 0 80 L 180 80 L 180 40 L 340 40" />
          {/* Trace 2 — bifurcación descendente */}
          <path d="M 0 200 L 120 200 L 120 260 L 260 260 L 260 320" />
          {/* Trace 3 — curva Y-arriba */}
          <path d="M 80 0 L 80 120 L 160 120 L 160 180" />
          {/* Trace 4 — diagonal escalonada */}
          <path d="M 0 380 L 90 380 L 90 440 L 220 440 L 220 480" />
          {/* Trace 5 — zigzag */}
          <path d="M 260 0 L 260 70 L 400 70 L 400 140 L 520 140" />
          {/* Trace 6 — horizontal alto */}
          <path d="M 400 0 L 400 40 L 600 40" />
          {/* Trace 7 — L larga abajo */}
          <path d="M 340 520 L 340 420 L 520 420 L 520 320" />
        </g>
        <g fill="#31DFDE" className="circuit-nodes">
          <circle cx="180" cy="40" r="3" />
          <circle cx="340" cy="40" r="3" />
          <circle cx="120" cy="260" r="3" />
          <circle cx="260" cy="320" r="3" />
          <circle cx="160" cy="180" r="3" />
          <circle cx="220" cy="480" r="3" />
          <circle cx="400" cy="140" r="3" />
          <circle cx="520" cy="320" r="3" />
        </g>
      </svg>

      {/* SVG esquina inferior-derecha (reflejo) */}
      <svg
        aria-hidden
        viewBox="0 0 640 520"
        preserveAspectRatio="xMaxYMax meet"
        className="pointer-events-none absolute bottom-0 right-0 hidden h-[50vh] w-[55vw] sm:block lg:h-[60vh] lg:w-[48vw]"
      >
        <defs>
          <linearGradient id="circuitGradBR" x1="1" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#27AE60" />
            <stop offset="60%" stopColor="#2F80ED" />
            <stop offset="100%" stopColor="#31DFDE" />
          </linearGradient>
        </defs>
        <g
          fill="none"
          stroke="url(#circuitGradBR)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="circuit-traces"
        >
          <path d="M 640 440 L 460 440 L 460 480 L 300 480" />
          <path d="M 640 320 L 520 320 L 520 260 L 380 260 L 380 200" />
          <path d="M 560 520 L 560 400 L 480 400 L 480 340" />
          <path d="M 640 140 L 550 140 L 550 80 L 420 80 L 420 40" />
          <path d="M 380 520 L 380 450 L 240 450 L 240 380 L 120 380" />
          <path d="M 240 520 L 240 480 L 40 480" />
          <path d="M 300 0 L 300 100 L 120 100 L 120 200" />
        </g>
        <g fill="#31DFDE" className="circuit-nodes">
          <circle cx="460" cy="440" r="3" />
          <circle cx="300" cy="480" r="3" />
          <circle cx="520" cy="320" r="3" />
          <circle cx="380" cy="200" r="3" />
          <circle cx="480" cy="340" r="3" />
          <circle cx="420" cy="40" r="3" />
          <circle cx="120" cy="380" r="3" />
          <circle cx="240" cy="480" r="3" />
          <circle cx="120" cy="200" r="3" />
        </g>
      </svg>
    </>
  );
}
