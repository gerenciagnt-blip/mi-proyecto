/**
 * Layout con slot paralelo `@modal` — habilita el patrón de
 * Intercepting Routes (Next 15). Cuando navegás a `/nuevo` desde la
 * lista, el slot se llena con el formulario como modal sin descartar
 * la página de listado. Refresh / URL directa cae a la página
 * `/nuevo/page.tsx` standalone.
 */

export default function ReporteAtLayout({
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
