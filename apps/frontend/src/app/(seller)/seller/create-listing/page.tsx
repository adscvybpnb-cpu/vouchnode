'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, ImagePlus, Loader2, UploadCloud, X } from 'lucide-react';
import { productService } from '@/services/product.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/auth.store';
import { getSellerOnboardingPath, isApprovedSeller } from '@/lib/seller-access';
import { getSellerCatalogTemplate } from '@/lib/seller-catalog';

const productCategories = [
  ['gift-cards', 'Gift Cards'],
  ['gaming', 'Gaming'],
  ['steam-keys', 'Steam Keys'],
  ['pubg-mobile', 'PUBG Mobile UC'],
  ['free-fire', 'Free Fire Diamonds'],
  ['roblox', 'Roblox Robux'],
  ['fortnite', 'Fortnite V-Bucks'],
  ['rocket-league', 'Rocket League'],
  ['streaming', 'Streaming'],
  ['software', 'Software'],
] as const;

const regions = [
  'Global / Worldwide', 'Afghanistan', 'Åland Islands', 'Albania', 'Algeria', 'American Samoa',
  'Andorra', 'Angola', 'Anguilla', 'Antarctica', 'Antigua and Barbuda', 'Argentina', 'Armenia',
  'Aruba', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh',
  'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bermuda', 'Bhutan', 'Bolivia',
  'Bonaire, Sint Eustatius and Saba', 'Bosnia and Herzegovina', 'Botswana', 'Bouvet Island',
  'Brazil', 'British Indian Ocean Territory', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi',
  'Cabo Verde', 'Cambodia', 'Cameroon', 'Canada', 'Cayman Islands', 'Central African Republic',
  'Chad', 'Chile', 'China', 'Christmas Island', 'Cocos (Keeling) Islands', 'Colombia',
  'Comoros', 'Congo', 'Cook Islands', 'Costa Rica', 'Côte d’Ivoire', 'Croatia', 'Cuba',
  'Curaçao', 'Cyprus', 'Czechia', 'Democratic Republic of the Congo', 'Denmark', 'Djibouti',
  'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea',
  'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Falkland Islands', 'Faroe Islands', 'Fiji',
  'Finland', 'France', 'French Guiana', 'French Polynesia', 'French Southern Territories',
  'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Gibraltar', 'Greece', 'Greenland',
  'Grenada', 'Guadeloupe', 'Guam', 'Guatemala', 'Guernsey', 'Guinea', 'Guinea-Bissau',
  'Guyana', 'Haiti', 'Heard Island and McDonald Islands', 'Honduras', 'Hong Kong', 'Hungary',
  'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Isle of Man', 'Israel', 'Italy',
  'Jamaica', 'Japan', 'Jersey', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait',
  'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein',
  'Lithuania', 'Luxembourg', 'Macao', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali',
  'Malta', 'Marshall Islands', 'Martinique', 'Mauritania', 'Mauritius', 'Mayotte', 'Mexico',
  'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Montserrat', 'Morocco',
  'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Caledonia',
  'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'Niue', 'Norfolk Island', 'North Korea',
  'North Macedonia', 'Northern Mariana Islands', 'Norway', 'Oman', 'Pakistan', 'Palau',
  'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Pitcairn',
  'Poland', 'Portugal', 'Puerto Rico', 'Qatar', 'Réunion', 'Romania', 'Russia', 'Rwanda',
  'Saint Barthélemy', 'Saint Helena', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Martin',
  'Saint Pierre and Miquelon', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino',
  'São Tomé and Príncipe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone',
  'Singapore', 'Sint Maarten', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia',
  'South Africa', 'South Georgia and the South Sandwich Islands', 'South Korea', 'South Sudan',
  'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Svalbard and Jan Mayen', 'Sweden', 'Switzerland',
  'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tokelau',
  'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Türkiye', 'Turkmenistan', 'Turks and Caicos Islands',
  'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States',
  'United States Minor Outlying Islands', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican City',
  'Venezuela', 'Vietnam', 'Virgin Islands (British)', 'Virgin Islands (U.S.)', 'Wallis and Futuna',
  'Western Sahara', 'Yemen', 'Zambia', 'Zimbabwe',
] as const;

const ADMIN_FEE = 0;

