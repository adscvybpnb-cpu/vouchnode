import { config } from '../config';

export function getAllowedFrontendOrigins() {
  const origins = new Set<string>();

  for (const configuredUrl of [config.app.frontendUrl, config.app.url]) {
    const url = new URL(configuredUrl);
    origins.add(url.origin);
    if (url.hostname === 'vouchnodes.com') {
      url.hostname = 'www.vouchnodes.com';
      origins.add(url.origin);
    } else if (url.hostname === 'www.vouchnodes.com') {
      url.hostname = 'vouchnodes.com';
      origins.add(url.origin);
    }
  }

  if (config.app.env !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
  }

  return [...origins];
}
