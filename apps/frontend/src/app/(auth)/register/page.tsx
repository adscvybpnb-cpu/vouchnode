'use client';
import React from 'react'; // needed for React.forwardRef
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authService } from '@/services/auth.service';

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const step1Schema = z
  .object({
    email: z.string().email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Minimum 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character (@$!%*?& etc.)'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

const step2Schema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be 30 characters or less')
    .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscores allowed'),
  country: z.string().min(1, 'Please select your country'),
  agreeTerms: z.boolean().refine((v) => v === true, 'You must agree to the Terms of Service'),
});

type Step1Values = z.infer<typeof step1Schema>;
type Step2Values = z.infer<typeof step2Schema>;




interface FieldErrors {
  email?:           string;
  password?:        string;
  confirmPassword?: string;
  username?:        string;
  firstName?:       string;
  lastName?:        string;
  country?:         string;
  agreeTerms?:      string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// value = ISO 3166-1 alpha-2 code (matches Country.code PK in DB)
// label = full country name shown to the user
const COUNTRIES: { code: string; name: string }[] = [
  {code:'AF',name:'Afghanistan'},{code:'AL',name:'Albania'},{code:'DZ',name:'Algeria'},
  {code:'AD',name:'Andorra'},{code:'AO',name:'Angola'},{code:'AG',name:'Antigua and Barbuda'},
  {code:'AR',name:'Argentina'},{code:'AM',name:'Armenia'},{code:'AU',name:'Australia'},
  {code:'AT',name:'Austria'},{code:'AZ',name:'Azerbaijan'},{code:'BS',name:'Bahamas'},
  {code:'BH',name:'Bahrain'},{code:'BD',name:'Bangladesh'},{code:'BB',name:'Barbados'},
  {code:'BY',name:'Belarus'},{code:'BE',name:'Belgium'},{code:'BZ',name:'Belize'},
  {code:'BJ',name:'Benin'},{code:'BT',name:'Bhutan'},{code:'BO',name:'Bolivia'},
  {code:'BA',name:'Bosnia and Herzegovina'},{code:'BW',name:'Botswana'},{code:'BR',name:'Brazil'},
  {code:'BN',name:'Brunei'},{code:'BG',name:'Bulgaria'},{code:'BF',name:'Burkina Faso'},
  {code:'BI',name:'Burundi'},{code:'CV',name:'Cabo Verde'},{code:'KH',name:'Cambodia'},
  {code:'CM',name:'Cameroon'},{code:'CA',name:'Canada'},{code:'CF',name:'Central African Republic'},
  {code:'TD',name:'Chad'},{code:'CL',name:'Chile'},{code:'CN',name:'China'},
  {code:'CO',name:'Colombia'},{code:'KM',name:'Comoros'},{code:'CG',name:'Congo'},
  {code:'CR',name:'Costa Rica'},{code:'HR',name:'Croatia'},{code:'CU',name:'Cuba'},
  {code:'CY',name:'Cyprus'},{code:'CZ',name:'Czech Republic'},{code:'DK',name:'Denmark'},
  {code:'DJ',name:'Djibouti'},{code:'DM',name:'Dominica'},{code:'DO',name:'Dominican Republic'},
  {code:'EC',name:'Ecuador'},{code:'EG',name:'Egypt'},{code:'SV',name:'El Salvador'},
  {code:'GQ',name:'Equatorial Guinea'},{code:'ER',name:'Eritrea'},{code:'EE',name:'Estonia'},
  {code:'SZ',name:'Eswatini'},{code:'ET',name:'Ethiopia'},{code:'FJ',name:'Fiji'},
  {code:'FI',name:'Finland'},{code:'FR',name:'France'},{code:'GA',name:'Gabon'},
  {code:'GM',name:'Gambia'},{code:'GE',name:'Georgia'},{code:'DE',name:'Germany'},
  {code:'GH',name:'Ghana'},{code:'GR',name:'Greece'},{code:'GD',name:'Grenada'},
  {code:'GT',name:'Guatemala'},{code:'GN',name:'Guinea'},{code:'GW',name:'Guinea-Bissau'},
  {code:'GY',name:'Guyana'},{code:'HT',name:'Haiti'},{code:'HN',name:'Honduras'},
  {code:'HU',name:'Hungary'},{code:'IS',name:'Iceland'},{code:'IN',name:'India'},
  {code:'ID',name:'Indonesia'},{code:'IR',name:'Iran'},{code:'IQ',name:'Iraq'},
  {code:'IE',name:'Ireland'},{code:'IL',name:'Israel'},{code:'IT',name:'Italy'},
  {code:'JM',name:'Jamaica'},{code:'JP',name:'Japan'},{code:'JO',name:'Jordan'},
  {code:'KZ',name:'Kazakhstan'},{code:'KE',name:'Kenya'},{code:'KI',name:'Kiribati'},
  {code:'KW',name:'Kuwait'},{code:'KG',name:'Kyrgyzstan'},{code:'LA',name:'Laos'},
  {code:'LV',name:'Latvia'},{code:'LB',name:'Lebanon'},{code:'LS',name:'Lesotho'},
  {code:'LR',name:'Liberia'},{code:'LY',name:'Libya'},{code:'LI',name:'Liechtenstein'},
  {code:'LT',name:'Lithuania'},{code:'LU',name:'Luxembourg'},{code:'MG',name:'Madagascar'},
  {code:'MW',name:'Malawi'},{code:'MY',name:'Malaysia'},{code:'MV',name:'Maldives'},
  {code:'ML',name:'Mali'},{code:'MT',name:'Malta'},{code:'MH',name:'Marshall Islands'},
  {code:'MR',name:'Mauritania'},{code:'MU',name:'Mauritius'},{code:'MX',name:'Mexico'},
  {code:'FM',name:'Micronesia'},{code:'MD',name:'Moldova'},{code:'MC',name:'Monaco'},
  {code:'MN',name:'Mongolia'},{code:'ME',name:'Montenegro'},{code:'MA',name:'Morocco'},
  {code:'MZ',name:'Mozambique'},{code:'MM',name:'Myanmar'},{code:'NA',name:'Namibia'},
  {code:'NR',name:'Nauru'},{code:'NP',name:'Nepal'},{code:'NL',name:'Netherlands'},
  {code:'NZ',name:'New Zealand'},{code:'NI',name:'Nicaragua'},{code:'NE',name:'Niger'},
  {code:'NG',name:'Nigeria'},{code:'NO',name:'Norway'},{code:'OM',name:'Oman'},
  {code:'PK',name:'Pakistan'},{code:'PW',name:'Palau'},{code:'PA',name:'Panama'},
  {code:'PG',name:'Papua New Guinea'},{code:'PY',name:'Paraguay'},{code:'PE',name:'Peru'},
  {code:'PH',name:'Philippines'},{code:'PL',name:'Poland'},{code:'PT',name:'Portugal'},
  {code:'QA',name:'Qatar'},{code:'RO',name:'Romania'},{code:'RU',name:'Russia'},
  {code:'RW',name:'Rwanda'},{code:'KN',name:'Saint Kitts and Nevis'},{code:'LC',name:'Saint Lucia'},
  {code:'VC',name:'Saint Vincent and the Grenadines'},{code:'WS',name:'Samoa'},
  {code:'SM',name:'San Marino'},{code:'ST',name:'Sao Tome and Principe'},
  {code:'SA',name:'Saudi Arabia'},{code:'SN',name:'Senegal'},{code:'RS',name:'Serbia'},
  {code:'SC',name:'Seychelles'},{code:'SL',name:'Sierra Leone'},{code:'SG',name:'Singapore'},
  {code:'SK',name:'Slovakia'},{code:'SI',name:'Slovenia'},{code:'SB',name:'Solomon Islands'},
  {code:'SO',name:'Somalia'},{code:'ZA',name:'South Africa'},{code:'KR',name:'South Korea'},
  {code:'SS',name:'South Sudan'},{code:'ES',name:'Spain'},{code:'LK',name:'Sri Lanka'},
  {code:'SD',name:'Sudan'},{code:'SR',name:'Suriname'},{code:'SE',name:'Sweden'},
  {code:'CH',name:'Switzerland'},{code:'SY',name:'Syria'},{code:'TW',name:'Taiwan'},
  {code:'TJ',name:'Tajikistan'},{code:'TZ',name:'Tanzania'},{code:'TH',name:'Thailand'},
  {code:'TL',name:'Timor-Leste'},{code:'TG',name:'Togo'},{code:'TO',name:'Tonga'},
  {code:'TT',name:'Trinidad and Tobago'},{code:'TN',name:'Tunisia'},{code:'TR',name:'Turkey'},
  {code:'TM',name:'Turkmenistan'},{code:'TV',name:'Tuvalu'},{code:'UG',name:'Uganda'},
  {code:'UA',name:'Ukraine'},{code:'AE',name:'United Arab Emirates'},
  {code:'GB',name:'United Kingdom'},{code:'US',name:'United States'},{code:'UY',name:'Uruguay'},
  {code:'UZ',name:'Uzbekistan'},{code:'VU',name:'Vanuatu'},{code:'VE',name:'Venezuela'},
  {code:'VN',name:'Vietnam'},{code:'YE',name:'Yemen'},{code:'ZM',name:'Zambia'},
  {code:'ZW',name:'Zimbabwe'},
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const barColor = score <= 2 ? 'bg-red-500' : score <= 3 ? 'bg-yellow-500' : score === 4 ? 'bg-lime-500' : 'bg-green-500';
  const label    = score <= 2 ? 'Weak'       : score <= 3 ? 'Fair'          : score === 4 ? 'Strong'      : 'Very Strong';
  const textColor = score <= 2 ? 'text-red-400' : score <= 3 ? 'text-yellow-400' : 'text-green-400';
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              i <= score ? barColor : 'bg-white/10'
            }`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${textColor}`}>{label}</p>
    </div>
  );
}

