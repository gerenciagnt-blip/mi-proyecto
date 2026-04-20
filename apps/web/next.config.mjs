/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pila/core', '@pila/db'],
};

export default nextConfig;
