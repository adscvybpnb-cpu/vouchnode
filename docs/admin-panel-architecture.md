# Admin Panel Architecture

## Goals

The admin panel is a privileged control plane over the existing marketplace, wallet, support, and Auto-P2P workflows. It must not create a second source of truth: product state remains in `Product`, wallet state remains in `Wallet`/`LedgerEntry`, and P2P dispute state remains in `P2POrder` and its existing service.

Every mutating admin action must:

1. Authenticate the operator and enforce `ADMIN` or `SUPPORT` capability.
2. Validate input with a route-local Zod schema.
3. Execute the domain service inside a transaction where balances or status transitions are involved.
4. Write an `AuditLog` record containing actor, action, entity, reason, and before/after metadata.
5. Return the updated resource; never return a success-shaped empty fallback.

## Backend module layout

```text
apps/backend/src/
  admin/
    admin.constants.ts       # capabilities, SLA windows, supported asset allowlist
    admin.schemas.ts         # query and mutation validation
    admin.policy.ts          # capability checks (next implementation step)
    admin.controller.ts      # thin Fastify handlers (next implementation step)
    admin.service.ts         # orchestration and audit boundaries (next implementation step)
    admin.repository.ts      # paginated Prisma reads (next implementation step)
  routes/admin.routes.ts     # authenticated route registration
  services/
    admin.service.ts         # existing domain compatibility facade
```

The initial scaffold deliberately reuses `services/admin.service.ts` and `routes/admin.routes.ts` so existing routes remain compatible. New admin modules should call domain services rather than access Prisma directly from controllers.

## Authorization matrix

| Capability | ADMIN | SUPPORT |
|---|---:|---:|
| Product create/update/delete, inventory | Yes | No |
| User/seller suspend or ban | Yes | Limited risk actions |
| Withdrawal/deposit review | Yes | Read-only unless explicitly delegated |
| KYC review | Yes | Yes |
| Standard support tickets | Yes | Yes |
| Marketplace disputes | Yes | Yes |
| Auto-P2P disputes | Yes | Yes, with 12-hour SLA |
| Fraud/risk review | Yes | Read and flag |
| System settings and broadcasts | Yes | No |

## Frontend route tree

```text
apps/frontend/src/app/(admin)/admin/
  page.tsx                         # command center and SLA/risk counters
  users/page.tsx                   # search, details, suspend/ban/reactivate
  sellers/page.tsx                 # approval and seller risk controls
  products/page.tsx                # catalog CRUD and inventory
  orders/page.tsx                  # global order timeline
  transactions/page.tsx            # transaction and ledger monitoring
  deposits/page.tsx                # pending deposit verification
  withdrawals/page.tsx             # risk-scored withdrawal queue
  disputes/page.tsx                # marketplace and P2P queues
  disputes/[id]/page.tsx           # evidence, messages, resolution
  kyc/page.tsx                     # identity verification queue
  tickets/page.tsx                 # standard support queue
  fraud/page.tsx                   # fraud flags and risk actions
  audit-logs/page.tsx              # immutable operator trace
  reports/page.tsx                 # operational reports
  settings/page.tsx                # admin-only system settings
```

## Financial control flows

### Deposits

`DepositSession` is the pending-intent record. The admin queue filters by `PENDING`, asset, network, and expiry. Verification must call the deposit scanner/domain service, complete the matching `LedgerEntry`, and store the transaction hash. Rejection must expire the session and cancel the matching pending ledger entry. No direct wallet balance mutation is allowed in the controller.

### Withdrawals

The request starts as `PENDING` or `UNDER_REVIEW`. A risk decision records the operator and reason, then transitions to `PROCESSING` through the withdrawal service/worker. Rejection must use the existing refund path so the locked amount and ledger remain consistent. The UI must display the destination, network, fee, risk score, and audit history before enabling approval.

### Supported assets

The backend allowlist is sourced from `INTERNAL_SUPPORTED_ASSET_CODES`, not duplicated in routes. The current schema contains ten internal codes (`BTC`, `USDT`, `ETH`, `BNB`, `SOL`, `LTC`, `TRX`, `USDC`, `BCH`, `GRAM`); any external “nine asset” requirement must be reconciled against this source before production rollout.

## Support and SLA flows

- KYC: `KycRequest` status transitions are `NOT_SUBMITTED`, `PENDING`, `APPROVED`, and `REJECTED`; evidence access is read-only until an operator decision.
- Seller onboarding: the admin-only `seller_fast_launch_enabled` setting controls whether new applicants may skip document submission; disabling it only blocks future skip requests and does not change existing seller records, access, or products. `Seller.onboardingMode` records the mode chosen for each application, and `kycSkippedAt` records an explicit skip. Existing seller rows default to secure verification. Secure applications continue through the existing KYC review path. Explicitly skipped applications are activated transactionally with the SELLER role while retaining `verificationLevel = 0`; active seller access and public product visibility do not depend on the current toggle state or onboarding mode.
- Standard tickets: `SupportTicket` uses its existing status and category fields; assignment and replies must be audited.
- Auto-P2P disputes: use the existing P2P order/dispute service, derive the 12-hour deadline from server timestamps, show overdue state, and require a resolution note. Do not duplicate P2P trades or create a parallel dispute table.

## Realtime and observability

Admin queues should refresh through Socket.IO events where available and retain polling as a recovery path. Every mutation emits an audit event and a frontend toast. Metrics should be derived from Prisma counts, not cached UI values.

## Delivery sequence

1. Add policy checks and typed admin controller schemas.
2. Add deposit/withdrawal review service methods with transactional audit records.
3. Add KYC and support-ticket admin endpoints.
4. Add the admin queue pages and detail drawers using the existing `AdminListPage`.
5. Add websocket invalidation events and SLA monitoring jobs.
6. Run backend tests, frontend build, and role-based integration tests for ADMIN and SUPPORT.
