export type SupportedAsset = 'USDT' | 'USDC' | 'TRX' | 'BCH' | 'BTC' | 'BNB' | 'SOL' | 'ETH' | 'LTC';
export type SupportedNetwork =
  | 'TRC20'
  | 'BEP20'
  | 'ERC20'
  | 'POLYGON'
  | 'ARBITRUM_ONE'
  | 'BASE'
  | 'OPTIMISM'
  | 'SOLANA'
  | 'BTC'
  | 'BCH'
  | 'LTC';

export type TokenDeployment = {
  asset: 'USDT' | 'USDC';
  network: SupportedNetwork;
  contract: string;
  decimals: number;
};

export { buildRpcEndpointPool, RPC_ENDPOINT_POOLS } from './rpc-endpoint-pools';

export const TOKEN_DEPLOYMENTS: readonly TokenDeployment[] = [
  { asset: 'USDT', network: 'ERC20', contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
  { asset: 'USDC', network: 'ERC20', contract: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
  { asset: 'USDT', network: 'BEP20', contract: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
  { asset: 'USDC', network: 'BEP20', contract: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
  { asset: 'USDC', network: 'POLYGON', contract: '0x3c499c542cef5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
  { asset: 'USDT', network: 'POLYGON', contract: '0xc2132D05D31c914a87C6611C10748AaCBc532EAF', decimals: 6 },
  { asset: 'USDT', network: 'ARBITRUM_ONE', contract: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', decimals: 6 },
  { asset: 'USDC', network: 'ARBITRUM_ONE', contract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
  { asset: 'USDT', network: 'BASE', contract: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 },
  { asset: 'USDC', network: 'BASE', contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  { asset: 'USDT', network: 'OPTIMISM', contract: '0x94b008aA00579c1307B0EF2c499Ad98a8ce58e58', decimals: 6 },
  { asset: 'USDC', network: 'OPTIMISM', contract: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
  { asset: 'USDT', network: 'TRC20', contract: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj', decimals: 6 },
  { asset: 'USDC', network: 'TRC20', contract: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8', decimals: 6 },
  { asset: 'USDC', network: 'SOLANA', contract: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  { asset: 'USDT', network: 'SOLANA', contract: 'Es9vMFrzaCERmJfrF4H2FYD4e8d8FJ6a9V1Y7h9xH7T', decimals: 6 },
];

const nativeNetworks: Record<Exclude<SupportedAsset, 'USDT' | 'USDC'>, readonly SupportedNetwork[]> = {
  TRX: ['TRC20'],
  BNB: ['BEP20'],
  ETH: ['ERC20'],
  SOL: ['SOLANA'],
  BTC: ['BTC'],
  BCH: ['BCH'],
  LTC: ['LTC'],
};

export function getTokenDeployment(asset: string, network: string) {
  return TOKEN_DEPLOYMENTS.find((deployment) =>
    deployment.asset === asset.toUpperCase() && deployment.network === network.toUpperCase()
  );
}

export function requiresManualReview(asset: string, network?: string) {
  const normalizedAsset = asset.toUpperCase();
  const normalizedNetwork = network?.toUpperCase();
  return ['BTC', 'BCH', 'LTC', 'ETH', 'BNB'].includes(normalizedAsset) ||
    (normalizedAsset === 'TRX' && normalizedNetwork === 'TRC20') ||
    (normalizedAsset === 'SOL' && normalizedNetwork === 'SOLANA');
}

export function isAutomatedTokenNetwork(asset: string, network: string) {
  const normalizedAsset = asset.toUpperCase();
  return (normalizedAsset === 'USDT' || normalizedAsset === 'USDC') &&
    Boolean(getTokenDeployment(normalizedAsset, network));
}

export function isSupportedAssetNetwork(asset: string, network: string) {
  const normalizedAsset = asset.toUpperCase() as SupportedAsset;
  const normalizedNetwork = network.toUpperCase() as SupportedNetwork;
  if (normalizedAsset === 'USDT' || normalizedAsset === 'USDC') {
    return Boolean(getTokenDeployment(normalizedAsset, normalizedNetwork));
  }

  return nativeNetworks[normalizedAsset]?.includes(normalizedNetwork) ?? false;
}
