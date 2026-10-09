# VouchNode Marketplace

VouchNode is a complete, production-grade marketplace platform for buying and selling gift cards and digital products using fiat and cryptocurrency.

## 1. Overview & Features

- **Multi-Role Authentication**: Buyers, Sellers, Admins, Support with distinct permissions.
- **Crypto & Fiat Wallet System**: Double-entry ledger for secure balance tracking.
- **Order State Machine**: Enforces strict transitions (CREATED -> PAID -> COMPLETED).
- **Escrow System**: Funds are held in escrow during transaction to protect both parties.
- **Dispute Resolution**: Dedicated evidence uploading and admin arbitration flows.
- **Real-Time Messaging**: Socket.IO based buyer-seller chat.
- **Background Jobs**: BullMQ workers for payment timeouts, auto-completions, and seller stats.
- **Fraud Engine**: Risk scoring and velocity checks on transactions.

## 2. Prerequisites

- Node.js >= 20.19.0
- pnpm >= 9.0.0
- Docker & docker-compose (for PostgreSQL and Redis)

## 3. Quick Start

```bash
# Clone the repository
git clone <repo-url> vouchnode
cd vouchnode

# Copy environment variables
cp .env.example .env

# Start dependencies (PostgreSQL, Redis)
docker-compose up -d

# Install dependencies
pnpm install

# Build shared package
pnpm build

# Setup database
pnpm --filter @vouchnode/backend exec prisma generate
pnpm --filter backend db:push
pnpm --filter backend db:seed

# Start development servers
pnpm dev
```

## 4. Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/db` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_ACCESS_SECRET` | Secret for access tokens | `min-32-chars-secret` |
| `ENCRYPTION_KEY` | 32-byte hex key for data at rest | `your-32-byte-hex-encryption-key` |
| `CRYPTO_PROVIDER` | Payments backend | `nowpayments`, `manual` |

*Refer to `.env.example` for the complete list.*

## 5. Project Structure

This is a pnpm monorepo:
- `apps/backend`: Fastify + Prisma Node.js API server
- `apps/frontend`: Next.js 14 App Router client (To be added)
- `packages/shared`: Shared TypeScript types, Zod schemas, and enums

## 6. Frontend Setup

The frontend resides in `apps/frontend`. 
Run `pnpm --filter frontend dev` to start the Next.js server.

## 7. Backend Setup

The backend uses Fastify. Important directories:
- `src/controllers`: Request handlers
- `src/services`: Business logic
- `src/repositories`: Database interactions (Prisma)
- `src/state-machines`: Complex state transitions
- `src/jobs`: BullMQ background jobs

## 8. Database Migrations

```bash
# Create a new migration after modifying schema.prisma
pnpm --filter backend db:migrate

# Seed database
pnpm --filter backend db:seed
```

## 9. API Documentation

API routes are mounted at `/api/v1`. 
- Auth: `/api/v1/auth`
- Products: `/api/v1/products`
- Orders: `/api/v1/orders`
- Wallet: `/api/v1/wallet`
- Admin: `/api/v1/admin`

## 10. Crypto Integration

Buyer direct checkout uses the platform's on-chain deposit-address scanner.
The API also accepts signed NowPayments IPNs at
`/api/payments/nowpayments` (and `/api/v1/webhooks/nowpayments`) for orders
created by an external NowPayments integration. This integration is optional:
when `NOWPAYMENTS_IPN_SECRET` is unset, the callback returns service unavailable
and production startup does not require the secret. To enable callbacks, set
the real value in the deployment secret store and configure the matching URL
and signing secret in NowPayments. IPNs are signature checked; only `finished`
payments with a sufficient quoted and actually-paid amount for the matching
order currency are settled. Hosted NowPayments invoice creation is not part of
this application flow. CoinGate is not supported.

## 11. SMS Integration

