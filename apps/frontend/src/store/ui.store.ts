import { create } from 'zustand';

interface UiStore {
  mobileMenuOpen: boolean;
  searchOpen: boolean;
  currency: string;
  setMobileMenuOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setCurrency: (currency: string) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  mobileMenuOpen: false,
  searchOpen: false,
  currency: 'USDT',
  setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setCurrency: (currency) => set({ currency })
}));
