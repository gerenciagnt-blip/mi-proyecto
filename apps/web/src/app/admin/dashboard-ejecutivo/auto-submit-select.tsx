'use client';

/**
 * `<select>` que dispara `form.submit()` al cambiar de valor. Se usa
 * en los filtros del dashboard para no requerir un botón de "aplicar".
 *
 * Es un mini Client Component aislado para que la página padre
 * (`page.tsx`) pueda seguir siendo Server Component y hacer queries
 * Prisma directas sin marcarse `'use client'`.
 */
export function AutoSubmitSelect({
  name,
  defaultValue,
  className,
  children,
}: {
  name: string;
  defaultValue: string | number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      onChange={(e) => e.currentTarget.form?.submit()}
      className={className}
    >
      {children}
    </select>
  );
}