Configured for Twilio. Requires `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.

## 12. Email Integration

Transactional email uses Nodemailer over SMTP and the BullMQ notification worker.
Set `EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS`
in the backend environment; keep SMTP credentials out of source control. Use
`SITE_SENDER_NAME` and `SITE_SENDER_EMAIL` for the verified sender identity
(`EMAIL_FROM_NAME` and `EMAIL_FROM_ADDRESS` remain supported as fallbacks).
The sample environment is configured for Brevo on port 587, but leaves the
account credentials empty so each deployment can provide its own secret.

The notification worker sends branded buyer/seller emails for order placement,
order completion, dispute updates, and earned referral commissions. Run the
backend worker alongside the API in production (`pnpm --filter backend worker:start`);
development starts notification workers with the API. Failed SMTP deliveries
are retried by BullMQ with exponential backoff.

For local development, set `TELEGRAM_BOT_TOKEN` in the backend environment to
enable private Telegram notifications and bot long polling. Sign in, open
**Your Profile → Security → Link Telegram Account**, then open the generated
deep link in Telegram and press **Start**. The link is single-use and expires
after 10 minutes; the bot accepts linking only in a one-on-one private chat.
When Telegram is configured in development, notification email delivery is
disabled; unlinked accounts continue to receive in-app notifications only.
Apply the Prisma migration before starting the backend. Do not commit the bot
token, and run only one long-polling backend instance for a bot token.

## 13. File Storage

Local disk storage is intended for development. For production, set
`STORAGE_PROVIDER=s3` and configure `S3_BUCKET`, `S3_KYC_BUCKET`,
`S3_ACCESS_KEY`, `S3_SECRET_KEY`, and `S3_PUBLIC_URL` in the deployment secret
store. `S3_ENDPOINT` is optional for AWS S3 and should be set for compatible
services such as R2 or MinIO; set `S3_REGION` to the provider's region (or its
required region value). Public product/media files are written to `S3_BUCKET`;
identity documents are written to the separate, private `S3_KYC_BUCKET` and
remain available only through the authenticated KYC document route. Configure
the public bucket/CDN policy to serve public media, and do not expose the KYC
bucket publicly.

## 14. Production Deployment

Use `.env.production.example` as a variable checklist only; its values are
deliberately blank or illustrative and are not production credentials. Configure
real values in the hosting platform's secret manager or a root-owned environment
file outside the repository. Never commit production environment files.

- Set `NODE_ENV=production`, `APP_URL`, and `FRONTEND_URL` to
  `https://vouchnodes.com`, and `API_URL` to `https://api.vouchnodes.com`.
  Bind the API to `127.0.0.1`; the sample Nginx configuration in
  `deploy/nginx-vouchnodes.conf.example` routes the app and API hostnames to
  their respective local processes.
- Set `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, and `NEXT_PUBLIC_WS_URL`
  before building the frontend; these values are embedded in the production
  bundle. Use `https://vouchnodes.com` for the app and
  `https://api.vouchnodes.com` for API and WebSocket requests. The PM2
  frontend process uses the loopback `INTERNAL_API_URL` for server-rendered
  data fetches.
- The frontend uses a system font stack; production builds do not fetch Google
  Fonts or require external font access.
- Set `DATABASE_URL` to the external PostgreSQL provider's TLS-enabled
  connection string. URL-encode reserved characters in credentials and allow
  connections from the API/worker host in the database provider's network rules.
- Prisma uses a bounded connection pool per process. `PRISMA_CONNECTION_LIMIT`
  defaults to 5, while `PRISMA_POOL_TIMEOUT` and `PRISMA_CONNECT_TIMEOUT`
  default to 20 and 10 seconds. Keep the sum of API and worker pool limits
  (multiplied by PM2 instances) below the database provider's connection cap.
  Prisma manages and reuses pooled connections; the application disconnects
  cleanly on shutdown.
- Set `REDIS_URL` to authenticated Redis. Prefer `rediss://` for managed Redis;
  if Redis runs on the AlexHost VPS, bind it to loopback, require authentication,
  and keep its port closed to the public network. URL-encode credentials.
