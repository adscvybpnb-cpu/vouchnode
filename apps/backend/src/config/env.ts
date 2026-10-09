import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { BRAND_NAME } from '@vouchnode/shared';

export const RPC_ENV_KEYS = [
  'PRIVATE_RPC_ARB',
  'PRIVATE_RPC_ETH',
  'PRIVATE_RPC_BSC',
  'PRIVATE_RPC_BASE',
  'PRIVATE_RPC_POLYGON',
  'PRIVATE_RPC_OP',
  'PRIVATE_RPC_SOL',
  'PRIVATE_RPC_LTC',
  'PRIVATE_RPC_BTC',
  'PRIVATE_RPC_BCH',
  'PRIVATE_RPC_TRON',
] as const;

export type RpcEnvKey = typeof RPC_ENV_KEYS[number];
export const externalTelegramEnvValues = {
  TELEGRAM_WEBHOOK_URL: process.env.TELEGRAM_WEBHOOK_URL,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
};
export const externalRpcEnvValues: Partial<Record<RpcEnvKey, string>> = Object.fromEntries(
  RPC_ENV_KEYS.flatMap((key) => process.env[key] ? [[key, process.env[key] as string]] : []),
) as Partial<Record<RpcEnvKey, string>>;

// Resolve the backend environment explicitly so starting from the monorepo root
// or from a compiled dist directory loads the same configuration.
export const backendEnvPath = path.resolve(__dirname, '../../.env');
const workingDirectoryEnvPath = path.resolve(process.cwd(), 'apps/backend/.env');
const localWorkingDirectoryEnvPath = path.resolve(process.cwd(), '.env');
for (const envPath of [backendEnvPath, workingDirectoryEnvPath, localWorkingDirectoryEnvPath]) {
  dotenv.config({ path: envPath, override: false });
}


