'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpDown, ChevronDown, Copy, Eye, EyeOff, ImageIcon, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { productService } from '@/services/product.service';
import type { Product } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/auth.store';
import { getSellerOnboardingPath, isApprovedSeller } from '@/lib/seller-access';

type ListingTab = 'ALL' | 'DRAFT' | 'ON SALE' | 'SOLD' | 'EXPIRED';
type SoldTab = 'SHOW ALL' | 'PENDING' | 'IN-PROGRESS' | 'RECEIVED' | 'UNDER REVIEW/DISPUTE' | 'CANCELLED' | 'COMPLETE';
type EditorMode = 'clone' | 'edit';

const tabs: ListingTab[] = ['ALL', 'DRAFT', 'ON SALE', 'SOLD', 'EXPIRED'];
const soldTabs: SoldTab[] = ['SHOW ALL', 'PENDING', 'IN-PROGRESS', 'RECEIVED', 'UNDER REVIEW/DISPUTE', 'CANCELLED', 'COMPLETE'];

const isSold = (product: Product) => ['SOLD', 'SOLD_OUT', 'COMPLETED'].includes(product.status);
const isOnSale = (product: Product) => ['ACTIVE', 'ON_SALE'].includes(product.status) && !isSold(product) && product.stock > 0;
const isUnderReview = (product: Product) => ['PENDING_REVIEW', 'INACTIVE', 'DISPUTED', 'UNDER_REVIEW'].includes(product.status);
const productCategory = (product: Product) => product.brand || product.categoryId || 'Uncategorized';
const latestOrderStatus = (product: Product) => product.orders?.[0]?.status || '';
const latestOrderId = (product: Product) => product.orders?.[0]?.id || '';
const matchesSoldTab = (product: Product, tab: SoldTab) => {
  if (tab === 'SHOW ALL') return true;
  const status = latestOrderStatus(product);
  if (tab === 'PENDING') return ['CREATED', 'PAYMENT_PENDING'].includes(status);
  if (tab === 'IN-PROGRESS') return ['PAID', 'DELIVERED', 'WAITING_BUYER_CONFIRMATION'].includes(status);
  if (tab === 'RECEIVED') return status === 'DELIVERED';
  if (tab === 'UNDER REVIEW/DISPUTE') return ['DISPUTE_OPEN', 'DISPUTED_WAITING_SELLER', 'DISPUTED_WAITING_BUYER', 'ESCALATED_TO_ADMIN'].includes(status);
  if (tab === 'CANCELLED') return ['CANCELLED', 'REFUNDED', 'EXPIRED'].includes(status);
  return status === 'COMPLETED';
};
const soldStatusLabel = (product: Product) => {
  const status = latestOrderStatus(product);
  if (['DISPUTE_OPEN', 'DISPUTED_WAITING_SELLER', 'DISPUTED_WAITING_BUYER', 'ESCALATED_TO_ADMIN'].includes(status)) return 'SOLD · UNDER REVIEW / DISPUTE';
  if (status === 'COMPLETED') return 'SOLD · COMPLETE';
  if (status === 'CANCELLED' || status === 'REFUNDED' || status === 'EXPIRED') return `SOLD · ${status}`;
  return 'SOLD · TRANSACTION IN PROGRESS';
};

