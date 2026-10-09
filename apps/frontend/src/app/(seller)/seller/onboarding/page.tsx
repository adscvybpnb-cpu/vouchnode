'use client';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { sellerService } from '@/services/seller.service';
import { useAuthStore } from '@/store/auth.store';

// ─── Types ───────────────────────────────────────────────────────────────────
const STEPS = ['Shop Details', 'Identity Verification (KYC)', 'Review & Submit'] as const;

const shopSchema = z.object({
  shopName: z.string().min(3, 'Shop name must be at least 3 characters').max(60),
  description: z.string().min(30, 'Please write at least 30 characters describing your shop'),
  country: z.string().min(1, 'Country is required'),
  language: z.string().min(1, 'Language is required'),
  agreeSellerTerms: z.boolean().refine(v => v === true, 'You must agree to the Seller Terms'),
});

type ShopFormValues = z.infer<typeof shopSchema>;
type ShopNameCheck = { name: string; status: 'idle' | 'checking' | 'available' | 'taken' | 'error' };

interface KycFiles {
  idFront: File | null;
  idBack: File | null;
  selfie: File | null;
}

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return url;
}

const COUNTRIES = [
  { label: 'Afghanistan', value: 'AF' }, { label: 'Albania', value: 'AL' }, { label: 'Algeria', value: 'DZ' },
  { label: 'Andorra', value: 'AD' }, { label: 'Angola', value: 'AO' }, { label: 'Antigua and Barbuda', value: 'AG' },
  { label: 'Argentina', value: 'AR' }, { label: 'Armenia', value: 'AM' }, { label: 'Australia', value: 'AU' },
  { label: 'Austria', value: 'AT' }, { label: 'Azerbaijan', value: 'AZ' }, { label: 'Bahamas', value: 'BS' },
  { label: 'Bahrain', value: 'BH' }, { label: 'Bangladesh', value: 'BD' }, { label: 'Barbados', value: 'BB' },
  { label: 'Belarus', value: 'BY' }, { label: 'Belgium', value: 'BE' }, { label: 'Belize', value: 'BZ' },
  { label: 'Benin', value: 'BJ' }, { label: 'Bhutan', value: 'BT' }, { label: 'Bolivia', value: 'BO' },
  { label: 'Bosnia and Herzegovina', value: 'BA' }, { label: 'Botswana', value: 'BW' }, { label: 'Brazil', value: 'BR' },
  { label: 'Brunei', value: 'BN' }, { label: 'Bulgaria', value: 'BG' }, { label: 'Burkina Faso', value: 'BF' },
  { label: 'Burundi', value: 'BI' }, { label: 'Cabo Verde', value: 'CV' }, { label: 'Cambodia', value: 'KH' },
  { label: 'Cameroon', value: 'CM' }, { label: 'Canada', value: 'CA' }, { label: 'Central African Republic', value: 'CF' },
  { label: 'Chad', value: 'TD' }, { label: 'Chile', value: 'CL' }, { label: 'China', value: 'CN' },
  { label: 'Colombia', value: 'CO' }, { label: 'Comoros', value: 'KM' }, { label: 'Congo', value: 'CG' },
  { label: 'Costa Rica', value: 'CR' }, { label: 'Croatia', value: 'HR' }, { label: 'Cuba', value: 'CU' },
  { label: 'Cyprus', value: 'CY' }, { label: 'Czechia', value: 'CZ' }, { label: 'Democratic Republic of the Congo', value: 'CD' },
  { label: 'Denmark', value: 'DK' }, { label: 'Djibouti', value: 'DJ' }, { label: 'Dominica', value: 'DM' },
  { label: 'Dominican Republic', value: 'DO' }, { label: 'Ecuador', value: 'EC' }, { label: 'Egypt', value: 'EG' },
  { label: 'El Salvador', value: 'SV' }, { label: 'Equatorial Guinea', value: 'GQ' }, { label: 'Eritrea', value: 'ER' },
  { label: 'Estonia', value: 'EE' }, { label: 'Eswatini', value: 'SZ' }, { label: 'Ethiopia', value: 'ET' },
  { label: 'Fiji', value: 'FJ' }, { label: 'Finland', value: 'FI' }, { label: 'France', value: 'FR' },
  { label: 'Gabon', value: 'GA' }, { label: 'Gambia', value: 'GM' }, { label: 'Georgia', value: 'GE' },
  { label: 'Germany', value: 'DE' }, { label: 'Ghana', value: 'GH' }, { label: 'Greece', value: 'GR' },
  { label: 'Grenada', value: 'GD' }, { label: 'Guatemala', value: 'GT' }, { label: 'Guinea', value: 'GN' },
  { label: 'Guinea-Bissau', value: 'GW' }, { label: 'Guyana', value: 'GY' }, { label: 'Haiti', value: 'HT' },
  { label: 'Honduras', value: 'HN' }, { label: 'Hungary', value: 'HU' }, { label: 'Iceland', value: 'IS' },
  { label: 'India', value: 'IN' }, { label: 'Indonesia', value: 'ID' }, { label: 'Iran', value: 'IR' },
  { label: 'Iraq', value: 'IQ' }, { label: 'Ireland', value: 'IE' }, { label: 'Israel', value: 'IL' },
  { label: 'Italy', value: 'IT' }, { label: 'Ivory Coast', value: 'CI' }, { label: 'Jamaica', value: 'JM' },
  { label: 'Japan', value: 'JP' }, { label: 'Jordan', value: 'JO' }, { label: 'Kazakhstan', value: 'KZ' },
  { label: 'Kenya', value: 'KE' }, { label: 'Kiribati', value: 'KI' }, { label: 'Kuwait', value: 'KW' },
  { label: 'Kyrgyzstan', value: 'KG' }, { label: 'Laos', value: 'LA' }, { label: 'Latvia', value: 'LV' },
  { label: 'Lebanon', value: 'LB' }, { label: 'Lesotho', value: 'LS' }, { label: 'Liberia', value: 'LR' },
  { label: 'Libya', value: 'LY' }, { label: 'Liechtenstein', value: 'LI' }, { label: 'Lithuania', value: 'LT' },
  { label: 'Luxembourg', value: 'LU' }, { label: 'Madagascar', value: 'MG' }, { label: 'Malawi', value: 'MW' },
  { label: 'Malaysia', value: 'MY' }, { label: 'Maldives', value: 'MV' }, { label: 'Mali', value: 'ML' },
  { label: 'Malta', value: 'MT' }, { label: 'Marshall Islands', value: 'MH' }, { label: 'Mauritania', value: 'MR' },
  { label: 'Mauritius', value: 'MU' }, { label: 'Mexico', value: 'MX' }, { label: 'Micronesia', value: 'FM' },
  { label: 'Moldova', value: 'MD' }, { label: 'Monaco', value: 'MC' }, { label: 'Mongolia', value: 'MN' },
  { label: 'Montenegro', value: 'ME' }, { label: 'Morocco', value: 'MA' }, { label: 'Mozambique', value: 'MZ' },
  { label: 'Myanmar', value: 'MM' }, { label: 'Namibia', value: 'NA' }, { label: 'Nauru', value: 'NR' },
  { label: 'Nepal', value: 'NP' }, { label: 'Netherlands', value: 'NL' }, { label: 'New Zealand', value: 'NZ' },
  { label: 'Nicaragua', value: 'NI' }, { label: 'Niger', value: 'NE' }, { label: 'Nigeria', value: 'NG' },
  { label: 'North Korea', value: 'KP' }, { label: 'North Macedonia', value: 'MK' }, { label: 'Norway', value: 'NO' },
  { label: 'Oman', value: 'OM' }, { label: 'Pakistan', value: 'PK' }, { label: 'Palau', value: 'PW' },
  { label: 'Palestine', value: 'PS' }, { label: 'Panama', value: 'PA' }, { label: 'Papua New Guinea', value: 'PG' },
  { label: 'Paraguay', value: 'PY' }, { label: 'Peru', value: 'PE' }, { label: 'Philippines', value: 'PH' },
  { label: 'Poland', value: 'PL' }, { label: 'Portugal', value: 'PT' }, { label: 'Qatar', value: 'QA' },
  { label: 'Romania', value: 'RO' }, { label: 'Russia', value: 'RU' }, { label: 'Rwanda', value: 'RW' },
  { label: 'Saint Kitts and Nevis', value: 'KN' }, { label: 'Saint Lucia', value: 'LC' }, { label: 'Saint Vincent and the Grenadines', value: 'VC' },
  { label: 'Samoa', value: 'WS' }, { label: 'San Marino', value: 'SM' }, { label: 'Sao Tome and Principe', value: 'ST' },
  { label: 'Saudi Arabia', value: 'SA' }, { label: 'Senegal', value: 'SN' }, { label: 'Serbia', value: 'RS' },
  { label: 'Seychelles', value: 'SC' }, { label: 'Sierra Leone', value: 'SL' }, { label: 'Singapore', value: 'SG' },
  { label: 'Slovakia', value: 'SK' }, { label: 'Slovenia', value: 'SI' }, { label: 'Solomon Islands', value: 'SB' },
  { label: 'Somalia', value: 'SO' }, { label: 'South Africa', value: 'ZA' }, { label: 'South Korea', value: 'KR' },
  { label: 'South Sudan', value: 'SS' }, { label: 'Spain', value: 'ES' }, { label: 'Sri Lanka', value: 'LK' },
  { label: 'Sudan', value: 'SD' }, { label: 'Suriname', value: 'SR' }, { label: 'Sweden', value: 'SE' },
  { label: 'Switzerland', value: 'CH' }, { label: 'Syria', value: 'SY' }, { label: 'Taiwan', value: 'TW' },
  { label: 'Tajikistan', value: 'TJ' }, { label: 'Tanzania', value: 'TZ' }, { label: 'Thailand', value: 'TH' },
  { label: 'Timor-Leste', value: 'TL' }, { label: 'Togo', value: 'TG' }, { label: 'Tonga', value: 'TO' },
  { label: 'Trinidad and Tobago', value: 'TT' }, { label: 'Tunisia', value: 'TN' }, { label: 'Turkey', value: 'TR' },
  { label: 'Turkmenistan', value: 'TM' }, { label: 'Tuvalu', value: 'TV' }, { label: 'Uganda', value: 'UG' },
  { label: 'Ukraine', value: 'UA' }, { label: 'United Arab Emirates', value: 'AE' }, { label: 'United Kingdom', value: 'GB' },
  { label: 'United States', value: 'US' }, { label: 'Uruguay', value: 'UY' }, { label: 'Uzbekistan', value: 'UZ' },
  { label: 'Vanuatu', value: 'VU' }, { label: 'Vatican City', value: 'VA' }, { label: 'Venezuela', value: 'VE' },
  { label: 'Vietnam', value: 'VN' }, { label: 'Yemen', value: 'YE' }, { label: 'Zambia', value: 'ZM' },
  { label: 'Zimbabwe', value: 'ZW' },
  { label: 'Åland Islands', value: 'AX' }, { label: 'American Samoa', value: 'AS' }, { label: 'Anguilla', value: 'AI' },
  { label: 'Antarctica', value: 'AQ' }, { label: 'Aruba', value: 'AW' }, { label: 'Bermuda', value: 'BM' },
  { label: 'Bonaire, Sint Eustatius and Saba', value: 'BQ' }, { label: 'Bouvet Island', value: 'BV' }, { label: 'British Indian Ocean Territory', value: 'IO' },
  { label: 'British Virgin Islands', value: 'VG' }, { label: 'Cayman Islands', value: 'KY' }, { label: 'Christmas Island', value: 'CX' },
  { label: 'Cocos (Keeling) Islands', value: 'CC' }, { label: 'Cook Islands', value: 'CK' }, { label: 'Curaçao', value: 'CW' },
  { label: 'Falkland Islands', value: 'FK' }, { label: 'Faroe Islands', value: 'FO' }, { label: 'French Guiana', value: 'GF' },
  { label: 'French Polynesia', value: 'PF' }, { label: 'French Southern Territories', value: 'TF' }, { label: 'Gibraltar', value: 'GI' },
  { label: 'Greenland', value: 'GL' }, { label: 'Guadeloupe', value: 'GP' }, { label: 'Guam', value: 'GU' },
  { label: 'Guernsey', value: 'GG' }, { label: 'Hong Kong', value: 'HK' }, { label: 'Isle of Man', value: 'IM' },
  { label: 'Jersey', value: 'JE' }, { label: 'Kosovo', value: 'XK' }, { label: 'Macao', value: 'MO' },
  { label: 'Martinique', value: 'MQ' }, { label: 'Mayotte', value: 'YT' }, { label: 'Montserrat', value: 'MS' },
  { label: 'New Caledonia', value: 'NC' }, { label: 'Niue', value: 'NU' }, { label: 'Norfolk Island', value: 'NF' },
  { label: 'Northern Mariana Islands', value: 'MP' }, { label: 'Pitcairn', value: 'PN' }, { label: 'Puerto Rico', value: 'PR' },
  { label: 'Réunion', value: 'RE' }, { label: 'Saint Barthélemy', value: 'BL' }, { label: 'Saint Helena', value: 'SH' },
  { label: 'Saint Martin', value: 'MF' }, { label: 'Saint Pierre and Miquelon', value: 'PM' }, { label: 'Sint Maarten', value: 'SX' },
  { label: 'South Georgia and the South Sandwich Islands', value: 'GS' }, { label: 'Svalbard and Jan Mayen', value: 'SJ' }, { label: 'Tokelau', value: 'TK' },
  { label: 'Turks and Caicos Islands', value: 'TC' }, { label: 'United States Minor Outlying Islands', value: 'UM' }, { label: 'US Virgin Islands', value: 'VI' },
  { label: 'Wallis and Futuna', value: 'WF' }, { label: 'Western Sahara', value: 'EH' },
].sort((a, b) => a.label.localeCompare(b.label));

