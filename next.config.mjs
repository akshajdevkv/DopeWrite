/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    proxyClientMaxBodySize: '20mb',
  },
  allowedDevOrigins: [
    'epinions-hang-accessibility-nsw.trycloudflare.com',
    'preference-crew-teenage-mixer.trycloudflare.com',
  ],
};

export default nextConfig;
