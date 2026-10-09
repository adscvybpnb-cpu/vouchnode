'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { marketplaceCategories } from '@/lib/marketplace-data';
import { marketplaceCountries } from '@/lib/marketplace-countries';

export interface MarketplaceFilterValues {
  search: string;
  category: string;
  region: string;
  minPrice: string;
  maxPrice: string;
  deliveryType: string;
  rating: string;
}

const specialRegions = [
  { value: '', label: 'Any region' },
  { value: 'GLOBAL', label: 'Global' },
  { value: 'EUROPE', label: 'Europe' },
];

const inputClassName = 'w-full rounded-xl border border-white/10 bg-[#0d141d] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60';

export function ProductFilters({
  values,
  onChange,
  onClear,
  onClose,
  mobile = false,
}: {
  values: MarketplaceFilterValues;
  onChange: (field: keyof MarketplaceFilterValues, value: string) => void;
  onClear: () => void;
  onClose?: () => void;
  mobile?: boolean;
}) {
  const [countrySearch, setCountrySearch] = useState('');
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const countries = useMemo(() => {
    const query = countrySearch.trim().toLocaleLowerCase();
    return query
      ? marketplaceCountries.filter(({ code, name }) =>
          name.toLocaleLowerCase().includes(query) || code.toLocaleLowerCase().includes(query))
      : marketplaceCountries;
  }, [countrySearch]);
  const selectedRegion = specialRegions.find((region) => region.value === values.region)
    ?? marketplaceCountries.find((country) => country.code === values.region)
    ?? (values.region ? { code: values.region, name: values.region } : specialRegions[0]);

  const selectRegion = (value: string) => {
    onChange('region', value);
    setCountryPickerOpen(false);
    setCountrySearch('');
  };

  return (
    <div className={`flex min-h-0 flex-col rounded-2xl border border-white/10 bg-[#12131a] text-white ${mobile ? 'h-full rounded-none border-0 p-4' : 'p-4 xl:p-5'}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Marketplace</p>
          <h2 className="mt-1 text-lg font-semibold">Filters</h2>
        </div>
        {mobile && <button type="button" onClick={onClose} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300">Close</button>}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-400">Keywords</span>
          <input value={values.search} onChange={(event) => onChange('search', event.target.value)} placeholder="Search products..." className={inputClassName} />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-400">Category</span>
          <select value={values.category} onChange={(event) => onChange('category', event.target.value)} className={inputClassName}>
            <option value="all">All categories</option>
            {marketplaceCategories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}
          </select>
        </label>

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-slate-400">Region / Country</span>
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={countryPickerOpen}
            onClick={() => setCountryPickerOpen((open) => !open)}
            className={`${inputClassName} flex items-center justify-between text-left`}
          >
            <span>{'name' in selectedRegion ? selectedRegion.name : selectedRegion.label}</span>
            <ChevronDown aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
          </button>
          {countryPickerOpen && (
            <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#0d141d] p-2 shadow-2xl">
              <input
                type="search"
                aria-label="Search countries"
                value={countrySearch}
                onChange={(event) => setCountrySearch(event.target.value)}
                placeholder="Search countries..."
                className={`${inputClassName} mb-2`}
              />
              <div role="listbox" aria-label="Region or country" className="max-h-60 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
                {specialRegions.map((region) => (
                  <button
                    key={region.value || 'any'}
                    type="button"
                    role="option"
                    aria-selected={values.region === region.value}
                    onClick={() => selectRegion(region.value)}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10"
                  >
                    {region.label}
                  </button>
                ))}
                {countries.map((country) => (
                  <button
                    key={country.code}
                    type="button"
                    role="option"
                    aria-selected={values.region === country.code}
                    onClick={() => selectRegion(country.code)}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10"
                  >
                    {country.name}
                  </button>
                ))}
                {countries.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">No countries found.</p>}
              </div>
            </div>
          )}
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-slate-400">Price range (USDT)</legend>
          <div className="grid grid-cols-2 gap-2">
            <input aria-label="Minimum price" type="number" min="0" step="0.01" value={values.minPrice} onChange={(event) => onChange('minPrice', event.target.value)} placeholder="Min" className={inputClassName} />
            <input aria-label="Maximum price" type="number" min="0.01" step="0.01" value={values.maxPrice} onChange={(event) => onChange('maxPrice', event.target.value)} placeholder="Max" className={inputClassName} />
          </div>
        </fieldset>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-400">Delivery type</span>
          <select value={values.deliveryType} onChange={(event) => onChange('deliveryType', event.target.value)} className={inputClassName}>
            <option value="">Any delivery type</option>
            <option value="INSTANT">Instant</option>
            <option value="MANUAL">Manual</option>
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-400">Minimum rating</span>
          <select value={values.rating} onChange={(event) => onChange('rating', event.target.value)} className={inputClassName}>
            <option value="">Any rating</option>
            <option value="4">4 stars &amp; up</option>
            <option value="4.5">4.5 stars &amp; up</option>
            <option value="5">5 stars</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex shrink-0 border-t border-white/10 pt-4">
        <button type="button" onClick={onClear} className="w-full rounded-xl border border-white/10 px-3 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/5">Clear Filters</button>
      </div>
    </div>
  );
}