export default function CreateListingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, accessToken } = useAuthStore();
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [region, setRegion] = useState('');
  const [faceValue, setFaceValue] = useState('');
  const [price, setPrice] = useState('');
  const [giftCardCode, setGiftCardCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [category, setCategory] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [globalRegion, setGlobalRegion] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [formError, setFormError] = useState('');
  const [templateSelected, setTemplateSelected] = useState(false);
  const [customTemplate, setCustomTemplate] = useState(false);
  const faceValueAmount = Number(faceValue) || 0;
  const retailPriceAmount = Number(price) || 0;
  const earningsAmount = retailPriceAmount * (1 - ADMIN_FEE);
  const discountPercentage = faceValueAmount > 0 && retailPriceAmount < faceValueAmount
    ? Math.round(((faceValueAmount - retailPriceAmount) / faceValueAmount) * 100)
    : 0;

  useEffect(() => {
    if (user && !isApprovedSeller(user)) {
      router.replace(getSellerOnboardingPath('/seller/create-listing'));
    }
  }, [router, user]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const template = getSellerCatalogTemplate(params.get('template'));
    const selectedPrice = params.get('price')?.match(/^\d+(?:\.\d+)?$/)?.[0];
    const loadCategories = async () => {
      const categories = await productService.getCategories();
      if (!active) return;
      setCategoryOptions(categories);
      const categoryBySlug = new Map(categories.map((item) => [item.slug, item]));
      const selectedCategory = template ? categoryBySlug.get(template.category) : undefined;

      if (selectedCategory) {
        setCategory(selectedCategory.slug);
        setCategoryId(selectedCategory.id);
      }
    };

    void loadCategories();
    if (!selectedPrice) return () => { active = false; };
    if (params.get('template') === 'custom') {
      setFaceValue(selectedPrice);
      setCustomTemplate(true);
      setGlobalRegion(true);
      return () => { active = false; };
    }
    if (!template) return () => { active = false; };
    setTitle(`${template.name} ${selectedPrice}$`);
    setFaceValue(selectedPrice);
    setTemplateSelected(true);
    setGlobalRegion(true);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const fileUrls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(fileUrls);
    return () => fileUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!accessToken || !user?.id) {
      toast({ title: 'Sign in required', description: 'Your seller session is unavailable. Please sign in again.', variant: 'destructive' });
      router.push('/login?redirect=/seller/create-listing');
      return;
    }
    if (!isApprovedSeller(user)) {
      router.replace(getSellerOnboardingPath('/seller/create-listing'));
      return;
    }
    const selectedRegion = globalRegion ? 'Global' : region;
    if (!giftCardCode.trim()) {
      setFormError('You must add a digital code to list this product.');
      return;
    }
    if (!files.length || !title.trim() || !description.trim() || !selectedRegion.trim() || !Number.isFinite(Number(faceValue)) || Number(faceValue) <= 0 || !Number.isFinite(Number(price)) || Number(price) <= 0 || !category || !categoryId) {
      setFormError('Complete all required fields before publishing this listing.');
      return;
    }
    setSubmitting(true);
    try {
      const uploadedImages = await Promise.all(files.map((file) => productService.uploadProductImage(file)));
      await productService.createProduct({
        name: title.trim(), description: description.trim(), region: selectedRegion.trim(),
        category, categoryId, brand: title.trim(), originalPrice: Number(faceValue),
        currentPrice: Number(price), deliveryType: 'INSTANT', images: uploadedImages.map((image) => image.url),
        inventoryDetails: [giftCardCode.trim()], tags: [],
      });
      toast({ title: 'Listing published', description: 'Your product is now visible on the marketplace.' });
      router.push('/');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to publish this listing.');
      toast({ title: 'Could not publish listing', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0A0A0F] px-4 py-12 text-white">
      <form onSubmit={submit} className="mx-auto max-w-3xl space-y-8 rounded-3xl border border-white/10 bg-[#141420] p-6 shadow-2xl sm:p-10">
        <button type="button" onClick={() => router.back()} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back</button>
        <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-300">Seller Studio</p><h1 className="mt-2 text-3xl font-bold">Create a listing</h1><p className="mt-2 text-slate-400">Publish your product to the VouchNode marketplace.</p></div>
        <div className="rounded-2xl border-2 border-dashed border-white/10 p-5 text-center transition-colors hover:border-indigo-400">
          <label className="block cursor-pointer">
            <UploadCloud className="mx-auto h-10 w-10 text-indigo-300" />
            <p className="mt-3 font-semibold">Product images</p>
            <p className="mt-1 text-sm text-slate-400">Select multiple JPG, PNG, or WebP images</p>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const selectedFiles = Array.from(event.target.files || []);
                if (selectedFiles.length > 0) setFiles((currentFiles) => [...currentFiles, ...selectedFiles]);
                event.currentTarget.value = '';
              }}
            />
          </label>
          {previewUrls.length > 0 && (
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {previewUrls.map((url, index) => (
                <div key={`${url}-${index}`} className="group relative h-36 w-36 overflow-hidden rounded-xl border border-white/10 bg-black/30 p-2">
                  <img src={url} alt={`Product preview ${index + 1}`} className="h-full w-full rounded-lg object-contain" />
                  <button
                    type="button"
                    aria-label={`Remove image ${index + 1}`}
                    onClick={() => setFiles((currentFiles) => currentFiles.filter((_, fileIndex) => fileIndex !== index))}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/75 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100 focus:opacity-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {files.length > 0 && <p className="mt-4 text-sm text-emerald-300">{files.length} image{files.length === 1 ? '' : 's'} selected</p>}
        </div>
        <label className="block space-y-2"><span className="text-sm font-medium">Product title</span><Input value={title} readOnly={templateSelected && !customTemplate} onChange={(e) => setTitle(e.target.value)} placeholder={customTemplate ? 'Enter your custom product name' : 'e.g. $100 Steam Gift Card'} /></label>
        <label className="block space-y-2"><span className="text-sm font-medium">Product Category</span>
          <select required value={category} disabled={templateSelected} onChange={(event) => {
            const selectedSlug = event.target.value;
            setCategory(selectedSlug);
            setCategoryId(categoryOptions.find((item) => item.slug === selectedSlug)?.id || '');
          }} className="h-10 w-full rounded-md border border-white/10 bg-[#0d111a] px-3 text-sm text-white outline-none focus:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-70">
            <option value="">Select a product category</option>
            {categoryOptions.length > 0
              ? categoryOptions.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)
              : productCategories.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
          </select>
        </label>
        <label className="block space-y-2"><span className="text-sm font-medium">Description</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm outline-none focus:border-indigo-400" placeholder="Describe what buyers receive..." /></label>
        <div className="space-y-3">
          <label className="block space-y-2"><span className="text-sm font-medium">Country / Region</span>
            <select value={globalRegion ? 'Global / Worldwide' : region} disabled={globalRegion} onChange={(event) => setRegion(event.target.value)} className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none focus:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-60 [&>option]:bg-slate-900 [&>option]:text-white">
              <option value="">Select a country or region</option>
              {regions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={globalRegion} onChange={(event) => { setGlobalRegion(event.target.checked); if (event.target.checked) setRegion('Global'); else setRegion(''); }} className="h-4 w-4 accent-indigo-500" />
            Global / Worldwide (Global)
          </label>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          <label className="space-y-2"><span className="text-sm font-medium">Face value (USD)</span><Input value={faceValue} readOnly className="border-indigo-400/30 bg-indigo-500/10 text-indigo-100" /></label>
          <label className="space-y-2"><span className="text-sm font-medium">Listing price (USDT)</span><Input type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Set retail price" /></label>
          <label className="space-y-2"><span className="text-sm font-medium">You Receive (0% fee)</span><Input value={retailPriceAmount ? earningsAmount.toFixed(2) : ''} readOnly disabled className="border-emerald-400/40 bg-emerald-500/10 font-semibold text-emerald-200 disabled:opacity-100" /></label>
        </div>
        {discountPercentage > 0 && <p className="text-sm font-semibold text-emerald-300">{discountPercentage}% discount from face value</p>}
        {formError && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{formError}</p>}
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium">Gift Card Code / Digital Code</span>
            <Input required value={giftCardCode} onChange={(event) => setGiftCardCode(event.target.value)} placeholder="Enter the code buyers will receive" />
          </label>
          <label className="flex cursor-not-allowed items-center gap-3 text-sm text-slate-300">
            <span className="flex h-5 w-5 items-center justify-center rounded border border-emerald-400 bg-emerald-500 text-white">
              <Check className="h-4 w-4" strokeWidth={3} />
            </span>
            <input type="checkbox" checked disabled className="sr-only" aria-label="Instant Auto-delivery enabled" />
            <span><span className="font-semibold text-emerald-300">Instant Auto-delivery</span><span className="ml-2 text-slate-500">Required for all listings</span></span>
          </label>
        </div>
        <Button type="submit" disabled={submitting} className="w-full border-2 border-indigo-300/70 bg-indigo-600 font-semibold text-white opacity-100 shadow-lg shadow-indigo-900/30 hover:border-indigo-100 hover:bg-indigo-500 disabled:border-indigo-300/30 disabled:bg-indigo-700/60">{submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Publishing...</> : <><ImagePlus className="mr-2 h-4 w-4" /> Next / Submit</>}</Button>
      </form>
    </main>
  );
}
