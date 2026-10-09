import { sellerService } from '@/services/seller.service';
import { type User, useAuthStore } from '@/store/auth.store';

export const isApprovedSeller = (user: Pick<User, 'sellerStatus'> | null | undefined) =>
  user?.sellerStatus === 'approved';

export const SELLER_ONBOARDING_PATH = '/seller/onboarding';
export const SELLER_CHOOSE_ASSET_PATH = '/seller/choose-asset';

export const getSellerOnboardingPath = (redirectPath?: string) =>
  redirectPath
    ? `${SELLER_ONBOARDING_PATH}?redirect=${encodeURIComponent(redirectPath)}`
    : SELLER_ONBOARDING_PATH;

export async function getSellerStartPath() {
  const currentUser = useAuthStore.getState().user;
  if (!currentUser) return '/become-a-seller';

  const { status } = await sellerService.getMySellerStatus();
  useAuthStore.getState().updateUser({ sellerStatus: status });
  return status === 'approved' ? SELLER_CHOOSE_ASSET_PATH : SELLER_ONBOARDING_PATH;
}