const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_NAME: z.string().default(BRAND_NAME),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  API_PORT: z.coerce.number().default(4000),
  // Bind all local interfaces so both localhost and 127.0.0.1 resolve to the API.
  API_HOST: z.string().default('0.0.0.0'),
  API_VERSION: z.string().default('v1'),
  FRONTEND_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  PRISMA_CONNECTION_LIMIT: z.coerce.number().int().positive().default(5),
  PRISMA_POOL_TIMEOUT: z.coerce.number().int().positive().default(20),
  PRISMA_CONNECT_TIMEOUT: z.coerce.number().int().positive().default(10),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('24h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  ADMIN_USERNAME: z.string().min(1).optional(),
  ADMIN_PASSWORD: z.string().min(12).optional(),
  ADMIN_TOKEN_SECRET: z.string().min(32).optional(),
  ADMIN_USER_ID: z.string().min(1).optional(),

  ENCRYPTION_KEY: z.string().min(32),

  EMAIL_PROVIDER: z.enum(['smtp', 'mock']).default('smtp'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SITE_SENDER_NAME: z.string().min(1).optional(),
  SITE_SENDER_EMAIL: z.string().email().optional(),
  EMAIL_FROM_NAME: z.string().default(BRAND_NAME),
  EMAIL_FROM_ADDRESS: z.string().email().default('noreply@vouchnodes.com'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).max(256).optional(),

  SMS_PROVIDER: z.enum(['twilio', 'mock']).default('twilio'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./uploads'),
  KYC_STORAGE_LOCAL_PATH: z.string().default('./private/kyc'),
  S3_ENDPOINT: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().url().optional(),
  ),
  S3_BUCKET: z.string().optional(),
  S3_KYC_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_PUBLIC_URL: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().url().optional(),
  ),

  CRYPTO_PROVIDER: z.enum(['nowpayments', 'manual']).default('manual'),
  EVM_MASTER_XPUB: z.string().default(''),
  TRON_MASTER_XPUB: z.string().default(''),
  BTC_MASTER_XPUB: z.string().default(''),
  LTC_MASTER_XPUB: z.string().default(''),
  BCH_MASTER_XPUB: z.string().default(''),
  SOLANA_MASTER_XPUB: z.string().default(''),
  NOWPAYMENTS_API_KEY: z.string().optional(),
  NOWPAYMENTS_IPN_SECRET: z.string().optional(),
  ALCHEMY_WEBHOOK_SIGNING_KEY: z.string().optional(),
  PRIVATE_RPC_ARB: z.string().default(''),
  PRIVATE_RPC_ETH: z.string().default(''),
  PRIVATE_RPC_BSC: z.string().default(''),
  PRIVATE_RPC_BASE: z.string().default(''),
  PRIVATE_RPC_POLYGON: z.string().default(''),
  PRIVATE_RPC_OP: z.string().default(''),
  PRIVATE_RPC_SOL: z.string().default(''),
  PRIVATE_RPC_LTC: z.string().default(''),
  PRIVATE_RPC_BTC: z.string().default(''),
  PRIVATE_RPC_BCH: z.string().default(''),
  PRIVATE_RPC_TRON: z.string().default(''),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().url().default('mailto:security@vouchnodes.com'),

  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(2000).default(1500),
  RATE_LIMIT_SELLER_MAX: z.coerce.number().int().min(1).max(2000).default(2000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  ENABLE_TEST_PAYMENT_SIMULATION: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  TEST_PAYMENT_SIMULATION_SECRET: z.string().min(32).optional(),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(10),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),

  MAX_FAILED_LOGIN_ATTEMPTS: z.coerce.number().default(5),
  ACCOUNT_LOCK_DURATION_MINUTES: z.coerce.number().default(30),
  KYC_VERIFICATION_URL: z.string().url().optional(),
  KYC_VERIFICATION_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

const placeholderPattern = /changeme|change[-_ ]?me|replace[-_ ]?with|example|sample|test(?:ing)?|development|default|secret|password/i;
const isLocalHostname = (hostname: string) =>
  hostname === 'localhost' ||
  hostname === '::1' ||
  hostname === '[::1]' ||
  hostname === '127.0.0.1' ||
  hostname.startsWith('127.');

const hasValidProductionDatabaseUrl = (value: string) => {
  try {
    const url = new URL(value);
    const sslMode = url.searchParams.get('sslmode')?.toLowerCase();
    return ['postgres:', 'postgresql:'].includes(url.protocol) &&
      Boolean(url.hostname && !isLocalHostname(url.hostname)) &&
      Boolean(url.username && url.password && !placeholderPattern.test(decodeURIComponent(url.password))) &&
      ['require', 'verify-ca', 'verify-full'].includes(sslMode || '');
  } catch {
    return false;
  }
};

const hasValidProductionRedisUrl = (value: string) => {
  try {
    const url = new URL(value);
    const secureTransport = url.protocol === 'rediss:';
    const authenticatedLoopback = url.protocol === 'redis:' && isLocalHostname(url.hostname);
    return Boolean((secureTransport || authenticatedLoopback) &&
      url.hostname &&
      url.password &&
      !placeholderPattern.test(decodeURIComponent(url.password)));
  } catch {
    return false;
  }
};

const usesHttps = (value: string | undefined) => {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

if (parsed.data.STORAGE_PROVIDER === 's3') {
  const missingS3Settings = [
    ['S3_BUCKET', parsed.data.S3_BUCKET],
    ['S3_KYC_BUCKET', parsed.data.S3_KYC_BUCKET],
    ['S3_ACCESS_KEY', parsed.data.S3_ACCESS_KEY],
    ['S3_SECRET_KEY', parsed.data.S3_SECRET_KEY],
    ['S3_REGION', parsed.data.S3_REGION],
    ['S3_PUBLIC_URL', parsed.data.S3_PUBLIC_URL],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missingS3Settings.length > 0) {
    console.error('❌ S3_STORAGE_PROVIDER requires:', missingS3Settings);
    process.exit(1);
  }
}

if (parsed.data.NODE_ENV === 'production') {
  const productionSecretEntries: Array<[string, string | undefined]> = [
    ['JWT_ACCESS_SECRET', parsed.data.JWT_ACCESS_SECRET],
    ['JWT_REFRESH_SECRET', parsed.data.JWT_REFRESH_SECRET],
    ['ENCRYPTION_KEY', parsed.data.ENCRYPTION_KEY],
    ['ADMIN_TOKEN_SECRET', parsed.data.ADMIN_TOKEN_SECRET],
    ['ADMIN_PASSWORD', parsed.data.ADMIN_PASSWORD],
  ];
  const invalidSecrets = productionSecretEntries
    .filter(([, value]) => !value || placeholderPattern.test(value))
    .map(([name]) => name);
  for (const [name, value] of [
    ['APP_URL', parsed.data.APP_URL],
    ['API_URL', parsed.data.API_URL],
    ['FRONTEND_URL', parsed.data.FRONTEND_URL],
  ]) {
    if (!usesHttps(value)) invalidSecrets.push(`${name} (must use HTTPS in production)`);
  }
  if (!hasValidProductionDatabaseUrl(parsed.data.DATABASE_URL)) {
    invalidSecrets.push('DATABASE_URL (must be a remote TLS-enabled PostgreSQL URL with credentials)');
  }
  if (!hasValidProductionRedisUrl(parsed.data.REDIS_URL)) {
    invalidSecrets.push('REDIS_URL (must use authenticated TLS Redis or authenticated loopback Redis)');
  }
  const configuredTokens = [
    parsed.data.JWT_ACCESS_SECRET,
    parsed.data.JWT_REFRESH_SECRET,
    parsed.data.ENCRYPTION_KEY,
    parsed.data.ADMIN_TOKEN_SECRET,
  ].filter((value): value is string => Boolean(value));
  if (new Set(configuredTokens).size !== configuredTokens.length) {
    invalidSecrets.push('JWT_ACCESS_SECRET/JWT_REFRESH_SECRET/ENCRYPTION_KEY/ADMIN_TOKEN_SECRET must be distinct');
  }
  if (!parsed.data.ADMIN_USERNAME || /^(admin|administrator)$/i.test(parsed.data.ADMIN_USERNAME) || placeholderPattern.test(parsed.data.ADMIN_USERNAME)) {
    invalidSecrets.push('ADMIN_USERNAME');
  }
  if ((parsed.data.ADMIN_PASSWORD?.length ?? 0) < 16) {
    invalidSecrets.push('ADMIN_PASSWORD (must be at least 16 characters)');
  }
  if (parsed.data.ENABLE_TEST_PAYMENT_SIMULATION) {
    invalidSecrets.push('ENABLE_TEST_PAYMENT_SIMULATION (must be false in production)');
  }
  if (parsed.data.STORAGE_PROVIDER === 's3') {
    const requiredS3Settings: Array<[string, string | undefined]> = [
      ['S3_BUCKET', parsed.data.S3_BUCKET],
      ['S3_KYC_BUCKET', parsed.data.S3_KYC_BUCKET],
      ['S3_PUBLIC_URL', parsed.data.S3_PUBLIC_URL],
    ];
    const s3CredentialEntries: Array<[string, string | undefined]> = [
      ['S3_ACCESS_KEY', parsed.data.S3_ACCESS_KEY],
      ['S3_SECRET_KEY', parsed.data.S3_SECRET_KEY],
    ];
    invalidSecrets.push(...requiredS3Settings.filter(([, value]) => !value).map(([name]) => name));
    invalidSecrets.push(...s3CredentialEntries.filter(([, value]) => !value || placeholderPattern.test(value)).map(([name]) => name));
    if (parsed.data.S3_BUCKET === parsed.data.S3_KYC_BUCKET) {
      invalidSecrets.push('S3_BUCKET and S3_KYC_BUCKET must be separate buckets');
    }
    if (parsed.data.S3_ENDPOINT && !usesHttps(parsed.data.S3_ENDPOINT)) {
      invalidSecrets.push('S3_ENDPOINT (must use HTTPS in production)');
    }
    if (!usesHttps(parsed.data.S3_PUBLIC_URL)) {
      invalidSecrets.push('S3_PUBLIC_URL (must use HTTPS in production)');
    }
  } else {
    invalidSecrets.push('STORAGE_PROVIDER (must be s3 in production)');
  }
  if (invalidSecrets.length > 0) {
    console.error('❌ Unsafe production environment configuration:', [...new Set(invalidSecrets)]);
    process.exit(1);
  }
}

if (parsed.data.ENABLE_TEST_PAYMENT_SIMULATION && !parsed.data.TEST_PAYMENT_SIMULATION_SECRET) {
  console.error('❌ TEST_PAYMENT_SIMULATION_SECRET must be configured when payment simulation is enabled.');
  process.exit(1);
}

export const env = parsed.data;
