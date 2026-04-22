// Security headers aplicados globalmente a todas las rutas.
// CSP queda por fuera de este set — es delicado con Next (inline scripts
// del runtime) y se habilita en una iteración separada con nonces.
const securityHeaders = [
  // Evita que el browser "adivine" tipos de contenido (defiende contra
  // MIME-confusion). Recomendado universalmente.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Bloquea embebidos en <iframe> (clickjacking). `DENY` es el valor
  // más estricto — ninguna página puede embeber la app.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Fuerza HTTPS por un año + subdominios. Sólo tiene efecto cuando la
  // respuesta llega por HTTPS; en dev local (http) el browser lo ignora.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  // No enviar Referer al cambiar de origen (reduce fuga de URLs privadas).
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Deshabilita APIs sensibles del navegador que esta app no usa.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  // Legacy protection — modernos browsers la ignoran pero no molesta.
  { key: 'X-XSS-Protection', value: '0' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pila/core', '@pila/db'],
  // @react-pdf/renderer usa internals de Node (fs, Buffer, stream).
  // Lo marcamos como external en server components para que Next no trate
  // de empaquetar sus dependencias nativas.
  serverExternalPackages: ['@react-pdf/renderer'],
  experimental: {
    serverActions: {
      // El upload de logo del comprobante y otros adjuntos pasan por server actions.
      // 1 MB (default) es demasiado bajo para un PNG/JPG de logo. Subimos a 5 MB.
      bodySizeLimit: '5mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
