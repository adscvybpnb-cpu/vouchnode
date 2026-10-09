'use client';

import { FormEvent, useEffect, useState } from 'react';
import { adminService } from '@/services/admin.service';
import type { Product } from '@/types/api.types';

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadProducts = async () => {
    const result = await adminService.getProducts(page);
    setProducts(result?.data ?? []);
    setTotalPages(result?.totalPages ?? 1);
  };

  useEffect(() => {
    void loadProducts();
  }, [page]);

  const updateProduct = async (product: Product, field: 'name' | 'currentPrice', value: string) => {
    setBusyId(product.id);
    setError('');
    try {
      await adminService.updateProduct(product.id, { [field]: field === 'currentPrice' ? Number(value) : value });
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update listing.');
    } finally {
      setBusyId(null);
    }
  };

  const deleteProduct = async (id: string) => {
    if (!window.confirm('Delete this listing and its remaining codes?')) return;
    setBusyId(id);
    setError('');
    try {
      await adminService.deleteProduct(id);
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete listing.');
    } finally {
      setBusyId(null);
    }
  };

  const addCode = async (id: string, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get('code') ?? '').trim();
    if (!code) return;
    setBusyId(id);
    setError('');
    try {
      await adminService.addCodes(id, [code]);
      event.currentTarget.reset();
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add code.');
    } finally {
      setBusyId(null);
    }
  };

  const visibleProducts = products.filter((product) => `${product.name} ${product.brand ?? ''}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <main className="min-h-screen bg-[#080d13] px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Admin catalog</p>
            <h1 className="mt-2 text-3xl font-black">Listings and unique codes</h1>
          </div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search catalog..." className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm outline-none focus:border-cyan-400" />
        </div>
        {error && <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#111923]">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="p-4">Listing</th><th className="p-4">Price</th><th className="p-4">Status</th><th className="p-4">Add unique code</th><th className="p-4">Actions</th></tr>
            </thead>
            <tbody>
              {visibleProducts.map((product) => (
                <tr key={product.id} className="border-b border-white/5 align-top">
                  <td className="p-4">
                    <input defaultValue={product.name} onBlur={(event) => void updateProduct(product, 'name', event.target.value)} className="w-full rounded-lg border border-transparent bg-transparent p-2 font-semibold hover:border-white/10 focus:border-cyan-400 focus:outline-none" />
                    <p className="px-2 pt-1 text-xs text-slate-500">{product.brand ?? 'Unbranded'} · {product.slug}</p>
                  </td>
                  <td className="p-4">
                    <input type="number" defaultValue={product.currentPrice} onBlur={(event) => void updateProduct(product, 'currentPrice', event.target.value)} className="w-28 rounded-lg border border-white/10 bg-white/5 p-2 focus:border-cyan-400 focus:outline-none" />
                  </td>
                  <td className="p-4"><span className={`rounded-full px-2 py-1 text-xs ${product.status === 'ACTIVE' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'}`}>{product.status}</span></td>
                  <td className="p-4">
                    <form onSubmit={(event) => void addCode(product.id, event)} className="flex gap-2">
                      <input name="code" placeholder="GF-..." className="w-40 rounded-lg border border-white/10 bg-white/5 p-2 text-xs focus:border-cyan-400 focus:outline-none" />
                      <button disabled={busyId === product.id} className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">Add</button>
                    </form>
                  </td>
                  <td className="p-4"><button onClick={() => void deleteProduct(product.id)} disabled={busyId === product.id} className="rounded-lg border border-rose-400/30 px-3 py-2 text-xs text-rose-300 hover:bg-rose-400/10 disabled:opacity-50">Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-center justify-center gap-4">
          <button disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-white/10 px-4 py-2 text-sm disabled:opacity-40">Previous</button>
          <span className="text-sm text-slate-400">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-white/10 px-4 py-2 text-sm disabled:opacity-40">Next</button>
        </div>
      </div>
    </main>
  );
}
