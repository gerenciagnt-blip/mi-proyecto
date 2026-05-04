'use client';

/**
 * Botón flotante de WhatsApp esquina inferior derecha. Aparece en
 * todas las páginas dentro del layout `/landing`. Color verde
 * oficial de WhatsApp para reconocimiento inmediato.
 */

import { waUrl, WA_MENSAJES } from './whatsapp';

export function WhatsappFloat() {
  return (
    <a
      href={waUrl(WA_MENSAJES.flotanteGeneral)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contactar por WhatsApp"
      className="group fixed bottom-6 right-6 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-[#25D366]/30 transition hover:scale-110 hover:bg-[#1ebe5d] hover:shadow-[#25D366]/50 sm:bottom-8 sm:right-8"
    >
      <svg viewBox="0 0 32 32" fill="currentColor" className="h-7 w-7" aria-hidden>
        <path d="M16.005 4C9.376 4 4 9.376 4 16.004c0 2.111.55 4.181 1.595 6.001L4 28l6.158-1.61a11.94 11.94 0 005.847 1.504C22.629 27.894 28 22.518 28 15.892 28 9.262 22.621 3.886 15.992 4h.013zm0 21.78c-1.838 0-3.643-.494-5.21-1.43l-.374-.222-3.872 1.013 1.034-3.776-.244-.39a9.91 9.91 0 01-1.515-5.265c0-5.484 4.466-9.95 9.95-9.95 5.485 0 9.95 4.466 9.95 9.95s-4.464 9.95-9.95 9.95l.231.12zm5.46-7.456c-.298-.15-1.768-.872-2.04-.972-.275-.099-.476-.149-.674.15-.198.298-.776.971-.95 1.169-.176.198-.351.224-.65.075-.298-.149-1.262-.464-2.404-1.481-.888-.793-1.486-1.771-1.66-2.07-.176-.298-.02-.46.13-.609.135-.135.299-.351.45-.527.15-.176.198-.298.298-.497.099-.198.05-.373-.025-.522-.075-.149-.673-1.622-.922-2.222-.244-.585-.49-.504-.675-.514-.176-.008-.376-.011-.575-.011-.198 0-.522.075-.795.373-.272.298-1.044 1.022-1.044 2.495s1.07 2.893 1.218 3.092c.149.198 2.105 3.21 5.097 4.508 1.928.832 2.683.903 3.642.76.583-.087 1.776-.726 2.024-1.428.249-.7.249-1.302.174-1.428-.075-.124-.273-.199-.572-.349z" />
      </svg>
      {/* Pulso decorativo */}
      <span
        className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-[#25D366] opacity-50 blur-md transition group-hover:opacity-80"
        aria-hidden
      />
    </a>
  );
}