const LANGUAGES = [
  'English', 'Arabic', 'Spanish', 'French', 'German', 'Portuguese',
  'Turkish', 'Hindi', 'Urdu', 'Indonesian', 'Chinese', 'Japanese',
];

// ─── File upload preview component ───────────────────────────────────────────
function FileUploadBox({
  label, hint, required, file, onFile, accept = 'image/*',
}: {
  label: string; hint: string; required?: boolean;
  file: File | null; onFile: (f: File) => void; accept?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const preview = useObjectUrl(file);

  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const droppedFile = event.dataTransfer.files?.[0];
        if (droppedFile && droppedFile.type.startsWith('image/')) onFile(droppedFile);
      }}
      className="cursor-pointer border-2 border-dashed border-[#1E1E2E] hover:border-indigo-500 rounded-xl p-4 transition-colors group"
    >
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const selectedFile = event.currentTarget.files?.[0];
          if (selectedFile instanceof File) {
            onFile(selectedFile);
          }
          event.currentTarget.value = '';
        }}
      />
      {preview ? (
        <div className="relative">
          <img src={preview} alt={label} className="w-full h-40 object-cover rounded-lg" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center transition-opacity">
            <span className="text-white text-sm font-medium">Click to change</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <div className="w-12 h-12 rounded-full bg-[#1E1E2E] flex items-center justify-center mb-3 group-hover:bg-indigo-600/20 transition-colors">
            <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm text-white font-medium">{label}{required && <span className="text-red-500 ml-1">*</span>}</p>
          <p className="text-xs text-slate-500 mt-1">{hint}</p>
        </div>
      )}
      <p className="text-xs text-center mt-2 font-medium text-slate-400">
        {file ? `✓ ${file.name}` : label}
      </p>
    </div>
  );
}

