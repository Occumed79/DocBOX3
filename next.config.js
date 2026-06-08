/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@neondatabase/serverless', 'formidable']
  }
}
module.exports = nextConfig
