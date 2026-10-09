import { env } from './env';
import path from 'path';
import { RPC_ENDPOINT_POOLS } from './rpc-endpoint-pools';
import { BRAND_NAME } from '@vouchnode/shared';

const evmRpcUrlsByNetwork: Record<string, string[]> = {
  ERC20: [...RPC_ENDPOINT_POOLS.ERC20],
  BEP20: [...RPC_ENDPOINT_POOLS.BEP20],
  ARBITRUM_ONE: [...RPC_ENDPOINT_POOLS.ARBITRUM_ONE],
  BASE: [...RPC_ENDPOINT_POOLS.BASE],
  POLYGON: [...RPC_ENDPOINT_POOLS.POLYGON],
  OPTIMISM: [...RPC_ENDPOINT_POOLS.OPTIMISM],
};

export const config = {
  app: {
    env: env.NODE_ENV,
    name: BRAND_NAME,
    url: env.APP_URL,
    apiUrl: env.API_URL,
    port: env.API_PORT,
    host: env.API_HOST,
    version: env.API_VERSION,
    frontendUrl: env.FRONTEND_URL,
    allowTestPaymentSimulation: env.ENABLE_TEST_PAYMENT_SIMULATION,
    testPaymentSimulationSecret: env.TEST_PAYMENT_SIMULATION_SECRET,
  },
  db: {
    url: env.DATABASE_URL,
    connectionLimit: env.PRISMA_CONNECTION_LIMIT,
    poolTimeout: env.PRISMA_POOL_TIMEOUT,
    connectTimeout: env.PRISMA_CONNECT_TIMEOUT,
  },
  redis: {
    url: env.REDIS_URL
  },
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN
  },
  admin: {
    username: env.ADMIN_USERNAME,
    password: env.ADMIN_PASSWORD,
    tokenSecret: env.ADMIN_TOKEN_SECRET,
    userId: env.ADMIN_USER_ID,
  },
  security: {
    encryptionKey: env.ENCRYPTION_KEY,
    maxFailedLogins: env.MAX_FAILED_LOGIN_ATTEMPTS,
    accountLockDurationMins: env.ACCOUNT_LOCK_DURATION_MINUTES
  },
  kyc: {
    verificationUrl: env.KYC_VERIFICATION_URL,
    apiKey: env.KYC_VERIFICATION_API_KEY,
  },
  email: {
    provider: env.EMAIL_PROVIDER,
    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    },
    from: {
      name: env.SITE_SENDER_NAME ?? env.EMAIL_FROM_NAME,
      address: env.SITE_SENDER_EMAIL ?? env.EMAIL_FROM_ADDRESS
    }
  },
  telegram: {
    botToken: env.TELEGRAM_BOT_TOKEN,
    webhookUrl: env.TELEGRAM_WEBHOOK_URL,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
  },
  sms: {
    provider: env.SMS_PROVIDER,
    twilio: {
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      fromNumber: env.TWILIO_FROM_NUMBER
    }
  },
  storage: {
    provider: env.STORAGE_PROVIDER,
    local: {
      path: path.resolve(__dirname, '../..', env.STORAGE_LOCAL_PATH)
    },
    kycLocalPath: env.KYC_STORAGE_LOCAL_PATH,
    s3: {
      endpoint: env.S3_ENDPOINT,
      bucket: env.S3_BUCKET,
      kycBucket: env.S3_KYC_BUCKET,
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
      region: env.S3_REGION,
      publicUrl: env.S3_PUBLIC_URL
    }
  },
  crypto: {
    provider: env.CRYPTO_PROVIDER,
    nowpayments: {
      apiKey: env.NOWPAYMENTS_API_KEY,
      ipnSecret: env.NOWPAYMENTS_IPN_SECRET
    }
  },
  blockchain: {
    evmRpcUrls: Object.values(evmRpcUrlsByNetwork).flat(),
    tronRpcUrls: [...RPC_ENDPOINT_POOLS.TRC20],
    solanaRpcUrls: [...RPC_ENDPOINT_POOLS.SOLANA],
    utxoRpcUrlsByNetwork: {
      BTC: [...RPC_ENDPOINT_POOLS.BTC],
      BCH: [...RPC_ENDPOINT_POOLS.BCH],
      LTC: [...RPC_ENDPOINT_POOLS.LTC],
    },
    evmRpcUrlsByNetwork,
  },
  push: {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  },
  rateLimit: {
    global: {
      max: env.RATE_LIMIT_MAX,
      windowMs: env.RATE_LIMIT_WINDOW_MS
    },
    seller: {
      max: env.RATE_LIMIT_SELLER_MAX
    },
    auth: {
      max: env.AUTH_RATE_LIMIT_MAX,
      windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS
    }
  },
  uploads: {
    maxFileSizeMb: 10
  }
};
