import pino from 'pino';
import { config } from '../config';

const targets = [];

if (config.app.env === 'development') {
  targets.push({
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  });
} else {
  targets.push({
    target: 'pino/file',
    options: { destination: 1 } // stdout
  });
}

export const logger = pino({
  level: config.app.env === 'development' ? 'debug' : 'info',
  transport: {
    targets
  }
});
