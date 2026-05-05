'use client';

/**
 * Menú hamburguesa para mobile/tablet pequeño (<md). Despliega todos
 * los links del nav + CTAs principales (Ingresar al sistema y
 * Solicitar demo) que en desktop están directos en la barra superior.
 *
 * En md+ (768px+) este componente está oculto vía `md:hidden` —
 * el nav muestra los links inline.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X, ArrowRight, LogIn } from 'lucide-react';

const NAV_LINKS = [
  { href: '#servicios', label: 'Servicios' },
  { href: '#para-quien', label: 'Para quién' },
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#contacto', label: 'Contacto' },
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);

  // Bloquear scroll del body cuando el menú está abierto.
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  // Cerrar con Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function handleLinkClick() {
    setOpen(false);
  }

  return (
    <>
      {/* Botón hamburguesa — solo mobile/tablet pequeño */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={open}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100 md:hidden"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Drawer del menú — full-screen overlay en mobile */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 top-16 z-30 bg-slate-900/30 backdrop-blur-sm md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Panel */}
          <div
            className="fixed inset-x-0 top-16 z-40 border-b border-slate-200 bg-white shadow-xl md:hidden"
            role="dialog"
            aria-modal="true"
          >
            <nav className="flex flex-col gap-1 px-4 py-4">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={handleLinkClick}
                  className="rounded-lg px-3 py-3 text-base font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                >
                  {l.label}
                </a>
              ))}
            </nav>
            {/* CTAs destacados al final del menú */}
            <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4">
              <div className="flex flex-col gap-2">
                <Link
                  href="/login"
                  onClick={handleLinkClick}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <LogIn className="h-4 w-4" />
                  Ingresar al sistema
                </Link>
                <a
                  href="#contacto"
                  onClick={handleLinkClick}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-gradient px-5 text-sm font-semibold text-white shadow-brand transition hover:shadow-brand-lg"
                >
                  Solicitar demo
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
