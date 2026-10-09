'use client';
import { useState } from 'react';
import { walletService } from '../../services/wallet.service';
import type { Deposit } from '../../types/api.types';
import { Copy } from 'lucide-react';

export function DepositForm() {
  const [currency, setCurrency] = useState('USDT');
  const [network, setNetwork] = useState('TRC20');
  const [deposit, setDeposit] = useState<Deposit | null>(null);
  const [loading, setLoading] = useState(false);

  const handleInit = async () => {
    setLoading(true);
    try {
      const res = await walletService.initDeposit(currency, network);
      setDeposit(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const copyAddress = () => {
    if (deposit?.address) navigator.clipboard.writeText(deposit.address);
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-card border border-border rounded-xl">
      <h2 className="text-xl font-bold mb-6 text-foreground">Deposit Crypto</h2>
      
      {!deposit ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Currency</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)} className="w-full bg-muted border border-border rounded-md p-2 text-foreground">
              <option value="USDT">USDT</option>
              <option value="BTC">Bitcoin</option>
            </select>
          </div>
          {currency === 'USDT' && (
            <div>
              <label className="block text-sm font-medium mb-1">Network</label>
              <select value={network} onChange={e => setNetwork(e.target.value)} className="w-full bg-muted border border-border rounded-md p-2 text-foreground">
                <option value="TRC20">Tron (TRC20)</option>
                <option value="ERC20">Ethereum (ERC20)</option>
              </select>
            </div>
          )}
          <button onClick={handleInit} disabled={loading} className="w-full bg-primary text-primary-foreground py-2 rounded-md font-medium hover:bg-primary-hover transition-colors">
            {loading ? 'Generating...' : 'Get Address'}
          </button>
        </div>
      ) : (
        <div className="space-y-6 text-center">
          <div className="p-4 bg-white rounded-lg inline-block mx-auto">
            {/* Simple QR placeholder */}
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${deposit.address}`} alt="QR Code" />
          </div>
          <div className="bg-muted p-3 rounded-md flex items-center justify-between border border-border">
            <span className="text-sm font-mono truncate mr-2 text-foreground">{deposit.address}</span>
            <button onClick={copyAddress} className="p-2 bg-background border border-border rounded hover:bg-accent text-foreground">
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">Send only {currency} over {network} to this address. It will be credited automatically.</p>
        </div>
      )}
    </div>
  );
}
