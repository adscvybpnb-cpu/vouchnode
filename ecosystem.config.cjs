const path = require('node:path');

const root = __dirname;
const nodeRuntime = path.join(root, 'runtime', 'node');

module.exports = {
  apps: [
    {
      name: 'vouchnodes-api',
      cwd: path.join(root, 'apps/backend'),
      script: 'dist/index.js',
      interpreter: nodeRuntime,
      instances: 1,
      exec_mode: 'fork',
      env_production: { NODE_ENV: 'production' },
    },
    {
      name: 'vouchnodes-worker',
      cwd: path.join(root, 'apps/backend'),
      script: 'dist/worker.js',
      interpreter: nodeRuntime,
      instances: 1,
      exec_mode: 'fork',
      env_production: { NODE_ENV: 'production' },
    },
    {
      name: 'vouchnodes-frontend',
      cwd: path.join(root, 'apps/frontend'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      interpreter: nodeRuntime,
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        INTERNAL_API_URL: 'http://127.0.0.1:4000/api/v1',
      },
    },
  ],
};
