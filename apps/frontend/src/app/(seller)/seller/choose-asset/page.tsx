'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { sellerCatalog } from '@/lib/seller-catalog';
import { useAuthStore } from '@/store/auth.store';
import { getSellerOnboardingPath, isApprovedSeller } from '@/lib/seller-access';
import { authService } from '@/services/auth.service';

export default function ChooseAssetPage() {
  const router = useRouter();
  const { updateUser } = useAuthStore();
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [value, setValue] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    authService.getMe()
      .then((freshUser) => {
        if (!isMounted) return;
        updateUser(freshUser);
        if (!isApprovedSeller(freshUser)) {
          router.replace(getSellerOnboardingPath('/seller/choose-asset'));
          return;
        }
        setIsCheckingAccess(false);
      })
      .catch(() => {
        if (!isMounted) return;
        const currentUser = useAuthStore.getState().user;
        if (!currentUser || !isApprovedSeller(currentUser)) {
          router.replace(getSellerOnboardingPath('/seller/choose-asset'));
          return;
        }
        setIsCheckingAccess(false);
      });
    return () => {
      isMounted = false;
    };
  }, [router, updateUser]);

  const selectedTemplate = sellerCatalog.find((template) => template.id === selectedId);
  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sellerCatalog.filter((template) => !query || template.name.toLowerCase().includes(query));
  }, [search]);

  const proceed = () => {
    if ((!selectedTemplate && selectedId !== 'custom') || !value) return;
    const query = new URLSearchParams({ template: selectedId, price: value });
    router.push(`/seller/create-listing?${query.toString()}`);
  };

  if (isCheckingAccess) {
    return <main className="min-h-[calc(100vh-5rem)] bg-[#0A0A0F]" aria-busy="true" />;
  }

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-[#0A0A0F] px-4 py-10 text-white sm:px-6 sm:py-16">
      <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-5xl items-center justify-center">
        <section className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#141420] p-6 shadow-2xl sm:p-10">
          <div className="mb-8">
            <button type="button" onClick={() => router.back()} className="mb-6 text-sm text-slate-400 hover:text-white">← Back</button>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-300">Seller Studio</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Choose your listing asset</h1>
            <p className="mt-3 max-w-xl text-slate-400">Select a standardized product name and denomination before adding your image, price, and digital code.</p>
          </div>

          <div className="space-y-6">
            <label className="block space-y-2">
              <span className="text-sm font-medium">Face value / denomination tier</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-bold text-indigo-300">$</span>
                <input inputMode="numeric" pattern="[0-9]*" value={value} onChange={(event) => setValue(event.target.value.replace(/\D/g, ''))} placeholder="100" className="h-12 w-full rounded-xl border border-white/10 bg-black/20 pl-8 pr-24 text-white outline-none focus:border-indigo-400" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">value tier</span>
              </div>
            </label>

            <div className="space-y-2">
              <label htmlFor="catalog-product" className="text-sm font-medium">Product or brand</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="catalog-product"
                  value={selectedTemplate ? selectedTemplate.name : search}
                  onFocus={() => setCatalogOpen(true)}
                  onChange={(event) => { setSelectedId(''); setSearch(event.target.value); setCatalogOpen(true); }}
                  placeholder="Search brands, games, or restaurants"
                  className="h-12 w-full rounded-xl border border-white/10 bg-black/20 pl-10 pr-10 text-white outline-none focus:border-indigo-400"
                  role="combobox"
                  aria-expanded={catalogOpen}
                  aria-controls="seller-catalog-options"
                />
                <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-transform ${catalogOpen ? 'rotate-180' : ''}`} />
                {catalogOpen && (
                  <div id="seller-catalog-options" className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-10 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-[#1b1b29] p-1 shadow-xl">
                    {filteredTemplates.map((template) => (
                      <button key={template.id} type="button" onClick={() => { setSelectedId(template.id); setSearch(''); setCatalogOpen(false); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-indigo-500/20 hover:text-white">
                        <span>{template.name}</span>
                        <span className="text-xs text-slate-500">{template.categoryName}</span>
                      </button>
                    ))}
                    {filteredTemplates.length === 0 && <p className="px-3 py-4 text-sm text-slate-400">No matching catalog item.</p>}
                    <button type="button" onClick={() => { setSelectedId('custom'); setSearch(''); setCatalogOpen(false); }} className="mt-1 flex w-full items-center justify-between rounded-lg border-t border-white/10 px-3 py-2.5 text-left text-sm font-semibold text-indigo-300 hover:bg-indigo-500/20">
                      <span>Something Else / Other</span><span className="text-xs font-normal text-slate-500">Custom entry</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <button type="button" onClick={proceed} disabled={!value || (!selectedTemplate && selectedId !== 'custom')} className="h-12 w-full rounded-xl bg-indigo-600 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
              Proceed to listing form
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
