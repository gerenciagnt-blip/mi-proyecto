/**
 * Layout con slot paralelo `@modal` — habilita el patrón de
 * Intercepting Routes (Next 15). Cuando navegás a `[id]` desde la
 * lista, el slot se llena con el detalle como modal sin descartar la
 * página de lista. Refresh / URL directa cae a la página full estándar.
 */

export default function SoporteIncapacidadesLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
