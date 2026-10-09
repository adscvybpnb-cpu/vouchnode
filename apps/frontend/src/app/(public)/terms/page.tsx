import Link from 'next/link';

const assets = [
  ['BTC', 'Bitcoin'],
  ['BCH', 'Bitcoin Cash'],
  ['LTC', 'Litecoin'],
  ['TRX', 'Tron (TRC-20)'],
  ['USDT', 'Supported token networks shown in the wallet'],
  ['USDC', 'Supported token networks shown in the wallet'],
  ['BNB', 'BNB Smart Chain (BEP-20)'],
  ['SOL', 'Solana'],
  ['ETH', 'Ethereum (ERC-20)'],
];

function Clause({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-white/10 pt-6">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-slate-300">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#0A0A0F] px-4 py-12 text-white sm:px-6 lg:px-8">
      <article className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-[#10121a] p-6 shadow-2xl sm:p-10">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-300">Legal</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">Terms of Service &amp; Privacy Notice</h1>
          <p className="mt-3 text-sm text-slate-400">Last updated: September 28, 2026</p>
          <p className="mt-5 text-sm leading-7 text-slate-300">
            These terms govern your access to VouchNode and its marketplace, peer-to-peer trading, wallet,
            escrow, and support features. By creating an account or using a feature, you agree to these
            terms. If you do not agree, do not use the service. This general notice is not jurisdiction-specific
            legal advice and does not limit non-waivable rights under laws that apply to you.
          </p>
        </header>

        <div className="space-y-7">
          <Clause title="1. Eligibility, account registration, and verification">
            <p>You must be legally able to enter a binding agreement and meet the minimum age and other eligibility requirements that apply where you live. You are responsible for accurate registration details, safeguarding your credentials, and all activity conducted through your account.</p>
            <p>We may request identity, business, source-of-funds, transaction, or other verification information where required by law, payment or blockchain risk controls, or platform policy. Access to deposits, trades, withdrawals, or balances may be delayed or restricted while checks are pending.</p>
          </Clause>

          <Clause title="2. Marketplace and peer-to-peer transactions">
            <p>Users are responsible for the accuracy and legality of their listings, offers, payment instructions, digital goods, and representations. Review all product descriptions, seller terms, rates, fees, deadlines, payment details, and order status before accepting a transaction.</p>
            <p>Keep transaction communications and evidence in the platform’s order or trade workspace. Do not move a transaction off-platform, share account security credentials, submit false payment evidence, or make a payment to a different recipient than the one shown in the active order.</p>
            <p>Gift cards and digital assets may be region-restricted, expired, redeemed, revoked, or subject to issuer terms. VouchNode does not control third-party issuers, banks, exchanges, or blockchain networks.</p>
          </Clause>

          <Clause title="3. Escrow and custody of trade assets">
            <p>
              Eligible trades use a platform-operated intermediary escrow process: the relevant crypto balance is
              reserved or locked in the platform’s internal ledger while the order is active and released according
              to the order state, buyer confirmation, timeout rules, or a dispute resolution. This is an escrow
              mechanism intended to reduce counterparty risk and protect both sides during the exchange.
            </p>
            <p>
              Escrow is not a guarantee that a counterparty will perform, that a gift card is valid, that funds
              can always be recovered, or that loss is impossible. “100% secure” is not a promise or warranty.
              Escrow availability and controls depend on the specific transaction and are indicated in its
              order details. Platform-held wallet balances may be custodial; they are not necessarily held in
              a user-controlled smart contract or segregated on-chain address for each trade.
            </p>
            <p>Do not confirm delivery or authorize release until you have independently checked the exchanged goods, payment, and order terms. Once released or transferred on-chain, recovery may not be possible.</p>
          </Clause>

          <Clause title="4. Disputes, evidence, and transaction finality">
            <p>Initiate a trade dispute only from the relevant order or P2P trade details page while the dispute control is available. Follow displayed deadlines, provide truthful and complete evidence, and respond promptly to reasonable requests. General technical or account issues may be reported through the <Link href="/support/ticket" className="text-indigo-300 hover:underline">support ticket form</Link>; a general ticket is not a substitute for an order dispute.</p>
            <p>VouchNode may review order records, in-product messages, submitted evidence, transaction history, and available blockchain data to administer a dispute. We may apply the order rules and available evidence to determine whether escrow should remain reserved or be released. A platform determination does not reverse a blockchain transaction or bind an external issuer, bank, or court.</p>
            <p>Blockchain transactions, once sufficiently confirmed, are generally irreversible. Network delays, congestion, validator/miner actions, reorganizations, outages, forks, and incorrect addresses or networks can affect transfers. You bear the risk of verifying the asset, network, destination, amount, and any memo/tag before sending.</p>
          </Clause>

          <Clause title="5. Supported crypto assets and network security">
            <p>
              The wallet currently lists these nine assets: BTC, BCH, LTC, TRX, USDT, USDC, BNB, SOL, and ETH.
              For USDT and USDC, the wallet may offer the following eight networks: Tron (TRC-20), BNB Smart
              Chain (BEP-20), Ethereum (ERC-20), Polygon, Arbitrum One, Base, Optimism, and Solana. Other
              assets are supported only on the corresponding network presented by the live deposit or withdrawal
              form. Supported combinations can change; the in-product selector is authoritative.
            </p>
            <p>
              We use network-specific address generation, transaction observation/confirmation checks, and
              risk-based operational review where applicable. Some asset/network transactions may require
              manual review and take longer to credit. These controls are not a certification, insurance policy,
              guarantee against attack, or representation that every supported chain has identical protections.
              You must send the correct asset on the exact network displayed for your generated address.
            </p>
            <p>Network protocols, token contracts, validators, exchanges, bridges, and wallet software are third-party systems outside VouchNode’s control. We do not promise uninterrupted network availability, token value, liquidity, or recovery for a wrong-network transfer.</p>
          </Clause>

          <Clause title="6. Deposits, withdrawals, and fees">
            <p>Deposits are credited only after the platform receives the required network confirmations and completes any applicable review. Deposit address sessions or instructions may expire. Do not reuse an expired or superseded address unless the wallet explicitly confirms it remains valid.</p>
            <p>The current standard withdrawal platform fee is 1% by default, subject to the fee schedule displayed in the product and any applicable configured fees. Network transaction costs vary by asset, network conditions, and processing route. The amount debited, fee, and expected net amount should be reviewed in the withdrawal flow before submission.</p>
            <p>Balances may be categorized as available, pending, frozen, or escrow-reserved. Only available funds may be eligible for withdrawal, and withdrawals may be delayed or refused for verification, security, legal, network, or operational reasons. Never submit a withdrawal to an address you have not independently verified.</p>
          </Clause>

          <Clause title="7. Prohibited conduct and anti-fraud rules">
            <p>You must not use the platform for fraud, theft, money laundering, terrorist financing, sanctions evasion, market manipulation, unauthorized payment activity, stolen or compromised payment instruments, chargeback abuse, trafficking in stolen or counterfeit codes, or any unlawful purpose.</p>
            <p>Prohibited conduct also includes impersonation, fake receipts or screenshots, collusion, account sales, attempts to bypass escrow, coercing a user to release funds, exploiting bugs, unauthorized access, malicious software, harassment, and submitting materially false verification or dispute information.</p>
            <p>Users must comply with applicable sanctions, anti-money-laundering, consumer-protection, tax, and other laws. VouchNode may conduct risk-based screening and transaction monitoring, request additional information, delay activity, preserve records, restrict access, or make disclosures to competent authorities when legally required or reasonably necessary to protect the service and users. We do not claim that these measures make every transaction compliant in every jurisdiction.</p>
          </Clause>

          <Clause title="8. Suspension, restriction, and account closure">
            <p>We may suspend, limit, or close an account, listing, trade, deposit, or withdrawal where we reasonably suspect fraud, policy or legal violations, account compromise, abusive conduct, security risk, incomplete verification, or harm to users or the platform; where required by law or a competent authority; or where continued service is not operationally safe.</p>
            <p>Where lawful and safe to do so, we may provide notice and an opportunity to respond. Restrictions may remain in place while an investigation, dispute, verification, or legal hold is pending. We may preserve relevant records and cooperate with lawful requests. A suspension does not automatically forfeit legitimate funds, but access or release may be delayed where law, risk controls, or unresolved claims require it.</p>
          </Clause>

          <Clause title="9. Privacy notice and personal information">
            <p>We process information you provide (such as account, contact, verification, support, listing, and dispute information), transaction and wallet records, device/session and security data, and technical information needed to operate and protect the service.</p>
            <p>We use information to create and secure accounts; facilitate listings, trades, payments, escrow, and support; verify users and investigate fraud; meet legal obligations; maintain service reliability; and enforce these terms. Information may be shared with service providers that process it for us, transaction counterparties to the extent needed to complete an order, professional advisers, and authorities or other parties when required or permitted by law.</p>
            <p>We retain information for as long as reasonably needed for these purposes, legal obligations, dispute handling, security, and recordkeeping. Retention periods can vary by record and applicable law. We apply administrative and technical safeguards appropriate to the information and risk, but no internet service or storage system can be guaranteed absolutely secure.</p>
            <p>Depending on your location, you may have rights to access, correct, delete, restrict, object to, or receive a copy of personal information, subject to legal exceptions. You may submit a request through the <Link href="/support/ticket" className="text-indigo-300 hover:underline">support form</Link>. We may need to verify your identity and retain certain records where the law requires or permits.</p>
          </Clause>

          <Clause title="10. Service availability, disclaimers, and liability">
            <p>The platform and third-party network services are provided subject to availability. To the maximum extent permitted by applicable law, we disclaim implied warranties and are not responsible for losses caused by user error, incorrect addresses or networks, third-party issuers or payment providers, network disruption, compromised user devices or credentials, or events outside our reasonable control.</p>
            <p>Nothing in these terms excludes liability or rights that cannot lawfully be excluded or limited. To the extent permitted by law, VouchNode is not liable for indirect, incidental, special, punitive, or consequential losses, loss of profits, or loss of digital asset value. These terms do not guarantee any particular dispute outcome or recovery.</p>
          </Clause>

          <Clause title="11. Changes and contact">
            <p>We may update these terms as the service, risks, or applicable requirements change. The updated version will be posted here with a revised date. Continued use after an update takes effect constitutes acceptance to the extent permitted by law; if you disagree, stop using the affected service and contact support about account closure or outstanding transactions.</p>
            <p>For account, privacy, or general support requests, use the <Link href="/support/ticket" className="text-indigo-300 hover:underline">support ticket form</Link>. For an active trade issue, open a dispute from the relevant order or trade details page.</p>
          </Clause>

          <Clause title="Appendix: supported wallet assets">
            <ul className="grid gap-2 sm:grid-cols-2">
              {assets.map(([symbol, network]) => <li key={symbol} className="rounded-lg bg-white/5 px-4 py-2"><strong className="text-white">{symbol}</strong> — {network}</li>)}
            </ul>
          </Clause>
        </div>
      </article>
    </main>
  );
}
