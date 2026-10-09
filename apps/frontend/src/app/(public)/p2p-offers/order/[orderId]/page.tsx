'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, LockKeyhole, MessageCircle, Paperclip, Send, ShieldCheck } from 'lucide-react';
import { p2pService, type P2POrderDetail } from '@/services/p2p.service';
import { OfferTerms } from '@/components/p2p/OfferTerms';
import { messageService } from '@/services/message.service';
import { useSocket } from '@/hooks/useSocket';
import { useAuth } from '@/hooks/useAuth';
import type { Message } from '@/types/api.types';

function RedDisputeBanner() {
  return (
    <div className="rounded-xl border-2 border-red-500/70 bg-red-950/80 p-5 text-sm leading-6 text-red-50 shadow-lg shadow-red-950/40">
      <p className="font-black tracking-wide">SYSTEM WARNING: DISPUTE OPENED (PENDING ADMIN INTERVENTION)</p>
      <p className="mt-3">
        An administrator will join this channel within 24 hours to deliver a final judgment.
        To protect your funds, both parties must submit concrete video and image proof from
        the beginning of the chat.
      </p>
      <p className="mt-4 font-bold">FOR THE BUYER (Gift Card Code Owner - Receiving USDT):</p>
      <ul className="list-disc pl-5">
        <li>Provide the original purchase invoice, official receipt, or acquisition log showing the card&apos;s validity and source.</li>
        <li>Upload additional screenshots confirming the card&apos;s legitimacy if requested by the moderator.</li>
      </ul>
      <p className="mt-4 font-bold">FOR THE MERCHANT (Crypto USDT Owner - Buying Gift Card):</p>
      <ul className="list-disc pl-5">
        <li>Upload a continuous, unedited video screen recording from the beginning of this chat session.</li>
        <li>Show copying the code from this chat, opening the official platform, and attempting redemption.</li>
        <li>Show the exact error received; static screenshots alone are not sufficient evidence.</li>
      </ul>
    </div>
  );
}

