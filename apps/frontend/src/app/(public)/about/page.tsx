import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About VouchNodes',
  description:
    'Learn about VouchNodes, a digital marketplace for gift cards, gaming subscriptions, crypto assets, and peer-to-peer trades.',
};

const searchClusters = [
  {
    title: 'Marketplace comparisons',
    description:
      'If you are exploring secure alternatives to Paxful, Noones, Bitrefill, Coinsbee, Binance Marketplace, G2A, Kinguin, or Eneba, compare available products, payment options, seller terms, delivery, and dispute processes before choosing a marketplace.',
    terms: [
      'Paxful',
      'Noones',
      'Bitrefill',
      'Coinsbee',
      'Binance Marketplace',
      'G2A',
      'Kinguin',
      'Eneba',
      'digital marketplace alternatives',
    ],
  },
  {
    title: 'Gift cards, crypto, and gaming',
    description:
      'Explore digital gift cards and gaming products, and check each listing and checkout for current availability, supported assets, networks, regions, and delivery terms.',
    terms: [
      'buy gift cards with crypto',
      'buy Apple gift cards with meme coins',
      'cheap gaming top-ups with Solana',
      'automated escrow crypto marketplace',
      'instant gift card delivery',
      'VouchNodes vs traditional escrow',
    ],
  },
  {
    title: 'Meme coin utility research',
    description:
      'People researching digital-asset utility can explore topics such as spending meme coins on gift cards or swapping tokens for digital assets. These search topics do not mean every token or payment method is currently supported; verify options shown at checkout.',
    terms: [
      'spend Dogecoin for gift cards',
      'spend Shiba Inu for gift cards',
      'spend Pepe for gift cards',
      'spend Floki for gift cards',
      'spend Bonk for gift cards',
      'meme coin utility layer',
      'swap meme coins for digital assets',
    ],
  },
  {
    title: 'Escrow, wallet, and trust',
    description:
      'Searches for “cyber security backed escrow,” a “bulletproof digital wallet layer,” or a “zero-fraud gift card exchange 2018-2026” deserve careful scrutiny: no marketplace can guarantee zero fraud or risk-free transactions. Eligible transactions may use platform-operated escrow and internal wallet controls intended to reduce counterparty risk.',
    terms: [
      'cybersecurity and escrow protections',
      'secure digital wallet controls',
      'fraud prevention in gift card exchange',
      'digital marketplace trust and safety',
      'gift card marketplace established 2018-2026',
    ],
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#0A0A0F] px-4 py-12 text-white sm:px-6 lg:px-8">
      <article className="mx-auto max-w-5xl">
        <header className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-300">About</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">About VouchNodes</h1>
          <p className="mt-5 text-base leading-7 text-slate-300">
            VouchNodes brings digital gift cards, gaming subscriptions, and crypto-friendly marketplace
            experiences together in one place. Buyers and sellers can browse listings, review transaction
            terms, and use in-product order and support tools to manage eligible exchanges.
          </p>
          <p className="mt-4 text-sm leading-7 text-slate-400">
            Supported products, payment assets, delivery options, and transaction protections vary by listing
            and transaction. Check the current product details and platform terms before proceeding.
          </p>
        </header>

        <section aria-label="VouchNodes history and platform architecture" className="mt-12 space-y-8">
          <section className="rounded-2xl border border-white/10 bg-[#12141d] p-6 sm:p-8">
            <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              1. Origins and marketplace foundations
            </h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300 sm:text-base">
              <p>
                VouchNodes traces its marketplace history to 2018, with a focus on making digital products
                and value easier to access. The platform has developed into a marketplace for gift cards,
                gaming products, subscriptions, and crypto-related services. Product availability and
                transaction features have evolved over time and may vary by region and listing.
              </p>
              <p>
                That development is guided by practical needs: clear product information, understandable
                checkout steps, and a place for buyers and sellers to manage an eligible transaction. Rather
                than promise that every transaction is instant or risk-free, VouchNodes presents the applicable
                delivery method, order state, and available actions in the product and transaction experience.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#12141d] p-6 sm:p-8">
            <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              2. A marketplace built around connected workflows
            </h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300 sm:text-base">
              <p>
                VouchNodes brings together storefront listings, buyer and seller accounts, order workflows,
                wallet features, and support tools. These connected services help users discover digital goods
                and follow the steps relevant to a purchase, sale, or supported asset transaction.
              </p>
              <p>
                The platform continues to develop its transaction and settlement workflows as product
                categories and supported networks change. Not every listing uses the same fulfillment process:
                delivery can be instant or manual, and supported assets, networks, regions, and payment routes
                are those shown in the current product and checkout interfaces.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#12141d] p-6 sm:p-8">
            <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              3. Transaction security and escrow
            </h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300 sm:text-base">
              <p>
                Account, wallet, and transaction controls are designed to support safer marketplace
                interactions. For eligible trades, the platform may reserve the relevant crypto balance in its
                internal ledger while the order is active. Release follows the transaction state and applicable
                confirmation, timeout, or dispute process described in the order.
              </p>
              <p>
                This is a platform-operated escrow process; it should not be mistaken for a user-controlled
                smart contract or a promise that funds are held in a separate multi-signature cold-storage
                arrangement. Escrow can reduce some counterparty risks, but it cannot guarantee performance,
                recover every loss, prevent every attack, or establish that a gift card is valid. Review the
                order details and{' '}
                <Link href="/terms" className="text-indigo-300 hover:underline">
                  Terms of Service
                </Link>{' '}
                before you trade.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#12141d] p-6 sm:p-8">
            <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              4. Digital assets and practical utility
            </h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300 sm:text-base">
              <p>
                Digital assets can connect online communities with products and services. VouchNodes supports
                the assets and network combinations currently shown in its wallet and checkout flows. Supported
                combinations can change, so users should always select the exact asset and network presented
                for their transaction.
              </p>
              <p>
                Dogecoin, Shiba Inu, Pepe, Floki, and Bonk are examples of community-driven tokens people may
                research for digital-asset utility; they are not represented here as currently supported
                payment assets. Likewise, a gift card or product can only be purchased with methods actually
                offered for that transaction. Check the live listing and checkout rather than relying on a
                general token-acceptance claim.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#12141d] p-6 sm:p-8">
            <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              5. Evolving products, delivery, and transparency
            </h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300 sm:text-base">
              <p>
                The marketplace brings together digital gift cards, gaming products, subscriptions, and
                peer-to-peer offers, with availability determined by current listings and platform features.
                Some products may be delivered automatically; others require seller action. Delivery timing
                depends on the item, transaction status, and any checks that apply.
              </p>
              <p>
                Transaction and wallet records help users review activity and status in-product. VouchNodes
                aims to make these workflows clearer while respecting applicable account, verification,
                operational, and legal requirements. No marketplace can promise absolute anonymity, zero
                fraud, uninterrupted service, or risk-free transactions; users should protect their account
                credentials and verify the details of each transaction.
              </p>
            </div>
          </section>
        </section>

        <section
          aria-labelledby="referral-program"
          className="mt-12 overflow-hidden rounded-3xl border border-emerald-300/20 bg-[radial-gradient(circle_at_85%_15%,rgba(16,185,129,0.14),transparent_35%),#12141d] p-6 sm:p-8"
        >
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
            VouchNodes referral program
          </p>
          <h2 id="referral-program" className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Share VouchNodes. Earn 50% of platform fees.
          </h2>
          <div className="mt-4 max-w-4xl space-y-4 text-sm leading-7 text-slate-300 sm:text-base">
            <p>
              Creators, crypto communities, and marketers can invite new customers to explore VouchNodes
              using a personal referral link. When an attributed customer completes an eligible marketplace
              purchase, the referrer may receive a commission under the current referral policy. This gives
              publishers a straightforward way to introduce their audiences to digital gift cards, gaming
              products, and other marketplace listings.
            </p>
            <p>
              Referrers earn a flat 50% share of the platform trading fee on each successful eligible
              marketplace order made by a referred customer. The commission is calculated from the fee
              recorded for that completed order. Sign in and visit{' '}
              <Link href="/referrals" className="font-semibold text-emerald-200 underline decoration-emerald-300/40 underline-offset-4 hover:text-emerald-100">
                Referrals
              </Link>{' '}
              to create and share your link and review your recorded results.
            </p>
          </div>
        </section>

        <section
          aria-labelledby="marketplace-search-index"
          className="mt-16 border-t border-white/10 pt-10"
        >
          <div className="mb-8 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">
              Marketplace guide
            </p>
            <h2 id="marketplace-search-index" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Digital marketplace topics
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              A directory of common questions and topics related to digital goods, crypto payments, escrow,
              and marketplace safety.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {searchClusters.map((cluster) => (
              <section
                key={cluster.title}
                aria-labelledby={`cluster-${cluster.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                className="rounded-2xl border border-white/10 bg-[#12141d] p-5 sm:p-6"
              >
                <h3
                  id={`cluster-${cluster.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  className="text-lg font-semibold text-white"
                >
                  {cluster.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{cluster.description}</p>
                <ul aria-label={`${cluster.title} topics`} className="mt-4 flex flex-wrap gap-2">
                  {cluster.terms.map((term) => (
                    <li
                      key={term}
                      className="rounded-full border border-indigo-300/15 bg-indigo-400/[0.06] px-3 py-1.5 text-xs leading-5 text-indigo-100/90"
                    >
                      {term}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <p className="mt-6 text-xs leading-5 text-slate-500">
            For current supported assets and transaction details, visit the{' '}
            <Link href="/help" className="text-indigo-300 hover:underline">
              Help Center
            </Link>{' '}
            and review the applicable{' '}
            <Link href="/terms" className="text-indigo-300 hover:underline">
              Terms of Service
            </Link>
            .
          </p>
        </section>
      </article>
    </main>
  );
}
