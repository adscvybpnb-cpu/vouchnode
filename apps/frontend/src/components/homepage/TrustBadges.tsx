import { ShieldCheck, Zap, HeadphonesIcon, RefreshCcw } from 'lucide-react';

export function TrustBadges() {
  const badges = [
    { icon: <ShieldCheck className="w-8 h-8 text-primary" />, title: "Secure Payments", desc: "Escrow protection on all orders" },
    { icon: <Zap className="w-8 h-8 text-warning" />, title: "Instant Delivery", desc: "Automated digital code delivery" },
    { icon: <RefreshCcw className="w-8 h-8 text-success" />, title: "Buyer Protection", desc: "Money-back guarantee" },
    { icon: <HeadphonesIcon className="w-8 h-8 text-indigo-400" />, title: "24/7 Support", desc: "Round the clock assistance" }
  ];

  return (
    <section className="container mx-auto px-4 py-16">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {badges.map((b, i) => (
          <div key={i} className="flex flex-col items-center text-center p-6 bg-card border border-border rounded-2xl">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              {b.icon}
            </div>
            <h3 className="font-semibold text-lg mb-2 text-foreground">{b.title}</h3>
            <p className="text-sm text-muted-foreground">{b.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
