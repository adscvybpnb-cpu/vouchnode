'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { productService } from '@/services/product.service';
import type { Category, Product } from '@/types/api.types';

export default function EditListingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [price, setPrice] = useState('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([productService.getProduct(id), productService.getCategories()])
      .then(([loadedProduct, loadedCategories]) => {
        setProduct(loadedProduct);
        setLocked(['SOLD', 'SOLD_OUT', 'COMPLETED'].includes(String(loadedProduct.status)));
        setTitle(loadedProduct.name);
        setDescription(loadedProduct.description);
        setCategoryId(loadedProduct.categoryId || '');
        setPrice(String(loadedProduct.currentPrice));
        setCategories(loadedCategories);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load listing.'))
      .finally(() => setLoading(false));
  }, [id]);

  const appendCode = () => {
    const value = code.trim();
    if (value && !codes.includes(value)) {
      setCodes((current) => [...current, value]);
      setCode('');
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!product) return;
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await productService.updateProduct(product.id, {
        name: title.trim(),
        description: description.trim(),
        categoryId,
        originalPrice: Number(price),
        currentPrice: Number(price),
      });
      if (codes.length) await productService.addInventory(product.id, codes);
      setSuccess('Listing updated successfully. Redirecting...');
      window.setTimeout(() => router.push('/seller/products'), 700);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save listing.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="min-h-screen bg-[#0A0A0F] p-8 text-slate-300">Loading listing...</main>;

  if (locked) return (
    <main className="min-h-screen bg-[#0A0A0F] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-3xl rounded-3xl border border-orange-500/60 bg-[#141420] p-6 shadow-2xl sm:p-10">
        <div className="rounded-2xl border border-red-500/60 bg-red-500/10 p-6">
          <h1 className="text-xl font-bold text-orange-200">Listing modifications locked</h1>
          <p className="mt-3 text-sm leading-6 text-red-100">This listing has already been sold. Modifications are locked permanently for security and transaction integrity.</p>
        </div>
        <Button type="button" onClick={() => router.push('/seller/products')} className="mt-6 w-full bg-indigo-600 hover:bg-indigo-500">Back to Seller Studio</Button>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-[#0A0A0F] px-4 py-10 text-white sm:px-8">
      <form onSubmit={save} className="mx-auto max-w-3xl space-y-8 rounded-3xl border border-white/10 bg-[#141420] p-6 shadow-2xl sm:p-10">
        <button type="button" onClick={() => router.back()} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back</button>
        <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-300">Seller Studio</p><h1 className="mt-2 text-3xl font-bold">Edit Listing</h1><p className="mt-2 text-slate-400">Update your product details and inventory.</p></div>
        {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}
        {success && <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</p>}
        <label className="block space-y-2"><span className="text-sm font-medium">Title</span><Input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="block space-y-2"><span className="text-sm font-medium">Category</span>
          <select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-indigo-400">
            <option value="">Select a category</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label className="block space-y-2"><span className="text-sm font-medium">Selling price (USD)</span><Input required type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
        <label className="block space-y-2"><span className="text-sm font-medium">Description</span><textarea required value={description} onChange={(event) => setDescription(event.target.value)} rows={5} className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm outline-none focus:border-indigo-400" /></label>
        <section className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-5">
          <div><h2 className="text-lg font-semibold">Manage Inventory / Codes</h2><p className="mt-1 text-sm text-slate-400">Add new single-use gift card codes to increase available stock.</p></div>
          <div className="flex gap-2"><Input value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); appendCode(); } }} placeholder="Enter a new gift card code" /><Button type="button" variant="outline" onClick={appendCode}><Plus className="mr-2 h-4 w-4" /> Add code</Button></div>
          {codes.length > 0 && <ul className="space-y-2">{codes.map((value) => <li key={value} className="flex items-center justify-between rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-sm text-emerald-200"><span className="truncate">{value}</span><button type="button" onClick={() => setCodes((current) => current.filter((item) => item !== value))} aria-label="Remove code"><X className="h-4 w-4" /></button></li>)}</ul>}
        </section>
        <Button type="submit" disabled={saving || !product} className="w-full bg-indigo-600 hover:bg-indigo-500">{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save Changes</>}</Button>
      </form>
    </main>
  );
}
