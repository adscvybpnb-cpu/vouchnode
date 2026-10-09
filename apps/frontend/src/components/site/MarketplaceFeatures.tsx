import { ShieldCheck } from 'lucide-react';

const features = [
  'THE BEST DEALS IN GAMING',
  'EASY TO LIST, SELL & PAYOUT',
  'PROTECTED PAYMENTS',
  'VOUCHNODE GUARANTEE',
];

export function MarketplaceFeatures() {
  return (
    <section aria-label="Marketplace benefits" className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 items-center gap-3 rounded-xl bg-[#0b0f19] p-5 sm:grid-cols-2 xl:grid-cols-4">
        {features.map((feature) => (
          <div
            key={feature}
            className="flex items-center gap-2.5 rounded-lg border border-blue-500/30 bg-white/[0.03] px-4 py-3 transition duration-300 hover:-translate-y-0.5 hover:border-blue-500 hover:shadow-[0_0_15px_rgba(59,130,246,0.2)]"
          >
            <ShieldCheck aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-blue-400" />
            <span className="text-[13px] font-semibold tracking-wide text-blue-300">{feature}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
