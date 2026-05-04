'use client';

/**
 * Mini-formulario de "Solicitar demo" inline. Captura los datos
 * básicos del lead y al submit abre WhatsApp con el mensaje
 * pre-armado para que el comercial cierre el contacto sin fricción.
 *
 * No usa server action — todo client-side. Cuando se quiera
 * tracking real (envío a Resend, registro en BD, integración con
 * CRM) se reemplaza el handler por una server action.
 */

import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { waUrl } from './whatsapp';

export function SolicitarDemoForm() {
  const [enviando, setEnviando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [telefono, setTelefono] = useState('');
  const [cotizantes, setCotizantes] = useState('');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    const mensaje =
      `Hola, quiero solicitar una demo de Sistema PILA.\n\n` +
      `• Nombre: ${nombre}\n` +
      `• Empresa: ${empresa}\n` +
      `• Teléfono: ${telefono}\n` +
      `• N° de cotizantes: ${cotizantes}`;
    window.open(waUrl(mensaje), '_blank', 'noopener,noreferrer');
    // Pequeño retraso para que el spinner sea visible — UX feedback.
    setTimeout(() => setEnviando(false), 800);
  }

  const inputCls =
    'h-11 w-full rounded-xl border border-white/30 bg-white/10 px-4 text-sm text-white placeholder:text-white/50 backdrop-blur transition focus:border-white/60 focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30';

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <input
        type="text"
        required
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Tu nombre"
        className={inputCls}
        autoComplete="name"
      />
      <input
        type="text"
        required
        value={empresa}
        onChange={(e) => setEmpresa(e.target.value)}
        placeholder="Empresa"
        className={inputCls}
        autoComplete="organization"
      />
      <input
        type="tel"
        required
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
        placeholder="Teléfono (con indicativo)"
        className={inputCls}
        autoComplete="tel"
      />
      <input
        type="number"
        min={1}
        required
        value={cotizantes}
        onChange={(e) => setCotizantes(e.target.value)}
        placeholder="N° de cotizantes que manejas"
        className={inputCls}
      />
      <button
        type="submit"
        disabled={enviando}
        className="col-span-1 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-brand-blue-dark shadow-lg transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70 sm:col-span-2"
      >
        {enviando ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Abriendo WhatsApp…
          </>
        ) : (
          <>
            Solicitar demo por WhatsApp
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
      <p className="col-span-1 text-center text-[11px] text-white/60 sm:col-span-2">
        Al enviar abrimos un chat de WhatsApp con tus datos pre-cargados — solo confirmas y nos
        ponemos en contacto en menos de un día hábil.
      </p>
    </form>
  );
}