export default function P2POrderPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const { socket, isConnected } = useSocket('chat');
  const { user } = useAuth();
  const [order, setOrder] = useState<P2POrderDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showAttachmentOptions, setShowAttachmentOptions] = useState(false);
  const [attachmentVisibility, setAttachmentVisibility] = useState<'EVERYONE' | 'ADMIN_ONLY'>('EVERYONE');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSellerWarning, setShowSellerWarning] = useState(false);
  const [sellerWarningConfirmed, setSellerWarningConfirmed] = useState(false);
  const [showReleaseWarning, setShowReleaseWarning] = useState(false);
  const [disputeEnabled, setDisputeEnabled] = useState(false);
  const [disputeBusy, setDisputeBusy] = useState(false);
  const [reviewSentiment, setReviewSentiment] = useState<'POSITIVE' | 'NEGATIVE'>('POSITIVE');
  const [reviewContent, setReviewContent] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = typeof params.orderId === 'string' ? params.orderId : '';
    if (!id) return;
    void p2pService.getOrder(id)
      .then((loaded) => {
        setOrder(loaded);
        setReviewSubmitted(loaded.hasReviewed);
        setDisputeEnabled(loaded.disputeEnabled);
        setSecondsLeft(['PENDING_PAYMENT', 'UNPAID'].includes(loaded.status)
          ? Math.max(0, Math.floor((new Date(loaded.paymentDeadline).getTime() - Date.now()) / 1000))
          : loaded.paidVerificationDeadline
            ? Math.max(0, Math.floor((new Date(loaded.paidVerificationDeadline).getTime() - Date.now()) / 1000))
          : 0);
        if (loaded.conversationId) {
          void messageService.getMessages(loaded.conversationId)
            .then((history) => setMessages((current) => {
              const byId = new Map(current.map((message) => [message.id, message]));
              history.forEach((message) => byId.set(message.id, message));
              return Array.from(byId.values()).sort((left, right) =>
                new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
              );
            }))
            .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load chat messages.'));
        }
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load order.'));
  }, [params.orderId]);

  useEffect(() => {
    if (!order || !['PENDING_PAYMENT', 'UNPAID', 'PAID_PENDING_VERIFICATION', 'PENDING_VERIFICATION'].includes(order.status)) return;
    const deadline = ['PENDING_PAYMENT', 'UNPAID'].includes(order.status)
      ? order.paymentDeadline
      : order.paidVerificationDeadline;
    if (!deadline) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (['PAID_PENDING_VERIFICATION', 'PENDING_VERIFICATION'].includes(order.status) && remaining === 0) setDisputeEnabled(true);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [order]);

  useEffect(() => {
    if (!order?.conversationId || !socket || !isConnected) return;
    const conversationId = order.conversationId;
    const orderId = order.id;
    socket.emit('join_conversation', conversationId);
    socket.emit('join_p2p_order', orderId);
    const onPaid = (payload: { orderId: string; paidVerificationDeadline: string }) => {
      if (payload.orderId !== orderId) return;
      setOrder((current) => current ? { ...current, status: 'PAID_PENDING_VERIFICATION', paidAt: new Date().toISOString(), paidVerificationDeadline: payload.paidVerificationDeadline, disputeEnabled: false } : current);
      setDisputeEnabled(false);
    };
    const onDisputeEnabled = (payload: { orderId: string }) => {
      if (payload.orderId === orderId) setDisputeEnabled(true);
    };
    const onDisputeOpened = (payload: { orderId: string; status: 'DISPUTED' }) => {
      if (payload.orderId === orderId) {
        setDisputeEnabled(false);
        setOrder((current) => current ? { ...current, status: payload.status } : current);
      }
    };
    const onMessage = (message: Message) => {
      if (message.conversationId !== conversationId) return;
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      if (message.senderId === user?.id || typeof window === 'undefined' || !('AudioContext' in window)) return;
      try {
        const audioContext = new AudioContext();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1046, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(784, audioContext.currentTime + 0.12);
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.2);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.2);
        window.setTimeout(() => void audioContext.close(), 300);
      } catch {
        // Browser autoplay policies may require prior user interaction.
      }
    };
    socket.on('new_message', onMessage);
    socket.on('p2p_paid', onPaid);
    socket.on('p2p_dispute_enabled', onDisputeEnabled);
    socket.on('p2p_dispute_opened', onDisputeOpened);
    return () => {
      socket.emit('leave_conversation', conversationId);
      socket.emit('leave_p2p_order', orderId);
      socket.off('new_message', onMessage);
      socket.off('p2p_paid', onPaid);
      socket.off('p2p_dispute_enabled', onDisputeEnabled);
      socket.off('p2p_dispute_opened', onDisputeOpened);
    };
  }, [order?.conversationId, order?.id, socket, isConnected, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, order?.status]);

  useEffect(() => {
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.04;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.25);
      oscillator.addEventListener('ended', () => void context.close());
    } catch {
      // Browsers can reject audio until the user interacts with the page.
    }
  }, []);

  const countdown = useMemo(() => `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`, [secondsLeft]);

  const sendMessage = (event?: FormEvent) => {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || !order?.conversationId || !socket || !isConnected) return;
    socket.emit(
      'send_message',
      { conversationId: order.conversationId, content },
      (response: { ok: boolean; message?: Message; error?: string }) => {
        if (!response.ok) {
          setError(response.error || 'Failed to send message.');
          return;
        }
        // The server broadcasts to the room. This acknowledgement is a
        // fallback for a missed event and remains idempotent.
        if (response.message) {
          setMessages((current) => current.some((item) => item.id === response.message!.id)
            ? current
            : [...current, response.message!]);
        }
      },
    );
    setDraft('');
  };

  const attachMedia = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !order?.conversationId || !socket || !isConnected) return;
    const allowed = file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'video/mp4' || file.type === 'video/quicktime';
    if (!allowed || file.size > 50 * 1024 * 1024) {
      setError('Choose a PNG, JPG, MP4, or MOV file up to 50MB.');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await messageService.uploadEvidence(order.conversationId, file, attachmentVisibility);
      socket.emit(
        'send_message',
        {
          conversationId: order.conversationId,
          content: file.name,
          messageType: uploaded.messageType,
          fileUrl: uploaded.fileUrl,
          visibility: uploaded.visibility
        },
        (response: { ok: boolean; message?: Message; error?: string }) => {
          if (!response.ok) {
            setError(response.error || 'Failed to send attachment.');
            return;
          }
          if (response.message) {
            setMessages((current) => current.some((item) => item.id === response.message!.id)
              ? current
              : [...current, response.message!]);
          }
        },
      );
      setShowAttachmentOptions(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to upload media.');
    } finally {
      setUploading(false);
    }
  };

  const markPaid = async () => {
    if (!order || (order.tradeType === 'BUY' && !order.isBuyer) || (order.tradeType === 'SELL' && order.isBuyer) || !sellerWarningConfirmed) return;
    setBusy(true);
    try {
      const updatedOrder = await p2pService.markOrderPaid(order.id);
      setOrder(updatedOrder);
      setSecondsLeft(0);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to mark the order as paid.'); }
    finally {
      setBusy(false);
      setShowSellerWarning(false);
      setSellerWarningConfirmed(false);
    }
  };

  const cancel = async () => {
    if (!order) return;
    setBusy(true);
    try { await p2pService.cancelOrder(order.id); router.push('/p2p-offers'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to cancel the order.'); setBusy(false); }
  };

  const releaseCrypto = async () => {
    if (!order || (order.tradeType === 'SELL' ? !order.isBuyer : order.isBuyer)) return;
    setBusy(true);
    try { setOrder(await p2pService.releaseOrder(order.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to release escrow.'); }
    finally {
      setBusy(false);
      setShowReleaseWarning(false);
    }
  };

  const openDispute = async () => {
    if (!order || !disputeEnabled || disputeBusy) return;
    setDisputeBusy(true);
    try {
      await p2pService.openDispute(order.id, 'P2P payment verification dispute', 'The payment or gift card submission requires administrator review.');
      setDisputeEnabled(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to open dispute.');
    } finally {
      setDisputeBusy(false);
    }
  };

  const submitReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!order || !reviewContent.trim() || reviewSubmitted) return;
    setBusy(true);
    try {
      await p2pService.submitReview(order.id, { sentiment: reviewSentiment, content: reviewContent });
      setReviewSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to submit the review.');
    } finally {
      setBusy(false);
    }
  };

  if (!order) return <main className="min-h-screen bg-[#07090f] p-6 text-center text-slate-300">{error || 'Loading order...'}</main>;

  const currentUserId = user?.id;
  const canSendGiftCard = order.tradeType === 'SELL' ? !order.isBuyer : order.isBuyer;
  const canReleaseCrypto = order.tradeType === 'SELL' ? order.isBuyer : !order.isBuyer;
  const releaseReady = ['PAID_PENDING_VERIFICATION', 'PENDING_VERIFICATION', 'PAID', 'DISPUTED'].includes(order.status);

  return (
    <main className="min-h-screen bg-[#07090f] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-7xl">
        <Link href="/p2p-offers" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to P2P offers</Link>
        <header className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#11141d] p-5">
          <div><p className="text-sm text-slate-500">P2P Order</p><h1 className="text-xl font-black">{order.giftCardType} · {order.cryptoAmount.toFixed(8)} {order.cryptoAsset}</h1></div>
          <div className={`rounded-xl px-4 py-3 text-sm font-bold ${order.status === 'UNPAID' ? 'bg-amber-500/10 text-amber-300' : 'bg-blue-500/10 text-blue-300'}`}>
            {['PENDING_PAYMENT', 'UNPAID'].includes(order.status)
              ? `Pending Payment ${countdown}`
              : order.status === 'DISPUTED'
                ? 'Open Dispute'
              : order.status === 'COMPLETED'
                ? 'Completed'
                : order.status === 'CANCELLED'
                  ? 'Cancelled'
                  : 'Paid - Pending Verification'}
          </div>
        </header>
        <div className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <section className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-[#11141d] p-6">
              <h2 className="text-lg font-bold">Trade Information</h2>
              <dl className="mt-5 space-y-4 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Merchant</dt><dd>{order.sellerUsername}</dd></div>
                {order.pricingVersion >= 2 ? <>
                  <div className="flex justify-between"><dt className="text-slate-500">Gift Card Face Value</dt><dd>{order.giftCardValueUSD.toFixed(2)} USD</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Merchant Payout</dt><dd>{order.amountUSD.toFixed(2)} USD</dd></div>
                </> : <div className="flex justify-between"><dt className="text-slate-500">Historical USD Amount</dt><dd>{order.amountUSD.toFixed(2)} USD</dd></div>}
                <div className="flex justify-between"><dt className="text-slate-500">Escrow Amount</dt><dd className="text-emerald-300">{order.cryptoAmount.toFixed(({ USDT: 6, BTC: 8, ETH: 18, BNB: 18, SOL: 9, LTC: 8 } as const)[order.cryptoAsset as 'USDT' | 'BTC' | 'ETH' | 'BNB' | 'SOL' | 'LTC'] ?? 8)} {order.cryptoAsset}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd>{['PENDING_PAYMENT', 'UNPAID'].includes(order.status) ? 'Pending Payment' : ['PAID_PENDING_VERIFICATION', 'PENDING_VERIFICATION', 'PAID'].includes(order.status) ? 'Paid - Pending Verification' : order.status === 'DISPUTED' ? 'Open Dispute' : order.status}</dd></div>
              </dl>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-6">
              <h2 className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5 text-emerald-400" /> Tips</h2>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-300"><li>Please say Hi and confirm the payment method.</li><li>Only upload your card after the merchant replies.</li><li>Never share account passwords or unrelated personal information.</li></ol>
            </div>
            {order.terms && <div className="w-full max-w-full min-w-0 rounded-2xl border border-white/10 bg-[#11141d] p-6"><h2 className="font-bold">Terms of Trade</h2><OfferTerms className="mt-3" terms={order.terms} /></div>}
            {error && <p className="text-sm text-red-300">{error}</p>}
            {order.status === 'COMPLETED' ? (
              <form onSubmit={submitReview} className="rounded-2xl border border-blue-400/20 bg-blue-400/5 p-5">
                <h2 className="text-lg font-bold">Leave a review for the other party</h2>
                {reviewSubmitted ? (
                  <p className="mt-3 text-sm text-emerald-300">Your review has been submitted.</p>
                ) : (
                  <>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {(['POSITIVE', 'NEGATIVE'] as const).map((sentiment) => (
                        <button key={sentiment} type="button" onClick={() => setReviewSentiment(sentiment)} className={`rounded-xl border px-4 py-3 text-sm font-bold ${reviewSentiment === sentiment ? 'border-blue-400 bg-blue-400/20 text-blue-200' : 'border-white/10 text-slate-300'}`}>
                          {sentiment === 'POSITIVE' ? 'Positive' : 'Negative'}
                        </button>
                      ))}
                    </div>
                    <textarea value={reviewContent} onChange={(event) => setReviewContent(event.target.value)} placeholder="Write your feedback" rows={4} className="mt-4 w-full rounded-xl border border-white/10 bg-[#0b0d14] p-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400" required />
                    <button type="submit" disabled={busy || !reviewContent.trim()} className="mt-3 w-full rounded-xl bg-blue-500 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Submit Review</button>
                  </>
                )}
              </form>
            ) : (
              <div className="flex flex-wrap gap-3">
                {!['CANCELLED', 'COMPLETED'].includes(order.status) && (
                  (order.tradeType === 'SELL'
                    ? (!order.isBuyer || ['PENDING_PAYMENT', 'UNPAID'].includes(order.status))
                    : (order.isBuyer || ['PENDING_PAYMENT', 'UNPAID'].includes(order.status))) &&
                  <button type="button" onClick={() => void cancel()} disabled={busy} className="flex-1 rounded-xl border border-white/10 px-5 py-3 font-semibold hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
                )}
                {canSendGiftCard && ['PENDING_PAYMENT', 'UNPAID'].includes(order.status) && <button type="button" onClick={() => { setSellerWarningConfirmed(false); setShowSellerWarning(true); }} disabled={busy} className="flex-1 rounded-xl bg-blue-500 px-4 py-3 font-bold hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50">I Have Paid / Code Sent</button>}
                {canReleaseCrypto && !['CANCELLED', 'COMPLETED'].includes(order.status) && <button type="button" onClick={() => setShowReleaseWarning(true)} disabled={busy || !releaseReady} className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 font-bold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">Release Crypto</button>}
                {['PAID_PENDING_VERIFICATION', 'PENDING_VERIFICATION', 'PAID'].includes(order.status) && <button type="button" onClick={() => void openDispute()} disabled={!disputeEnabled || disputeBusy} className="flex-1 rounded-xl border border-amber-300/50 px-4 py-3 font-bold text-amber-200 disabled:cursor-not-allowed disabled:opacity-50">Open Dispute {secondsLeft > 0 && `(${countdown})`}</button>}
              </div>
            )}
          </section>
          <section className="flex h-[680px] max-h-[680px] min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#11141d]">
            <div className="flex items-center justify-between border-b border-white/10 p-5"><h2 className="flex items-center gap-2 font-bold"><MessageCircle className="h-5 w-5 text-emerald-400" /> Live Chat</h2><span className="text-xs text-slate-500">{isConnected ? 'Connected' : 'Connecting...'}</span></div>
            <div className="shrink-0 border-b border-white/10 p-5">
              <div className="rounded-xl border border-amber-300/25 bg-amber-300/5 px-4 py-3 text-center text-xs leading-5 text-amber-100">
                <LockKeyhole className="mx-auto mb-2 h-4 w-4 text-amber-300" aria-hidden="true" />
                <p>Do not worry, trade with peace of mind. This transaction is fully protected by our Escrow system, and funds have been successfully locked.</p>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
              {showSellerWarning && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                  <div className="w-full max-w-lg rounded-2xl border border-red-400/30 bg-[#11141d] p-6 shadow-2xl">
                    <h2 className="text-xl font-bold text-red-200">Code Submission Warning</h2>
                    <p className="mt-4 text-sm leading-6 text-slate-300">Clicking this button without sending a valid gift card code will result in a permanent account ban.</p>
                    <label className="mt-5 flex gap-3 text-sm text-slate-200"><input type="checkbox" checked={sellerWarningConfirmed} onChange={(event) => setSellerWarningConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-blue-500" />I confirm that I have sent a valid gift card code.</label>
                    <div className="mt-6 flex gap-3"><button type="button" onClick={() => setShowSellerWarning(false)} className="flex-1 rounded-xl border border-white/10 px-4 py-3 font-semibold text-slate-300">Cancel</button><button type="button" onClick={() => void markPaid()} disabled={!sellerWarningConfirmed || busy} className="flex-1 rounded-xl bg-blue-500 px-4 py-3 font-bold text-white disabled:opacity-50">I Have Paid / Code Sent</button></div>
                  </div>
                </div>
              )}
              {showReleaseWarning && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                  <div className="w-full max-w-lg rounded-2xl border border-amber-300/30 bg-[#11141d] p-6 shadow-2xl">
                    <h2 className="text-xl font-bold text-amber-100">Final Crypto Release</h2>
                    <p className="mt-4 text-sm leading-6 text-slate-300">Have you verified the valid gift card code and confirmed this trade? Releasing crypto is final and irreversible.</p>
                    <div className="mt-6 flex gap-3"><button type="button" onClick={() => setShowReleaseWarning(false)} className="flex-1 rounded-xl border border-white/10 px-4 py-3 font-semibold text-slate-300">Cancel</button><button type="button" onClick={() => void releaseCrypto()} disabled={busy} className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 font-bold text-slate-950 disabled:opacity-50">OK</button></div>
                  </div>
                </div>
              )}
              {order.status === 'DISPUTED' && <RedDisputeBanner />}
              {messages.length === 0 && <p className="text-sm text-slate-500">Start the conversation with the merchant.</p>}
              {messages.map((message) => {
                const isCurrentUser = Boolean(currentUserId && message.senderId === currentUserId);
                const senderRole = isCurrentUser
                  ? (order.isBuyer ? 'Buyer' : 'Seller')
                  : (order.isBuyer ? 'Seller' : 'Buyer');
                const senderName = senderRole === 'Buyer' ? order.buyerUsername : order.sellerUsername;
                return (
                  <div key={message.id} className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] ${isCurrentUser ? 'items-end' : 'items-start'}`}>
                      <p className={`mb-1 text-xs font-semibold ${isCurrentUser ? 'text-right text-blue-300' : 'text-left text-slate-400'}`}>
                        {senderName} ({senderRole})
                      </p>
                      <div className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${isCurrentUser ? 'rounded-br-md bg-blue-500 text-white' : 'rounded-bl-md bg-slate-700 text-slate-100'}`}>
                        {message.messageType === 'IMAGE' && message.fileUrl
                          ? <img src={message.fileUrl} alt={message.content || 'Attached evidence'} className="max-h-72 rounded-lg object-contain" />
                          : message.messageType === 'VIDEO' && message.fileUrl
                            ? <video src={message.fileUrl} controls preload="metadata" className="max-h-72 rounded-lg" />
                            : <p className="whitespace-pre-wrap">{message.content || message.text || ''}</p>}
                      </div>
                      <time className={`mt-1 block text-[11px] text-slate-500 ${isCurrentUser ? 'text-right' : 'text-left'}`}>
                        {new Date(message.createdAt).toLocaleTimeString()}
                      </time>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} aria-hidden="true" />
            </div>
            <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-white/10 p-4">
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,video/mp4,video/quicktime" onChange={(event) => void attachMedia(event)} className="hidden" />
              <div className="relative">
                {showAttachmentOptions && (
                  <div className="absolute bottom-14 left-0 z-20 w-56 rounded-xl border border-white/10 bg-[#1a1f2b] p-2 shadow-xl">
                    <button type="button" onClick={() => { setAttachmentVisibility('EVERYONE'); fileInputRef.current?.click(); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-100 hover:bg-white/10">Send to Everyone</button>
                    <button type="button" onClick={() => { setAttachmentVisibility('ADMIN_ONLY'); fileInputRef.current?.click(); }} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-amber-200 hover:bg-white/10">Send to Admin Only (Private Evidence)</button>
                  </div>
                )}
                <button type="button" onClick={() => setShowAttachmentOptions((visible) => !visible)} disabled={uploading || !isConnected} aria-label="Attach image or video" className="rounded-xl border border-white/10 p-3 text-slate-300 hover:bg-white/5 disabled:opacity-50"><Paperclip className="h-5 w-5" /></button>
              </div>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={uploading ? 'Uploading evidence...' : 'Type a message'} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0b0d14] px-4 py-3 text-sm outline-none focus:border-emerald-400" />
              <button type="submit" disabled={!draft.trim() || !isConnected} aria-label="Send message" className="rounded-xl bg-emerald-500 p-3 text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-5 w-5" /></button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
