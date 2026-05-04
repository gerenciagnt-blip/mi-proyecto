/**
 * Layout de la landing pública. No usa el admin shell — es un sitio
 * orientado a visitantes (empresas e independientes interesados en
 * el servicio). Mantiene la línea gráfica del admin (brand colors,
 * Montserrat headings) pero con jerarquía editorial: tipografía
 * mucho más grande, whitespace generoso, sin sidebar.
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sistema PILA — Tu seguridad social a un click',
  description:
    'Operador autorizado de PILA, ARL y cartera. Soluciones para empresas e independientes en Colombia.',
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-slate-900">{children}</div>;
}
