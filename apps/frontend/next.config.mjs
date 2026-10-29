/** @type {import('next').NextConfig} */
const localImageHosts = process.env.NODE_ENV === 'production' ? [] : [
  { protocol: 'http', hostname: 'localhost', port: '4000' },
  { protocol: 'http', hostname: '127.0.0.1', port: '4000' },
];
const isProduction = process.env.NODE_ENV === 'production';
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"} https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' https://vouchnodes.com wss://vouchnodes.com https://www.vouchnodes.com wss://www.vouchnodes.com https://api.vouchnodes.com wss://api.vouchnodes.com https://challenges.cloudflare.com${isProduction ? '' : ' http://localhost:3000 ws://localhost:3000 http://127.0.0.1:3000 ws://127.0.0.1:3000'}`,
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
].join('; ');
const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [{ protocol: 'https', hostname: '**' }, ...localImageHosts],
  },
  async redirects() {
    return [
      {
        source: '/seller/dashboard',
        destination: '/seller/onboarding',
        permanent: false,
        statusCode: 302,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