/** Red banner shown when the server returns a non-field-specific error */
function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300 animate-in fade-in slide-in-from-top-1 duration-200">
      <span className="mt-0.5 text-red-400 shrink-0">⚠</span>
      <p className="flex-1 leading-snug">{message}</p>
      <button
        onClick={onDismiss}
        className="shrink-0 text-red-400 hover:text-white transition-colors ml-1 text-xs mt-0.5"
        aria-label="Dismiss error"
      >
        ✕
      </button>
    </div>
  );
}

/** Field-level inline error message */
function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-red-400 mt-1 animate-in fade-in duration-150">
      <span>⚠</span>
      {message}
    </p>
  );
}

/** Input wrapper that highlights red when there's an error.
 *  MUST use React.forwardRef — React Hook Form spreads a ref via register()
 *  and without forwardRef the ref is silently dropped, making every field
 *  read as empty on submit and triggering all required-field errors.
 */
const FieldInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { error?: string }
>(({ error, className = '', ...props }, ref) => (
  <input
    ref={ref}                    // ← ref forwarded to real DOM node
    {...props}
    className={`flex h-11 w-full rounded-lg border px-3 py-2 text-sm text-white bg-[#141420]
      placeholder:text-slate-600 focus:outline-none focus:ring-2 transition-all
      disabled:opacity-50 disabled:cursor-not-allowed
      ${
        error
          ? 'border-red-500/60 focus:ring-red-500/30 focus:border-red-500'
          : 'border-[#1E1E2E] focus:ring-indigo-500/40 focus:border-indigo-500/60'
      }
      ${className}`}
  />
));
FieldInput.displayName = 'FieldInput';

