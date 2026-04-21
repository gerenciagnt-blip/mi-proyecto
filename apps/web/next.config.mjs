/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pila/core', '@pila/db'],
  experimental: {
    serverActions: {
      // El upload de logo del comprobante y otros adjuntos pasan por server actions.
      // 1 MB (default) es demasiado bajo para un PNG/JPG de logo. Subimos a 5 MB.
      bodySizeLimit: '5mb',
    },
  },
};

export default nextConfig;
