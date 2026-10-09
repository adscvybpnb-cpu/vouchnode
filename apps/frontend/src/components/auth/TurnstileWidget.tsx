'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          theme: 'dark';
          callback: (token: string) => void;
          'expired-callback': () => void;
          'error-callback': (errorCode?: string) => void;
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  onResetReady: (reset: () => void) => void;
}

export function TurnstileWidget({ onToken, onResetReady }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onResetReadyRef = useRef(onResetReady);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const configuredSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const siteKey = configuredSiteKey
    ?.trim()
    .replace(/^(['"])(.*)\1$/, '$2')
    .trim();
  const [widgetError, setWidgetError] = useState('');

  onTokenRef.current = onToken;
  onResetReadyRef.current = onResetReady;

  useEffect(() => {
    if (!siteKey) {
      console.warn('Turnstile siteKey is missing:', siteKey);
      return;
    }
    if (!scriptLoaded || !containerRef.current || widgetIdRef.current) return;

    let attempts = 0;
    const renderInterval = window.setInterval(() => {
      attempts += 1;
      if (!window.turnstile || !containerRef.current || widgetIdRef.current) {
        if (attempts >= 50) {
          window.clearInterval(renderInterval);
          console.error('Turnstile API did not become available after the script loaded.');
        }
        return;
      }

      window.clearInterval(renderInterval);
      const widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'dark',
        callback: (token) => {
          setWidgetError('');
          onTokenRef.current(token);
        },
        'expired-callback': () => {
          setWidgetError('Verification expired. Please complete the CAPTCHA again.');
          onTokenRef.current('');
        },
        'error-callback': (errorCode) => {
          onTokenRef.current('');
          if (errorCode === '400020') {
            setWidgetError('This CAPTCHA key is not authorized for this hostname. Add localhost or this domain to the Turnstile widget’s allowed hostnames in Cloudflare.');
            console.error('Turnstile rejected the current hostname (400020). Check the widget hostname allowlist.');
          } else {
            setWidgetError('CAPTCHA could not be verified. Please retry.');
            console.error('Turnstile widget error', { errorCode });
          }
        },
      });
      widgetIdRef.current = widgetId;
      onResetReadyRef.current(() => {
        onTokenRef.current('');
        setWidgetError('');
        if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
      });
    }, 100);

    return () => {
      window.clearInterval(renderInterval);
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
      onResetReadyRef.current(() => {});
    };
  }, [scriptLoaded, siteKey]);

  return (
    <div className="my-3 flex min-h-[65px] w-full justify-center">
      {siteKey && <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptLoaded(true)}
        onError={() => {
          setWidgetError('Unable to load CAPTCHA verification. Check your connection and retry.');
          console.error('Unable to load the Cloudflare Turnstile script.');
          onTokenRef.current('');
        }}
      />}
      <div ref={containerRef} className="min-h-[65px] min-w-[300px]" />
      {widgetError && <div className="mt-2 text-center">
        <p role="alert" className="text-sm text-rose-300">{widgetError}</p>
        <button
          type="button"
          onClick={() => {
            setWidgetError('');
            onTokenRef.current('');
            if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
            else window.location.reload();
          }}
          className="mt-2 text-sm font-semibold text-cyan-300 underline underline-offset-4 hover:text-cyan-200"
        >
          Retry CAPTCHA
        </button>
      </div>}
      {!siteKey && <p role="alert" className="mt-2 text-sm text-rose-300">Security verification is not configured.</p>}
    </div>
  );
}