// ─── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: 1 | 2 | 'success' }) {
  const current = step === 'success' ? 3 : step;
  return (
    <div className="flex items-center gap-0 mb-8">
      {[
        { n: 1, label: 'Account' },
        { n: 2, label: 'Profile' },
      ].map(({ n, label }, idx) => (
        <div key={n} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                n < current
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : n === current
                  ? 'border-indigo-400 text-indigo-300 bg-indigo-600/10'
                  : 'border-white/10 text-slate-600'
              }`}
            >
              {n < current ? '✓' : n}
            </div>
            <span
              className={`text-[10px] mt-1 font-medium ${
                n === current ? 'text-white' : 'text-slate-600'
              }`}
            >
              {label}
            </span>
          </div>
          {idx < 1 && (
            <div
              className={`h-px w-10 mx-2 mb-4 transition-all ${
                current > n ? 'bg-indigo-600' : 'bg-white/10'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter();
  const [referralCode, setReferralCode] = useState('');

  const [step, setStep]           = useState<1 | 2 | 'success'>(1);
  const [step1Data, setStep1Data] = useState<Step1Values | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Global banner error (server error that isn't field-specific)
  const [bannerError, setBannerError] = useState<string | null>(null);

  // Backend field-level errors mapped from Zod path strings
  const [backendErrors, setBackendErrors] = useState<FieldErrors>({});

  const step1Form = useForm<Step1Values>({ resolver: zodResolver(step1Schema), mode: 'onTouched' });
  const step2Form = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: { agreeTerms: false },
    mode: 'onTouched',
  });

  const passwordWatch = step1Form.watch('password', '');

  useEffect(() => {
    setReferralCode(new URLSearchParams(window.location.search).get('ref')?.trim() || '');
  }, []);

  // ── Step 1: advance to step 2 (local validation only, no API call) ─────────

  const onStep1 = (data: Step1Values) => {
    setBannerError(null);
    setBackendErrors({});
    setStep1Data(data);
    setStep(2);
  };

  // ── Step 2: submit to backend ──────────────────────────────────────────────
  const onStep2 = async (data: Step2Values) => {
    if (!step1Data) return;

    setBannerError(null);
    setBackendErrors({});
    setIsLoading(true);

    try {
      const { confirmPassword, ...step1Payload } = step1Data;
      const { agreeTerms,      ...step2Payload } = data;

      // Registration only creates the account; it does not authenticate the user.
      const registration = await authService.register({
        ...step1Payload,
        ...step2Payload,
        ...(referralCode ? { referralCode } : {}),
      });

      // `user` is optional because the API response may omit it. Never read a
      // token or update auth state here: pending accounts have no access token.
      if (registration?.user) {
        router.replace('/login');
        return;
      }

      // A successful response without user data is still a completed signup.
      router.replace('/login');

    } catch (err: any) {
      // Safe message extraction — triple-guarded, never throws
      let backendMessage: string;
      try {
        backendMessage =
          (typeof err?.message === 'string' && err.message.trim() !== '' ? err.message : null) ??
          err?.response?.data?.message ??
          err?.response?.data?.error ??
          'Invalid registration data. Please check your inputs and try again.';
      } catch {
        backendMessage = 'An unexpected error occurred. Please try again.';
      }

      console.error('[Register] Backend error:', { message: err?.message, responseData: err?.response?.data });

      // Parse "field: message; field: message" format — also guarded
      const fieldErrors: FieldErrors = {};
      try {
        if (typeof backendMessage === 'string' && backendMessage.includes(': ')) {
          const FIELD_NAMES: Record<string, keyof FieldErrors> = {
            email: 'email', password: 'password', username: 'username',
            firstName: 'firstName', lastName: 'lastName', country: 'country',
          };
          backendMessage.split('; ').forEach((segment) => {
            const colonAt = segment.indexOf(': ');
            if (colonAt === -1) return;
            const key   = segment.slice(0, colonAt).trim();
            const msg   = segment.slice(colonAt + 2).trim();
            const field = FIELD_NAMES[key];
            if (field && msg) fieldErrors[field] = msg;
          });
        }
      } catch { /* parse failed — fall through to banner */ }

      const hasFieldErrors = Object.keys(fieldErrors).length > 0;

      if (hasFieldErrors) {
        setBackendErrors(fieldErrors);
        const affectsStep1 = (['email', 'password', 'confirmPassword'] as Array<keyof FieldErrors>)
          .some((f) => fieldErrors[f]);

        if (affectsStep1) {
          setStep(1);
          if (fieldErrors.email)    step1Form.setError('email',    { type: 'server', message: fieldErrors.email });
          if (fieldErrors.password) step1Form.setError('password', { type: 'server', message: fieldErrors.password });
        } else {
          if (fieldErrors.username)  step2Form.setError('username',  { type: 'server', message: fieldErrors.username });
          if (fieldErrors.firstName) step2Form.setError('firstName', { type: 'server', message: fieldErrors.firstName });
          if (fieldErrors.lastName)  step2Form.setError('lastName',  { type: 'server', message: fieldErrors.lastName });
          if (fieldErrors.country)   step2Form.setError('country',   { type: 'server', message: fieldErrors.country });
          setBannerError(backendMessage);
        }
      } else {
        // No parseable field — show full message as banner
        setBannerError(backendMessage);
      }

    } finally {
      setIsLoading(false); // ALWAYS runs — button never stays frozen
    }
  };


  // ─── Success screen ─────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 rounded-2xl bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto mb-5 text-3xl">
          ✉️
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">Check your inbox</h2>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
          We&apos;ve sent a verification link to{' '}
          <strong className="text-white">{step1Data?.email}</strong>.
          <br />
          Click it to activate your account.
        </p>
        <Button
          onClick={() => router.push('/login')}
          className="w-full bg-indigo-600 hover:bg-indigo-500"
        >
          Go to Login →
        </Button>
      </div>
    );
  }

  // ─── Forms ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-0">
      <StepIndicator step={step} />

      {/* ── Global error banner (dismissed by ✕ or next submit) ─────────── */}
      {bannerError && (
        <div className="mb-5">
          <ErrorBanner message={bannerError} onDismiss={() => setBannerError(null)} />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          STEP 1 — Email + Password
      ════════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <form onSubmit={step1Form.handleSubmit(onStep1)} className="space-y-5" noValidate>
          <div>
            <h1 className="text-2xl font-bold text-white">Create your account</h1>
            <p className="text-slate-400 text-sm mt-1">
              Start with your email and a strong password.
            </p>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email">
              Email Address <span className="text-red-500">*</span>
            </Label>
            <FieldInput
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              disabled={isLoading}
              error={step1Form.formState.errors.email?.message || backendErrors.email}
              {...step1Form.register('email')}
            />
            <FieldError message={step1Form.formState.errors.email?.message || backendErrors.email} />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label htmlFor="password">
              Password <span className="text-red-500">*</span>
            </Label>
            <FieldInput
              id="password"
              type="password"
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              disabled={isLoading}
              error={step1Form.formState.errors.password?.message || backendErrors.password}
              {...step1Form.register('password')}
            />
            <PasswordStrength password={passwordWatch} />
            <FieldError message={step1Form.formState.errors.password?.message || backendErrors.password} />
          </div>

          {/* Confirm password */}
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">
              Confirm Password <span className="text-red-500">*</span>
            </Label>
            <FieldInput
              id="confirmPassword"
              type="password"
              placeholder="Repeat your password"
              autoComplete="new-password"
              disabled={isLoading}
              error={step1Form.formState.errors.confirmPassword?.message}
              {...step1Form.register('confirmPassword')}
            />
            <FieldError message={step1Form.formState.errors.confirmPassword?.message} />
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 font-semibold mt-2"
          >
            Continue →
          </Button>
        </form>
      )}

      {/* ════════════════════════════════════════════════════════════════
          STEP 2 — Profile Details
      ════════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <form onSubmit={step2Form.handleSubmit(onStep2)} className="space-y-5" noValidate>
          <div>
            <h1 className="text-2xl font-bold text-white">Complete your profile</h1>
            <p className="text-slate-400 text-sm mt-1">Tell us a bit about yourself.</p>
          </div>

          {/* First + Last name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">
                First Name <span className="text-red-500">*</span>
              </Label>
              <FieldInput
                id="firstName"
                placeholder="Jane"
                disabled={isLoading}
                error={step2Form.formState.errors.firstName?.message || backendErrors.firstName}
                {...step2Form.register('firstName')}
              />
              <FieldError message={step2Form.formState.errors.firstName?.message || backendErrors.firstName} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">
                Last Name <span className="text-red-500">*</span>
              </Label>
              <FieldInput
                id="lastName"
                placeholder="Doe"
                disabled={isLoading}
                error={step2Form.formState.errors.lastName?.message || backendErrors.lastName}
                {...step2Form.register('lastName')}
              />
              <FieldError message={step2Form.formState.errors.lastName?.message || backendErrors.lastName} />
            </div>
          </div>

          {/* Username */}
          <div className="space-y-1.5">
            <Label htmlFor="username">
              Username <span className="text-red-500">*</span>
            </Label>
            <FieldInput
              id="username"
              placeholder="e.g. jane_doe"
              autoComplete="username"
              disabled={isLoading}
              error={step2Form.formState.errors.username?.message || backendErrors.username}
              {...step2Form.register('username')}
            />
            <FieldError message={step2Form.formState.errors.username?.message || backendErrors.username} />
          </div>

          {/* Country */}
          <div className="space-y-1.5">
            <Label htmlFor="country">
              Country <span className="text-red-500">*</span>
            </Label>
            <select
              id="country"
              disabled={isLoading}
              {...step2Form.register('country')}
              className={`flex h-11 w-full rounded-lg border px-3 py-2 text-sm text-white bg-[#141420]
                focus:outline-none focus:ring-2 transition-all disabled:opacity-50
                ${
                  step2Form.formState.errors.country || backendErrors.country
                    ? 'border-red-500/60 focus:ring-red-500/30'
                    : 'border-[#1E1E2E] focus:ring-indigo-500/40 focus:border-indigo-500/60'
                }`}
            >
              <option value="">Select your country</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldError message={step2Form.formState.errors.country?.message || backendErrors.country} />
          </div>

          {/* Terms */}
          <div className="space-y-1.5">
            <div className="flex items-start gap-2.5 pt-1">
              <input
                type="checkbox"
                id="agreeTerms"
                disabled={isLoading}
                {...step2Form.register('agreeTerms')}
                className="mt-0.5 w-4 h-4 rounded accent-indigo-600 bg-[#141420] border-[#1E1E2E] cursor-pointer"
              />
              <Label
                htmlFor="agreeTerms"
                className="text-sm font-normal text-slate-400 leading-relaxed cursor-pointer"
              >
                I agree to the{' '}
                <Link href="/terms" className="text-indigo-400 hover:underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/terms" className="text-indigo-400 hover:underline">
                  Privacy Policy
                </Link>
              </Label>
            </div>
            <FieldError message={step2Form.formState.errors.agreeTerms?.message} />
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => {
                setBannerError(null);
                setBackendErrors({});
                setStep(1);
              }}
              className="flex-1 border-[#1E1E2E] text-slate-300 hover:text-white"
            >
              ← Back
            </Button>

            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 font-semibold"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating account...
                </span>
              ) : (
                'Create Account 🎉'
              )}
            </Button>
          </div>
        </form>
      )}

      {/* Toggle to login */}
      <p className="mt-7 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="text-indigo-400 font-medium hover:underline">
          Sign In
        </Link>
      </p>
    </div>
  );
}
