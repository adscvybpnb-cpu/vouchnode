/** @type {import('next').NextConfig} */
const localImageHosts = process.env.NODE_ENV === 'production' ? [] : [
  { protocol: 'http', hostname: 'localhost', port: '4000' },
  { protocol: 'http', hostname: '127.0.0.1', port: '4000' },
];
const nextConfig = {
  images: {
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
        ],
      },
    ];
  },
};

export default nextConfig;
