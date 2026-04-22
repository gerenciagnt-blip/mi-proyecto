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
};

export default nextConfig;