function FilePreview({ file, label }: { file: File; label: string }) {
  const preview = useObjectUrl(file);

  return preview
    ? <img src={preview} alt={label} className="w-full h-24 object-cover rounded-lg border border-green-800/40" />
    : <div className="w-full h-24 bg-[#1E1E2E] rounded-lg" aria-label={`Loading ${label} preview`} />;
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center mb-10">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
              i < current ? 'bg-indigo-600 border-indigo-600 text-white'
              : i === current ? 'border-indigo-600 text-indigo-400 bg-transparent'
              : 'border-[#1E1E2E] text-slate-600 bg-transparent'
            }`}>
              {i < current ? '✓' : i + 1}
            </div>
            <span className={`text-xs mt-1 hidden sm:block max-w-[90px] text-center leading-tight ${
              i === current ? 'text-white' : 'text-slate-500'
            }`}>{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-0.5 w-12 sm:w-20 mx-2 mb-5 transition-all ${i < current ? 'bg-indigo-600' : 'bg-[#1E1E2E]'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SellerOnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSellerStatus, setIsCheckingSellerStatus] = useState(true);
  const [fastLaunchEnabled, setFastLaunchEnabled] = useState(false);
  const [kycSkipped, setKycSkipped] = useState(false);
  const { accessToken, clearAuth, user, updateUser } = useAuthStore();
  const [sellerStatus, setSellerStatus] = useState<'approved' | 'pending' | 'rejected' | 'none'>(
    user?.sellerStatus === 'approved' ? 'approved' : user?.sellerStatus === 'pending' ? 'pending' : user?.sellerStatus === 'rejected' ? 'rejected' : 'none',
  );

  const [kyc, setKyc] = useState<KycFiles>({ idFront: null, idBack: null, selfie: null });
  const [kycErrors, setKycErrors] = useState<string[]>([]);
  const [shopNameCheck, setShopNameCheck] = useState<ShopNameCheck>({ name: '', status: 'idle' });
  const shopNameCheckSequence = useRef(0);

  const { register, handleSubmit, watch, formState: { errors }, getValues, reset } = useForm<ShopFormValues>({
    resolver: zodResolver(shopSchema),
    defaultValues: { agreeSellerTerms: false, language: 'English' },
  });
  const shopName = watch('shopName');
  const checkShopNameAvailability = useCallback(async (name: string) => {
    const normalizedName = name.trim().replace(/\s+/g, ' ').toLowerCase();
    const sequence = ++shopNameCheckSequence.current;
    setShopNameCheck({ name: normalizedName, status: 'checking' });
    try {
      const available = await sellerService.checkShopNameAvailability(name.trim());
      if (sequence === shopNameCheckSequence.current) {
        setShopNameCheck({ name: normalizedName, status: available ? 'available' : 'taken' });
      }
      return available;
    } catch (error) {
      console.error('Unable to check shop name availability:', error);
      if (sequence === shopNameCheckSequence.current) {
        setShopNameCheck({ name: normalizedName, status: 'error' });
      }
      return false;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    sellerService.getMySellerStatus()
      .then(({ status, kycSkipped: hasSkippedKyc }) => {
        if (!isMounted) return;
        if (status === 'approved') {
          router.replace('/seller/choose-asset');
          return;
        }
        setSellerStatus(status);
        setKycSkipped(hasSkippedKyc);
        updateUser({ sellerStatus: status });
        setIsCheckingSellerStatus(false);
      })
      .catch((error) => {
        if (isMounted) {
          if (user?.sellerStatus === 'approved') {
            router.replace('/seller/choose-asset');
            return;
          }
          setIsCheckingSellerStatus(false);
        }
        console.error('Unable to check seller application status:', error);
      });

    return () => {
      isMounted = false;
    };
  }, [router, updateUser, user?.sellerStatus]);

  useEffect(() => {
    if (step !== 1) return;
    let isMounted = true;
    let isRefreshing = false;
    setFastLaunchEnabled(false);
    const refreshPolicy = () => {
      if (isRefreshing || document.visibilityState === 'hidden') return;
      isRefreshing = true;
      sellerService.getOnboardingPolicy()
        .then(({ fastLaunchEnabled: enabled }) => {
          if (isMounted) setFastLaunchEnabled(enabled);
        })
        .catch((error) => {
          if (isMounted) setFastLaunchEnabled(false);
          console.error('Unable to load seller onboarding policy:', error);
        })
        .finally(() => {
          isRefreshing = false;
        });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshPolicy();
    };
    refreshPolicy();
    const refreshInterval = setInterval(refreshPolicy, 3000);
    window.addEventListener('focus', refreshPolicy);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
      window.removeEventListener('focus', refreshPolicy);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [step]);

  useEffect(() => {
    const normalizedName = shopName?.trim().replace(/\s+/g, ' ').toLowerCase() ?? '';
    if (normalizedName.length < 3 || normalizedName.length > 60) {
      shopNameCheckSequence.current += 1;
      setShopNameCheck({ name: normalizedName, status: 'idle' });
      return;
    }

    setShopNameCheck({ name: normalizedName, status: 'checking' });
    const timer = setTimeout(() => {
      void checkShopNameAvailability(shopName);
    }, 400);
    return () => {
      clearTimeout(timer);
      shopNameCheckSequence.current += 1;
    };
  }, [shopName, checkShopNameAvailability]);

  // ── Step 1: shop details ──────────────────────────────────────────────────
  const handleShopNext = handleSubmit(async (values) => {
    if (await checkShopNameAvailability(values.shopName)) setStep(1);
  });

  // ── Step 2: KYC validation ────────────────────────────────────────────────
  const handleKycNext = () => {
    const errs: string[] = [];
    if (!kyc.idFront)  errs.push('Front of ID is required');
    if (!kyc.idBack)   errs.push('Back of ID is required');
    if (!kyc.selfie)   errs.push('Selfie holding your ID is required');
    setKycErrors(errs);
    if (errs.length === 0) {
      setKycSkipped(false);
      setStep(2);
    }
  };

  const handleSkipKyc = () => {
    setKycErrors([]);
    setKycSkipped(true);
    setStep(2);
  };

  // ── Step 3: Final submit ──────────────────────────────────────────────────
  const handleFinalSubmit = async () => {
    if (!accessToken) {
      toast({
        variant: 'destructive',
        title: 'Sign in required',
        description: 'Your session has expired. Please sign in again to submit your application.',
      });
      router.push('/login?redirect=/seller/onboarding');
      return;
    }

    setIsSubmitting(true);
    try {
      const values = getValues();
      const formData = new FormData();
      formData.append('shopName', values.shopName);
      formData.append('description', values.description);
      formData.append('country', values.country);
      formData.append('language', values.language);
      formData.append('agreeSellerTerms', 'true');
      formData.append('skipKyc', String(kycSkipped));
      if (!kycSkipped) {
        if (kyc.idFront instanceof File) formData.append('frontDocument', kyc.idFront);
        if (kyc.idBack instanceof File) formData.append('backDocument', kyc.idBack);
        if (kyc.selfie instanceof File) formData.append('selfie', kyc.selfie);
      }
      const result = await sellerService.applyToSell(formData);
      const isApproved = result.status === 'AUTOMATED_VERIFIED' || result.status === 'ACTIVE';
      const nextSellerStatus = isApproved ? 'approved' : 'pending';
      updateUser({ sellerStatus: nextSellerStatus, ...(isApproved ? { role: 'SELLER' as const } : {}) });
      setSellerStatus(nextSellerStatus);
      setKycSkipped(Boolean(result.kycSkipped));
      setKyc({ idFront: null, idBack: null, selfie: null });
      setKycErrors([]);
      reset({ agreeSellerTerms: false });

      toast({
        title: isApproved ? (result.kycSkipped ? 'Seller account approved' : 'Identity verification approved') : 'Application submitted',
        description: isApproved
          ? result.kycSkipped
            ? 'You can now start selling. Your identity is not verified.'
            : 'You can now add products to your seller catalog.'
          : result.kycSkipped
            ? 'Your application was submitted without identity documents and remains pending seller approval.'
            : 'Your application is being processed.',
      });
      if (isApproved) {
        router.push('/seller/products/new');
      } else {
        router.replace('/seller/onboarding');
      }
    } catch (err: unknown) {
      const status = typeof err === 'object' && err !== null && 'status' in err
        ? (err as { status?: number }).status
        : undefined;

      if (status === 401) {
        clearAuth();
        toast({
          variant: 'destructive',
          title: 'Session expired',
          description: 'Please sign in again before submitting your seller application.',
        });
        router.push('/login?redirect=/seller/onboarding');
        return;
      }

      toast({
        variant: 'destructive',
        title: 'Submission failed',
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const values = watch();

  if (isCheckingSellerStatus) {
    return <div className="min-h-screen bg-[#0A0A0F]" aria-busy="true" />;
  }

  if (sellerStatus === 'approved' || sellerStatus === 'pending') {
    const isApproved = sellerStatus === 'approved';
    return (
      <div className="min-h-screen bg-[#0A0A0F] py-12 px-4">
        <div className="max-w-2xl mx-auto rounded-2xl border border-[#1E1E2E] bg-[#141420] p-8 text-center">
          <h1 className="text-2xl font-bold text-white">
            {isApproved
              ? 'Your seller account is approved'
              : kycSkipped ? 'Your seller application is pending approval' : 'Your account is currently under verification'}
          </h1>
          <p className="mt-3 text-slate-400">
            {isApproved
              ? 'You can now manage your seller profile and start listing products.'
              : kycSkipped
                ? 'Your fast-launch application was submitted without identity documents and is pending seller approval.'
                : 'Your seller application is being reviewed. You will be able to submit again if your documents are rejected.'}
          </p>
          {isApproved && (
            <Button onClick={() => router.push('/seller/products/new')} className="mt-6 bg-indigo-600 hover:bg-indigo-700">
              Add your first product
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-600/30 mb-4">
            <span className="text-2xl">🏪</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Become a Seller</h1>
          <p className="text-slate-400 mt-2">
            Set up your shop and complete identity verification to start selling
          </p>
        </div>

        <StepIndicator current={step} />

        <div className="bg-[#141420] border border-[#1E1E2E] rounded-2xl p-8">

          {/* ─── STEP 0: Shop Details ─────────────────────────────────────────── */}
          {step === 0 && (
            <form onSubmit={handleShopNext} className="space-y-5">
              <h2 className="text-xl font-bold text-white mb-6">Shop Details</h2>

              <div className="space-y-2">
                <Label htmlFor="shopName">Shop Name <span className="text-red-500">*</span></Label>
                <Input id="shopName" {...register('shopName')} placeholder="e.g. ProCards Store" className="bg-[#0A0A0F] border-[#1E1E2E]" />
                {errors.shopName && <span className="text-xs text-red-500">{errors.shopName.message}</span>}
                {shopNameCheck.name === shopName?.trim().replace(/\s+/g, ' ').toLowerCase() && shopNameCheck.status === 'checking' && (
                  <span className="text-xs text-slate-400">Checking shop name...</span>
                )}
                {shopNameCheck.name === shopName?.trim().replace(/\s+/g, ' ').toLowerCase() && shopNameCheck.status === 'taken' && (
                  <span className="text-xs text-red-500">Shop name is already taken. Please choose another name.</span>
                )}
                {shopNameCheck.name === shopName?.trim().replace(/\s+/g, ' ').toLowerCase() && shopNameCheck.status === 'error' && (
                  <span className="text-xs text-red-500">Unable to check shop name right now. Please try again.</span>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Shop Description <span className="text-red-500">*</span></Label>
                <textarea
                  id="description"
                  {...register('description')}
                  rows={4}
                  placeholder="Tell buyers what you sell, your experience, and why they should trust you..."
                  className="flex w-full rounded-md border border-[#1E1E2E] bg-[#0A0A0F] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-600 resize-none"
                />
                {errors.description && <span className="text-xs text-red-500">{errors.description.message}</span>}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="language">Primary Language <span className="text-red-500">*</span></Label>
                  <select id="language" {...register('language')} className="flex h-10 w-full rounded-md border border-[#1E1E2E] bg-[#0A0A0F] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-600">
                    {LANGUAGES.map((language) => <option key={language} value={language}>{language}</option>)}
                  </select>
                  {errors.language && <span className="text-xs text-red-500">{errors.language.message}</span>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="country">Country <span className="text-red-500">*</span></Label>
                  <select id="country" {...register('country')} className="flex h-10 w-full rounded-md border border-[#1E1E2E] bg-[#0A0A0F] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-600">
                    <option value="">Select country</option>
                    {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  {errors.country && <span className="text-xs text-red-500">{errors.country.message}</span>}
                </div>
              </div>

              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-sm text-indigo-200">
                <p className="font-semibold">Internal wallet payouts</p>
                <p className="mt-1 text-indigo-200/80">Your earnings will be automatically credited to your secure platform wallet upon successful order delivery.</p>
              </div>

              <div className="flex items-start gap-2 pt-2">
                <input type="checkbox" id="agreeSellerTerms" {...register('agreeSellerTerms')} className="mt-1 rounded bg-[#0A0A0F] border-[#1E1E2E] text-indigo-600" />
                <Label htmlFor="agreeSellerTerms" className="text-sm font-normal text-slate-400 leading-relaxed">
                  I agree to the VouchNode{' '}
                  <a href="/terms" className="text-indigo-400 hover:underline">Seller Terms of Service</a>
                  , including the platform fee policy and dispute resolution rules.
                </Label>
              </div>
              {errors.agreeSellerTerms && <span className="text-xs text-red-500 block">{errors.agreeSellerTerms.message}</span>}

              <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 mt-4">
                Continue to Identity Verification →
              </Button>
            </form>
          )}

          {/* ─── STEP 1: KYC ─────────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">Identity Verification (KYC)</h2>
                <p className="text-slate-400 text-sm mt-2">
                  To protect buyers and sellers on our platform, we require identity verification before approving seller accounts.
                  All documents are encrypted and reviewed only by our compliance team.
                </p>
              </div>

              {fastLaunchEnabled && (
                <div className="rounded-xl border border-amber-700/50 bg-amber-900/20 p-4 text-sm text-amber-200">
                  You can skip this step and agree to the following terms.
                </div>
              )}

              {/* KYC requirement info box */}
              <div className="bg-indigo-900/20 border border-indigo-800/40 rounded-xl p-4 text-sm text-indigo-300 space-y-1">
                <p className="font-semibold text-indigo-200">📋 Required documents:</p>
                <ul className="list-disc list-inside space-y-1 text-slate-300">
                  <li><strong>Front of ID</strong> — National ID, Passport, or Driver&apos;s Licence</li>
                  <li><strong>Back of ID</strong> — Reverse side of the same document</li>
                  <li><strong>Selfie with ID</strong> — A clear photo of your face <em>holding</em> the ID next to it</li>
                </ul>
                <p className="text-xs text-slate-500 pt-1">Accepted formats: JPG, PNG, HEIC · Max size: 10MB per file</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FileUploadBox
                  label="Front of ID"
                  hint="Passport, National ID, or Driver's Licence"
                  required
                  file={kyc.idFront}
                  onFile={f => setKyc(k => ({ ...k, idFront: f }))}
                />
                <FileUploadBox
                  label="Back of ID"
                  hint="Reverse side of the same document"
                  required
                  file={kyc.idBack}
                  onFile={f => setKyc(k => ({ ...k, idBack: f }))}
                />
                <FileUploadBox
                  label="Selfie with ID"
                  hint="You holding your ID clearly visible next to your face"
                  required
                  file={kyc.selfie}
                  onFile={f => setKyc(k => ({ ...k, selfie: f }))}
                />
              </div>

              {kycErrors.length > 0 && (
                <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-3 space-y-1">
                  {kycErrors.map(e => (
                    <p key={e} className="text-xs text-red-400 flex items-center gap-2">
                      <span>⚠</span> {e}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                <Button variant="outline" onClick={() => setStep(0)} className="flex-1 border-[#1E1E2E]">
                  ← Back
                </Button>
                <Button onClick={handleKycNext} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
                  Continue to Review →
                </Button>
                {fastLaunchEnabled && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSkipKyc}
                    className="flex-1 border-amber-700/60 text-amber-200 hover:bg-amber-900/20"
                  >
                    Skip for Now
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ─── STEP 2: Review & Submit ──────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white">Review & Submit</h2>

              {/* Shop summary */}
              <div className="bg-[#0A0A0F] rounded-xl border border-[#1E1E2E] divide-y divide-[#1E1E2E]">
                {[
                  { label: 'Shop Name', value: values.shopName },
                  { label: 'Country', value: COUNTRIES.find(c => c.value === values.country)?.label || values.country },
                  { label: 'Language', value: values.language },
                ].map(row => (
                  <div key={row.label} className="flex justify-between px-4 py-3 text-sm">
                    <span className="text-slate-500">{row.label}</span>
                    <span className="text-white font-medium">{row.value}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-sm text-indigo-200">
                Your earnings will be automatically credited to your secure platform wallet upon successful order delivery.
              </div>

              {kycSkipped ? (
                <div role="alert" className="rounded-xl border border-amber-700/50 bg-amber-900/20 p-4 text-sm text-amber-200">
                  Trade safely. If your store generates too many disputes or issues, your selling feature will be suspended until you complete manual identity verification (KYC) to reopen it. Please note that buying, depositing, and withdrawing will remain fully functional and unaffected.
                </div>
              ) : (
                <div className="bg-[#0A0A0F] rounded-xl border border-[#1E1E2E] p-4">
                  <p className="text-sm font-medium text-white mb-3">Identity Documents</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Front of ID', file: kyc.idFront },
                      { label: 'Back of ID', file: kyc.idBack },
                      { label: 'Selfie + ID', file: kyc.selfie },
                    ].map(d => (
                      <div key={d.label} className="text-center">
                        {d.file ? (
                          <FilePreview file={d.file} label={d.label} />
                        ) : (
                          <div className="w-full h-24 bg-[#1E1E2E] rounded-lg flex items-center justify-center">
                            <span className="text-2xl">❌</span>
                          </div>
                        )}
                        <p className="text-xs text-slate-400 mt-1">{d.label}</p>
                        {d.file && <p className="text-xs text-green-500">✓ Uploaded</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!kycSkipped && (
                <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl p-4 text-sm text-amber-300">
                  <p className="font-semibold mb-1">⏱ What happens next?</p>
                  <p className="text-slate-300">
                    Your documents are checked automatically in the background. Any unclear or inconsistent result is safely routed to admin review.
                    You&apos;ll receive an email notification once approved. You can continue using VouchNode as a buyer in the meantime.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1 border-[#1E1E2E]">
                  ← Back
                </Button>
                <Button
                  onClick={handleFinalSubmit}
                  disabled={isSubmitting}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Submitting...
                    </span>
                  ) : '🚀 Submit Application'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
