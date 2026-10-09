export type SellerCatalogCategory =
  | 'gift-cards'
  | 'gaming'
  | 'steam-keys'
  | 'pubg-mobile'
  | 'free-fire'
  | 'roblox'
  | 'fortnite'
  | 'streaming';

export interface SellerCatalogTemplate {
  id: string;
  name: string;
  category: SellerCatalogCategory;
  categoryName: string;
}

export const sellerCatalog: SellerCatalogTemplate[] = [
  { id: 'apple-gift-card', name: 'Apple Gift Card', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'amazon', name: 'Amazon', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'google-play', name: 'Google Play', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'steam', name: 'Steam', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'playstation', name: 'PlayStation', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'xbox', name: 'Xbox', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'nintendo', name: 'Nintendo', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'razer-gold', name: 'Razer Gold', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'roblox', name: 'Roblox', category: 'roblox', categoryName: 'Roblox Robux' },
  { id: 'shein', name: 'Shein', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'zara', name: 'Zara', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'netflix', name: 'Netflix', category: 'streaming', categoryName: 'Streaming' },
  { id: 'spotify-premium', name: 'Spotify Premium', category: 'streaming', categoryName: 'Streaming' },
  { id: 'discord-nitro', name: 'Discord Nitro', category: 'streaming', categoryName: 'Streaming' },
  { id: 'shahid-vip', name: 'Shahid VIP', category: 'streaming', categoryName: 'Streaming' },
  { id: 'crunchyroll', name: 'Crunchyroll', category: 'streaming', categoryName: 'Streaming' },
  { id: 'hulu', name: 'Hulu', category: 'streaming', categoryName: 'Streaming' },
  { id: 'hbo-max', name: 'HBO Max', category: 'streaming', categoryName: 'Streaming' },
  { id: 'youtube-premium', name: 'YouTube Premium', category: 'streaming', categoryName: 'Streaming' },
  { id: 'pubg-mobile', name: 'PUBG Mobile', category: 'pubg-mobile', categoryName: 'PUBG Mobile UC' },
  { id: 'valorant', name: 'Valorant', category: 'gaming', categoryName: 'Gaming' },
  { id: 'free-fire', name: 'Free Fire', category: 'free-fire', categoryName: 'Free Fire Diamonds' },
  { id: 'league-of-legends', name: 'League of Legends', category: 'gaming', categoryName: 'Gaming' },
  { id: 'minecraft', name: 'Minecraft', category: 'gaming', categoryName: 'Gaming' },
  { id: 'fortnite-v-bucks', name: 'Fortnite V-Bucks', category: 'fortnite', categoryName: 'Fortnite V-Bucks' },
  { id: 'ea-play', name: 'EA Play', category: 'gaming', categoryName: 'Gaming' },
  { id: 'apex-legends', name: 'Apex Legends', category: 'gaming', categoryName: 'Gaming' },
  { id: 'call-of-duty-cp', name: 'Call of Duty CP', category: 'gaming', categoryName: 'Gaming' },
  { id: 'genshin-impact', name: 'Genshin Impact', category: 'gaming', categoryName: 'Gaming' },
  { id: 'mcdonalds', name: "McDonald's", category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'starbucks', name: 'Starbucks', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'dominos', name: "Domino's", category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'subway', name: 'Subway', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'burger-king', name: 'Burger King', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'pizza-hut', name: 'Pizza Hut', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'dunkin', name: "Dunkin'", category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'kfc', name: 'KFC', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'taco-bell', name: 'Taco Bell', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'olive-garden', name: 'Olive Garden', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'chipotle', name: 'Chipotle', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'hard-rock-cafe', name: 'Hard Rock Cafe', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'uber', name: 'Uber', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'airbnb', name: 'Airbnb', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'adidas', name: 'Adidas', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'nike', name: 'Nike', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'sephora', name: 'Sephora', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'target', name: 'Target', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'walmart', name: 'Walmart', category: 'gift-cards', categoryName: 'Gift Cards' },
  { id: 'ebay', name: 'eBay', category: 'gift-cards', categoryName: 'Gift Cards' },
];

export function getSellerCatalogTemplate(id: string | null | undefined) {
  return sellerCatalog.find((template) => template.id === id);
}
