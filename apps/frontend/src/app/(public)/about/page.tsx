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
