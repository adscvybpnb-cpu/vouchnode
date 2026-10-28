const REFERRAL_CODE_STORAGE_KEY = 'referral-code';

export function rememberReferralCode(value: string | null) {
  const referralCode = value?.trim();
  if (!referralCode || referralCode.length > 128 || typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(REFERRAL_CODE_STORAGE_KEY, referralCode);
  } catch (error) {
    console.error('Unable to save referral attribution for this session', error);
  }
}

export function getReferralCode(search: string) {
  const queryReferralCode = new URLSearchParams(search).get('ref')?.trim();
  if (queryReferralCode && queryReferralCode.length <= 128) {
    rememberReferralCode(queryReferralCode);
    return queryReferralCode;
  }

  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(REFERRAL_CODE_STORAGE_KEY)?.trim() || '';
  } catch (error) {
    console.error('Unable to read referral attribution for this session', error);
    return '';
  }
}

export function clearReferralCode() {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.removeItem(REFERRAL_CODE_STORAGE_KEY);
  } catch (error) {
    console.error('Unable to clear referral attribution after registration', error);
  }
}
