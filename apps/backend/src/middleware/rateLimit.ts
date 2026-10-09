import { config } from '../config';

export const rateLimits = {
  global: {
    config: {
      max: config.rateLimit.global.max,
      timeWindow: config.rateLimit.global.windowMs
    }
  },
  auth: {
    config: {
      max: config.rateLimit.auth.max,
      timeWindow: config.rateLimit.auth.windowMs
    }
  },
};
