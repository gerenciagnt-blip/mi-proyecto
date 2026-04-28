/**
 * Layout con slot paralelo `@modal` para Intercepting Routes.
 */

export default function SoporteJuridicoLayout({
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