- Set distinct, random `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
  `ADMIN_TOKEN_SECRET`, and `ENCRYPTION_KEY` values. Set a unique admin username
  and a password of at least 16 characters. Configure `ADMIN_EMAIL` as well if
  provisioning the database admin account. Keep these values in the protected
  environment only; the admin seed hashes `ADMIN_PASSWORD` with Argon2 and
  refuses to run when the required admin values are absent. Keep a protected backup of the
  encryption key; losing it can make encrypted application data unrecoverable.
- Set `STORAGE_PROVIDER=s3` and configure the public media bucket and a separate
  private KYC bucket as described above. Use least-privilege credentials.
- Set `ENABLE_TEST_PAYMENT_SIMULATION=false`. For native on-chain checkout,
  NowPayments IPN is optional. If callbacks are enabled, configure the real
  `NOWPAYMENTS_IPN_SECRET` in both the provider and the secret store.
- Give the API and background worker the same protected environment values.
  With systemd, use a root-owned environment file with `0600` permissions. With
  PM2, place the backend variables in `apps/backend/.env` with `0600`
  permissions; backend startup loads this file. Never put secret values in a
  committed file, PM2 ecosystem file, or command-line arguments.
- The archive already contains the production build and dependencies. Apply
  production migrations with the bundled runtime:

  ```bash
  cd apps/backend
  ../../runtime/node node_modules/prisma/build/index.js migrate deploy
  cd ../..
  ```

  Confirm database and Redis connectivity, service health, and worker startup
  from the deployed host before opening traffic.
- The archive includes a `runtime/node` Node.js 20 binary and PM2 assigns it
  explicitly to each process. Start the application with the bundled runtime
  and PM2 CLI rather than the host's older Node installation:

  ```bash
  ./runtime/node node_modules/pm2/bin/pm2 start ecosystem.config.cjs --env production
  ```

  Use `start` on the first deployment; `restart all` only applies after PM2 has
  already loaded and saved the process list.

- The `.env.production.example` file is a checklist, not a production
  environment file. Keep actual database URLs, Telegram tokens, API keys, and
  secrets in a protected host environment file; do not put them in the archive.
  Configure the backend's `apps/backend/.env` with restrictive permissions
  before starting the processes.
- To provision the database-backed admin user, set `ADMIN_EMAIL`,
  `ADMIN_USERNAME`, and `ADMIN_PASSWORD` in the protected backend environment,
  then run the seed script once after migrations:

  ```bash
  cd apps/backend
  ../../runtime/node node_modules/tsx/dist/cli.mjs prisma/admin-seed.ts
  cd ../..
  ```
- For PM2, the compiled API entry point is `apps/backend/dist/index.js` (not
  `dist/main.js`). The API, background worker, and Next.js frontend are separate
  processes. Start all three with the ecosystem file:

  The PM2 CLI is included in the deployment dependencies. Launch it through
  the bundled Node runtime so no host Node or global PM2 installation is needed:

  ```bash
  ./runtime/node node_modules/pm2/bin/pm2 save
  ./runtime/node node_modules/pm2/bin/pm2 startup
  ```

  Run the privileged command printed by `pm2 startup` once to restore all
  three processes automatically after a server reboot. PostgreSQL, Redis,
  blockchain RPC access, and valid production secrets must already be
  available. The bundle contains application dependencies and PM2, not those
  host services or credentials.

Configuration validation rejects missing/placeholder production secrets and
missing S3 settings. API startup also requires working Redis for distributed
rate limiting; do not bypass these checks to force a deployment.
The production configuration check requires a remote TLS-enabled PostgreSQL
URL and either TLS-enabled Redis or password-authenticated loopback Redis.
It checks Redis connectivity at API startup as well.

## 15. Security Considerations

- Passwords hashed with Argon2id.
- Rate limiting on sensitive endpoints (OTP, login).
- Double-entry ledger prevents double-spend conditions.
- Raw inventory codes are AES-256-GCM encrypted in the DB.

## 16. Testing

```bash
pnpm test
```
Backend tests are written with Vitest. The frontend currently has no Vitest test
files, so its workspace test command succeeds without running tests; frontend
automated test coverage still needs to be added.
