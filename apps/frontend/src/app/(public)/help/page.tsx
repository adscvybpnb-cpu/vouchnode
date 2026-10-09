import Link from 'next/link';

const stablecoinNetworks = [
  ['Tron (TRC-20)', 'Select TRC20 in the deposit form. Confirm that the sending wallet is using the Tron network.'],
  ['BNB Smart Chain (BEP-20)', 'Select BEP20 and send from a BNB Smart Chain address. Do not use Ethereum or another EVM network.'],
  ['Ethereum (ERC-20)', 'Select ERC20 and account for Ethereum network costs before sending.'],
  ['Polygon', 'Select POLYGON and send the supported token using Polygon PoS.'],
  ['Arbitrum One', 'Select ARBITRUM_ONE and ensure the sending wallet is on Arbitrum One, not Ethereum mainnet.'],
  ['Base', 'Select BASE and use the Base network.'],
  ['Optimism', 'Select OPTIMISM and use Optimism mainnet.'],
  ['Solana', 'Select SOLANA and use the Solana network.'],
];

function GuideSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-white/10 bg-[#12141d] p-6 sm:p-8">
      <h2 className="text-xl font-bold text-white sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300">{children}</div>
    </section>
  );
}

export default function HelpCenterPage() {
  return (
    <main className="min-h-screen bg-[#0A0A0F] px-4 py-12 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-300">Support</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">Help Center</h1>
          <p className="mt-4 max-w-3xl leading-7 text-slate-300">
            Practical guides for marketplace purchases, peer-to-peer trades, wallet deposits and withdrawals.
            Always follow the current instructions shown in your signed-in account; available assets, routes,
            fees, and trade controls can change.
          </p>
          <nav aria-label="Help topics" className="mt-6 flex flex-wrap gap-3 text-sm text-indigo-200">
            <a href="#buying" className="hover:underline">Buying</a>
            <a href="#selling" className="hover:underline">Selling</a>
            <a href="#depositing" className="hover:underline">Deposits</a>
            <a href="#withdrawing" className="hover:underline">Withdrawals</a>
            <a href="#disputes" className="hover:underline">Disputes</a>
          </nav>
        </header>

        <div className="space-y-5">
          <GuideSection id="account" title="1. Create and protect your account">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Register with an email address you control and verify it when prompted.</li>
              <li>Use a unique, strong password. Never share your password, one-time codes, recovery credentials, or wallet seed phrase with another user or anyone claiming to be support.</li>
              <li>Complete any identity or account checks requested for the feature or transaction you are using. Information must be accurate and current.</li>
              <li>Review account activity and wallet transaction history regularly. Contact support promptly if you see activity you did not authorize.</li>
            </ol>
          </GuideSection>

          <GuideSection id="buying" title="2. Browse and buy in the marketplace">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Open <Link href="/products?category=all" className="text-indigo-300 hover:underline">Browse All</Link> or choose a category. Check the listing title, region, denomination, delivery method, seller profile, seller terms, and total price before proceeding.</li>
              <li>Sign in, select the listing and quantity, and follow the checkout instructions. Confirm the order details before authorizing payment.</li>
              <li>For eligible orders, the platform may reserve the relevant funds in its internal escrow ledger while delivery is completed. Check the order page for the actual status and available actions; an escrow reservation does not guarantee a successful transaction or eliminate every risk.</li>
              <li>Keep communication and evidence in the order conversation. Do not mark an order received or release funds until you have checked the delivered item and the order terms.</li>
              <li>When satisfied, use the order-page confirmation action. If there is a problem, use the order-page dispute controls while available instead of contacting the counterparty off-platform.</li>
            </ol>
          </GuideSection>

          <GuideSection id="p2p" title="3. Complete an Auto-P2P or P2P trade">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Review the offer carefully, including the payment method, supported gift card, rate, limits, deadline, and merchant terms.</li>
              <li>Open the offer to create a trade. Use only the payment method and instructions shown in that trade. Do not accept requests to move the trade to an external chat or change the recipient outside the recorded order.</li>
              <li>Follow the on-screen payment or gift-card submission steps. Keep original receipts and unedited evidence. Never submit a code or make a payment before checking the trade state and instructions.</li>
              <li>The crypto side of an eligible trade is reserved by the platform while the trade is active. The counterparty cannot receive those reserved funds merely by asking you to bypass the in-product release controls.</li>
              <li>When the exchange is complete, use the appropriate confirmation or release action in the trade details. A blockchain transfer, once broadcast and confirmed, is generally irreversible.</li>
            </ol>
          </GuideSection>

          <GuideSection id="selling" title="4. Sell products or create a P2P offer">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Complete seller onboarding and any approval or verification steps shown in your account.</li>
              <li>Create an accurate listing or offer. State the correct product, region, denomination, delivery method, limits, payment methods, and response expectations.</li>
              <li>For each order, use the order workspace to deliver the product or respond to the buyer. Keep proof of acquisition, delivery, and communication.</li>
              <li>Do not deliver invalid, redeemed, stolen, restricted, or misrepresented codes or assets. Do not ask buyers to mark an order complete before delivery.</li>
              <li>Funds remain subject to the displayed order, escrow, dispute, and withdrawal states. Check your wallet history for available, pending, and reserved balances.</li>
            </ol>
          </GuideSection>

          <GuideSection id="depositing" title="5. How to deposit crypto safely">
            <p>
              Nine wallet assets are currently listed by the platform: BTC, BCH, LTC, TRX, USDT, USDC, BNB,
              SOL, and ETH. USDT and USDC deposits can use the eight network options below where shown in
              the deposit form. Native-asset deposits use the corresponding BTC, BCH, LTC, Tron, BNB Smart
              Chain, Ethereum, or Solana network. The asset/network combinations available to your account
              are determined by the live form and backend validation.
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>Sign in and open <Link href="/dashboard/wallet/deposit" className="text-indigo-300 hover:underline">Wallet → Deposit</Link>.</li>
              <li>Choose the asset you intend to send. For USDT or USDC, choose the exact network listed for your asset. For a native coin, use its matching native network.</li>
              <li>Enter the expected amount and generate the deposit address. Wait for the address/session to appear. Verify the asset and network displayed beside it before copying.</li>
              <li>In your external wallet or exchange, select the exact same asset and network. Paste the generated address; independently compare the beginning and end of the address. If a memo/tag is explicitly provided, include it exactly as shown.</li>
              <li>Send only the selected asset over the selected network. Never use a similar-looking network, token, or address from an old transaction. A wrong-chain transfer may be unrecoverable.</li>
              <li>Wait for the network confirmations and any required platform review. Check Wallet or transaction history for the resulting status; do not send a second payment just because a transfer is still pending.</li>
            </ol>
            <h3 className="pt-2 font-semibold text-white">Eight stablecoin network options</h3>
            <ul className="list-disc space-y-2 pl-5">
              {stablecoinNetworks.map(([network, instruction]) => <li key={network}><strong className="text-slate-100">{network}:</strong> {instruction}</li>)}
            </ul>
            <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-amber-100">
              Do not rely on a network being supported just because it appears in an external wallet. The
              deposit form is authoritative. Do not deposit TON/GRAM or any asset/network combination
              unless it is currently offered for selection and the platform generates a matching address.
            </p>
          </GuideSection>

          <GuideSection id="withdrawing" title="6. How to withdraw funds">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Open <Link href="/dashboard/wallet/withdraw" className="text-indigo-300 hover:underline">Wallet → Withdraw</Link> and select an asset with an available balance. Funds that are pending, frozen, or reserved in an active trade cannot necessarily be withdrawn.</li>
              <li>Confirm the destination address and network in the receiving wallet before entering them. Use an address controlled by you and compatible with the selected asset/network.</li>
              <li>Enter an amount within the displayed available balance. The platform withdrawal fee is currently 1% by default; the configured fee schedule may change. Network transaction costs vary with chain and congestion and may be shown or applied during processing.</li>
              <li>Review the fee, net amount, destination, and network in the confirmation details. Submit only after checking each value. A withdrawal request may be processed promptly and an on-chain transfer is generally irreversible once broadcast.</li>
              <li>Track the request from Wallet / transaction history. If it fails, check the displayed status and returned balance before submitting another withdrawal.</li>
            </ol>
            <p>
              Never share your seed phrase or private key to receive a withdrawal. VouchNode support will not
              ask you to send funds to a personal address to “unlock” a withdrawal.
            </p>
          </GuideSection>

          <GuideSection id="disputes" title="7. How to open a dispute or request help">
            <p>
              Trade disputes are tied to a specific transaction and must be opened from its details page.
              There is no standalone dispute button in the footer.
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>Open your order or trade from your orders/history and navigate to its details page. For marketplace purchases, use the order in your account history; for Auto-P2P, open the relevant P2P order details.</li>
              <li>First review the current status, deadline, instructions, and conversation. Send a concise in-platform message to the counterparty and allow the response period shown on screen, unless an urgent safety or fraud issue requires immediate reporting.</li>
              <li>When the dispute action is enabled, select <strong className="text-slate-100">Open Dispute / Raise Issue</strong> for a marketplace order, or <strong className="text-slate-100">Open Dispute</strong> for an eligible P2P order.</li>
              <li>Explain the issue factually and attach requested proof. Marketplace disputes require an image proof in the order flow. For gift-card P2P, preserve original receipts and follow any additional evidence instructions displayed in the dispute channel.</li>
              <li>Submit once and monitor the same order page for responses or requests for evidence. Do not open duplicate claims, alter evidence, or release escrow while a dispute is pending unless the platform’s resolution instructions require it.</li>
            </ol>
            <p>
              For general account or technical questions that are not a transaction dispute, use the{' '}
              <Link href="/support/ticket" className="text-indigo-300 hover:underline">support ticket form</Link>.
              Include the relevant order ID, dates, and screenshots, but never include passwords, private keys,
              or recovery phrases.
            </p>
          </GuideSection>

          <GuideSection id="fees-security" title="8. Fees, confirmations, and account safety">
            <ul className="list-disc space-y-2 pl-5">
              <li>Applicable marketplace, conversion, and withdrawal fees are shown in the relevant flow or fee schedule. Confirm them before accepting or submitting.</li>
              <li>Crypto transfers require blockchain confirmation. Required confirmation counts and review times vary by network and transaction risk; a displayed pending status is not a completed credit.</li>
              <li>Never share passwords, one-time codes, private keys, seed phrases, or remote-access control. VouchNode staff will not ask you to disable security protections or trade outside the platform.</li>
              <li>Report suspicious requests through the order dispute controls or the general ticket form. Include evidence and preserve original messages.</li>
              <li>For the terms governing trading, custody, fees, and platform risk, read the <Link href="/terms" className="text-indigo-300 hover:underline">Terms &amp; Privacy</Link> page.</li>
            </ul>
          </GuideSection>
        </div>
        <div className="mt-8 rounded-2xl border border-indigo-400/20 bg-indigo-500/5 p-6 text-sm leading-7 text-slate-300">
          Could not resolve your issue? <Link href="/support/ticket" className="font-semibold text-indigo-300 hover:underline">Contact Support</Link> and include the order ID when relevant.
        </div>
      </div>
    </main>
  );
}