export default function SellerProductsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const currentUser = useAuthStore((state) => state.user);
  const userId = currentUser?.id;
  const [products, setProducts] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<ListingTab>('ALL');
  const [soldTab, setSoldTab] = useState<SoldTab>('SHOW ALL');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [price, setPrice] = useState('ALL');
  const [sort, setSort] = useState<'asc' | 'desc'>('desc');
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [editor, setEditor] = useState<{ mode: EditorMode; product: Product } | null>(null);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorDescription, setEditorDescription] = useState('');
  const [editorCategory, setEditorCategory] = useState('');
  const [editorPrice, setEditorPrice] = useState('');
  const [editorCode, setEditorCode] = useState('');
  const [editorSaving, setEditorSaving] = useState(false);
  const [isFilterTransitionPending, startFilterTransition] = useTransition();

  const loadProducts = async () => {
    setLoading(true);
    try {
      if (!userId) {
        setProducts([]);
        return;
      }
      const result = await productService.getMyProducts(userId, {
        limit,
        sortOrder: sort,
        status: activeTab === 'SOLD' ? 'SOLD' : undefined,
      });
      const rows = Array.isArray(result?.data) ? result.data : [];
      console.log('[SellerProducts] /products/mine response', {
        userId,
        listingCount: rows.length,
        total: result.total,
        payload: result,
      });
      setProducts(rows);
    } catch (error) {
      console.error('[SellerProducts] /products/mine request failed', {
        userId,
        error,
      });
      toast({ title: 'Unable to load listings', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser && !isApprovedSeller(currentUser)) {
      router.replace(getSellerOnboardingPath('/seller/products'));
      return;
    }
    void loadProducts();
  }, [currentUser, limit, sort, userId, activeTab]);

  useEffect(() => {
    void productService.getCategories().then((items) => setCategoryOptions(items as Array<{ id: string; name: string; slug: string }>));
  }, []);

  const safeProducts = useMemo(() => (Array.isArray(products) ? products : []).filter((product): product is Product => Boolean(product?.id)), [products]);
  const categories = useMemo(() => ['ALL', ...Array.from(new Set(safeProducts.map(productCategory)))], [safeProducts]);
  const visibleProducts = useMemo(() => safeProducts.filter((product) => {
    const matchesTab = activeTab === 'ALL'
      || (activeTab === 'DRAFT' && product.status === 'DRAFT')
      || (activeTab === 'ON SALE' && isOnSale(product))
      || (activeTab === 'SOLD' && isSold(product))
      || (activeTab === 'EXPIRED' && ['EXPIRED', 'SUSPENDED', 'INACTIVE'].includes(product.status));
    const matchesSearch = !search.trim() || `${product.name} ${product.description}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesCategory = category === 'ALL' || productCategory(product) === category;
    const matchesPrice = price === 'ALL'
      || (price === 'UNDER_50' && product.currentPrice < 50)
      || (price === '50_200' && product.currentPrice >= 50 && product.currentPrice <= 200)
      || (price === 'OVER_200' && product.currentPrice > 200);
    const matchesSoldStatus = activeTab !== 'SOLD' || matchesSoldTab(product, soldTab);
    return matchesTab && matchesSoldStatus && matchesSearch && matchesCategory && matchesPrice;
  }), [products, activeTab, soldTab, search, category, price]);

  const updateProduct = async (product: Product, data: Record<string, unknown>, message: string) => {
    try {
      const updated = data.status === 'ACTIVE' || data.status === 'HIDDEN'
        ? await productService.updateProductStatus(product.id, data.status)
        : await productService.updateProduct(product.id, data);
      setProducts((current) => current.map((item) => item.id === product.id ? updated : item));
      toast({ title: message });
    } catch (error) {
      toast({ title: 'Action failed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    }
  };

  const deleteProduct = async (product: Product) => {
    try {
      await productService.deleteProduct(product.id);
      setProducts((current) => current.filter((item) => item.id !== product.id));
      router.refresh();
      toast({ title: 'Listing deleted' });
    } catch (error) {
      toast({ title: 'Delete failed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    }
  };

  const toggleVisibility = async (product: Product) => {
    await updateProduct(
      product,
      { status: product.status === 'HIDDEN' ? 'ACTIVE' : 'HIDDEN' },
      product.status === 'HIDDEN' ? 'Listing is now visible' : 'Listing hidden',
    );
  };

  const cloneProduct = async (product: Product) => {
    openEditor(product, 'clone');
  };

  const openEditor = (product: Product, mode: EditorMode) => {
    setEditor({ product, mode });
    setEditorTitle(product.name);
    setEditorDescription(product.description);
    setEditorPrice(String(product.currentPrice));
    setEditorCode('');
    setEditorCategory(product.category?.slug || categoryOptions.find((category) => category.id === product.categoryId)?.slug || '');
  };

  const saveEditor = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editor) return;
    const category = categoryOptions.find((item) => item.slug === editorCategory);
    if (!category || !editorTitle.trim() || !editorDescription.trim() || Number(editorPrice) <= 0 || (editor.mode === 'clone' && !editorCode.trim())) {
      toast({ title: 'Complete all required fields', variant: 'destructive' });
      return;
    }
    setEditorSaving(true);
    try {
      if (editor.mode === 'clone') {
        const clone = await productService.createProduct({
          name: editorTitle.trim(),
          description: editorDescription.trim(),
          category: category.slug,
          categoryId: category.id,
          originalPrice: Number(editorPrice),
          currentPrice: Number(editorPrice),
          deliveryType: editor.product?.deliveryType || 'INSTANT',
          images: (editor.product?.images || []).map((image) => image?.url).filter((url): url is string => Boolean(url)),
          inventoryDetails: [editorCode.trim()],
          tags: [],
        });
        setProducts((current) => [clone, ...current]);
        toast({ title: 'Listing duplicated' });
      } else {
        const updated = await productService.updateProduct(editor.product.id, {
          name: editorTitle.trim(),
          description: editorDescription.trim(),
          categoryId: category.id,
          originalPrice: Number(editorPrice),
          currentPrice: Number(editorPrice),
        });
        setProducts((current) => current.map((item) => item.id === updated.id ? updated : item));
        toast({ title: 'Listing updated' });
      }
      setEditor(null);
    } catch (error) {
      toast({ title: 'Save failed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setEditorSaving(false);
    }
  };

  const quickAction = (label: string, product: Product) => {
    if (isSold(product)) return;
    if (label === 'DELETE') return deleteProduct(product);
    if (label === 'CHANGE PRICE') return openEditor(product, 'edit');
    if (label === 'LIST') return updateProduct(product, { status: 'ACTIVE' }, 'Listing is now visible');
    if (label === 'TAKE OFF SALE') return updateProduct(product, { status: 'HIDDEN' }, 'Listing hidden');
  };

  const quickActions = activeTab === 'DRAFT'
    ? ['CHANGE PRICE', 'LIST', 'DELETE']
    : activeTab === 'ON SALE'
      ? ['CHANGE PRICE', 'TAKE OFF SALE']
      : [];

  return (
    <main className="min-h-screen bg-[#0A0A0F] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Seller Studio</p><h1 className="mt-2 text-3xl font-bold">My listings</h1><p className="mt-1 text-sm text-slate-400">Manage pricing, visibility, and sales activity.</p></div>
          <Button onClick={() => router.push('/seller/create-listing')} className="bg-indigo-600 hover:bg-indigo-500"><Plus className="mr-2 h-4 w-4" /> START SELLING</Button>
        </div>
        <div className="overflow-x-auto border-b border-white/10">
          <div className="flex min-w-max gap-6">
            {tabs.map((tab) => <button key={`listing-tab-${tab}`} type="button" onClick={() => startFilterTransition(() => setActiveTab(tab))} className={`border-b-2 px-1 pb-3 text-sm font-bold tracking-wide ${activeTab === tab ? 'border-indigo-400 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>{tab}</button>)}
          </div>
        </div>
        {activeTab === 'SOLD' && <div key="sold-subtabs" className="mt-4 flex gap-2 overflow-x-auto pb-1">{soldTabs.map((tab) => <button key={`sold-tab-${tab}`} type="button" onClick={() => startFilterTransition(() => setSoldTab(tab))} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${soldTab === tab ? 'bg-indigo-500/20 text-indigo-200' : 'bg-white/5 text-slate-500'}`}>{tab}</button>)}</div>}
        <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_auto_auto_auto_auto]">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your listings" className="pl-9" /></div>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-md border border-white/10 bg-[#141420] px-3 text-sm text-slate-300"><option value="ALL">Category: ALL</option>{categories.slice(1).map((item) => <option key={item}>{item}</option>)}</select>
          <select value={price} onChange={(event) => setPrice(event.target.value)} className="rounded-md border border-white/10 bg-[#141420] px-3 text-sm text-slate-300"><option value="ALL">Price: ALL</option><option value="UNDER_50">Under $50</option><option value="50_200">$50 - $200</option><option value="OVER_200">Over $200</option></select>
          <button onClick={() => setSort((current) => current === 'desc' ? 'asc' : 'desc')} className="flex items-center justify-center gap-2 rounded-md border border-white/10 bg-[#141420] px-3 text-xs font-semibold text-slate-300"><ArrowUpDown className="h-4 w-4" /> CREATED: {sort === 'desc' ? 'RECENT' : 'OLDEST'}</button>
          <select value={limit} onChange={(event) => setLimit(Number(event.target.value))} className="rounded-md border border-white/10 bg-[#141420] px-3 text-xs font-semibold text-slate-300"><option value={50}>Show: 50 ROWS</option><option value={25}>Show: 25 ROWS</option><option value={100}>Show: 100 ROWS</option></select>
        </div>
        <div className={`mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#141420] ${isFilterTransitionPending ? 'opacity-70 transition-opacity' : ''}`}>
          {loading ? <div key="listings-loading" className="flex items-center justify-center gap-2 p-16 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /> Loading listings...</div> : visibleProducts.length === 0 ? <div key="listings-empty" className="p-16 text-center text-slate-500"><ImageIcon className="mx-auto mb-3 h-10 w-10" />No listings match these filters.</div> : <div key="listings-content" className="divide-y divide-white/5">{visibleProducts.map((product) => {
            const orderId = latestOrderId(product);
            const rowContent = <>
            <div className="relative shrink-0">
              <img src={product?.images?.[0]?.url || '/placeholder-product.png'} alt={product?.name || 'Product listing'} className="h-16 w-16 rounded-xl object-cover" />
              {isSold(product) && <span className="absolute -right-2 -top-2 rounded-full border border-red-300/40 bg-red-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg shadow-red-950/50">Sold</span>}
            </div>
            <div className="min-w-[180px] flex-1"><p className="font-semibold text-white">{product?.name || 'Untitled listing'}</p><p className="mt-1 text-xs text-slate-500">{productCategory(product)} · {product?.stock ?? 0} available</p></div>
            <div className="text-right"><p className="font-semibold text-white">{Number(product?.currentPrice || 0).toFixed(2)} {product?.currency || 'USD'}</p><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${isSold(product) ? 'bg-red-500/15 text-red-300' : isUnderReview(product) ? 'bg-amber-400/15 text-amber-300' : isOnSale(product) ? 'bg-emerald-400/15 text-emerald-300' : 'bg-slate-500/15 text-slate-300'}`}><span className={`h-1.5 w-1.5 rounded-full ${isSold(product) ? 'bg-red-400' : isUnderReview(product) ? 'bg-amber-300' : isOnSale(product) ? 'bg-emerald-300' : 'bg-slate-400'}`} />{isSold(product) ? soldStatusLabel(product) : isUnderReview(product) ? 'UNDER REVIEW / DISPUTE' : isOnSale(product) ? 'ON SALE' : (product?.status || 'UNKNOWN').replace('_', ' ')}</span></div>
            {!isSold(product) && <div className="flex flex-wrap items-center justify-end gap-2" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
              {quickActions.map((action) => <Button key={action} variant={action === 'DELETE' ? 'ghost' : 'outline'} size="sm" onClick={() => void quickAction(action, product)} className={action === 'DELETE' ? 'text-red-300 hover:text-red-200' : ''}>{action}</Button>)}
              {quickActions.length === 0 && <Button variant="outline" size="sm" onClick={() => openEditor(product, 'edit')}>CHANGE PRICE</Button>}
              <Button variant="ghost" size="icon" onClick={() => void toggleVisibility(product)} title={product.status === 'HIDDEN' ? 'Show listing' : 'Hide listing'} aria-label={product.status === 'HIDDEN' ? 'Show listing' : 'Hide listing'}>{product.status === 'HIDDEN' ? <Eye className="h-4 w-4 text-emerald-300" /> : <EyeOff className="h-4 w-4 text-slate-300" />}</Button>
              <Button variant="ghost" size="icon" onClick={() => void cloneProduct(product)} title="Duplicate listing" aria-label="Duplicate listing"><Copy className="h-4 w-4 text-indigo-300" /></Button>
              <Button variant="ghost" size="icon" onClick={() => void deleteProduct(product)} title="Delete listing" aria-label="Delete listing"><Trash2 className="h-4 w-4 text-red-300" /></Button>
            </div>}
            </>;
            const rowClassName = `flex flex-wrap items-center gap-4 p-4 hover:bg-white/[0.02] ${orderId ? 'focus:outline-none focus:ring-2 focus:ring-indigo-400/60' : ''}`;
            if (orderId) {
              return <Link key={`listing-row-${orderId}`} href={`/orders/${encodeURIComponent(orderId)}`} prefetch={true} className={`${rowClassName} cursor-pointer`} aria-label={`Open traditional marketplace order ${orderId} for ${product.name}`}>{rowContent}</Link>;
            }
            return <div key={`listing-row-${product.id}`} className={rowClassName}>{rowContent}</div>;
          })}</div>}
        {editor && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="listing-editor-title">
          <form onSubmit={saveEditor} className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-[#141420] p-6 shadow-2xl">
            <div className="flex items-center justify-between"><h2 id="listing-editor-title" className="text-xl font-bold">{editor.mode === 'clone' ? 'Duplicate listing' : 'Edit listing'}</h2><button type="button" onClick={() => setEditor(null)} aria-label="Close"><X className="h-5 w-5 text-slate-400" /></button></div>
            <Input value={editorTitle} onChange={(event) => setEditorTitle(event.target.value)} placeholder="Title" required />
            <select value={editorCategory} onChange={(event) => setEditorCategory(event.target.value)} className="h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white" required><option value="">Select category</option>{categoryOptions.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}</select>
            <Input type="number" min="0.01" step="0.01" value={editorPrice} onChange={(event) => setEditorPrice(event.target.value)} placeholder="Price" required />
            <textarea value={editorDescription} onChange={(event) => setEditorDescription(event.target.value)} rows={4} className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white" placeholder="Description" required />
            <div className="grid grid-cols-3 gap-2">{(editor.product?.images || []).map((image) => <img key={image.id} src={image.url} alt="" className="h-20 w-full rounded-lg object-cover" />)}</div>
            {editor.mode === 'clone' && <label className="block space-y-2"><span className="text-sm font-medium">Required digital code</span><Input value={editorCode} onChange={(event) => setEditorCode(event.target.value)} placeholder="Enter the new digital code" required aria-required="true" /></label>}
            <Button type="submit" disabled={editorSaving || (editor.mode === 'clone' && !editorCode.trim())} className="w-full bg-indigo-600 hover:bg-indigo-500">{editorSaving ? 'Saving...' : editor.mode === 'clone' ? 'Create duplicate' : 'Save changes'}</Button>
          </form>
        </div>}
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>Showing {visibleProducts.length} of {products.length} listings</span><span className="flex items-center gap-1">Rows per page <ChevronDown className="h-3 w-3" /></span></div>
      </div>
    </main>
  );
}
