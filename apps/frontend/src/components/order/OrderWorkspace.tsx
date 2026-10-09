'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileImage, MessageCircle, ShieldCheck, WalletCards, X } from 'lucide-react';
import { apiClient } from '@/services/api.client';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { orderService } from '@/services/order.service';
import { useAuthStore } from '@/store/auth.store';
import { useCountdown } from '@/hooks/useCountdown';
import { reviewService } from '@/services/review.service';
import { disputeService } from '@/services/dispute.service';
import { useSocket } from '@/hooks/useSocket';

type OrderStatus = 'CREATED' | 'PAYMENT_PENDING' | 'PENDING_MANUAL_REVIEW' | 'PAID' | 'DELIVERED' | 'WAITING_BUYER_CONFIRMATION' | 'DISPUTE_OPEN' | 'DISPUTED_WAITING_SELLER' | 'DISPUTED_WAITING_BUYER' | 'ESCALATED_TO_ADMIN' | 'COMPLETED' | 'REFUNDED' | 'CANCELLED' | 'EXPIRED';

interface OrderDetails {
  id: string;
  buyerId: string;
  sellerId: string;
  orderNumber?: string;
  createdAt: string;
  status: OrderStatus;
  escrowDeadline?: string | null;
  buyerConfirmationDeadline?: string | null;
  sellerResponseDeadline?: string | null;
  buyerReviewDeadline?: string | null;
  isEscalated?: boolean;
  quantity: number;
  unitPrice: string | number;
  totalAmount: string | number;
  platformFee: string | number;
  sellerAmount: string | number;
  currency: string;
  digitalCodes?: string[];
  conversation?: { id: string } | null;
  dispute?: { createdAt?: string; sellerResponseDeadline?: string | null } | null;
  product?: { name?: string; deliveryType?: 'INSTANT' | 'MANUAL'; images?: Array<{ url: string; altText?: string | null }> };
  seller?: { id?: string; profile?: { displayName?: string; username?: string } };
  buyer?: { id?: string; profile?: { displayName?: string; username?: string } };
  review?: { id: string; rating: number; content?: string | null; createdAt: string } | null;
}

const money = (value: string | number, currency: string) => `${Number(value).toFixed(2)} ${currency}`;

export function OrderWorkspace({ orderId }: { orderId: string }) {
  const loggedInUser = useAuthStore((state) => state.user);
  const { socket, isConnected } = useSocket('/chat');
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAcknowledged, setConfirmAcknowledged] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeDescription, setDisputeDescription] = useState('');
  const [disputeProof, setDisputeProof] = useState<File | null>(null);
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [sellerHasReplied, setSellerHasReplied] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'>('POSITIVE');
  const [feedbackContent, setFeedbackContent] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [sellerResponse, setSellerResponse] = useState('');
  const [sellerResponseSubmitting, setSellerResponseSubmitting] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const orderLoadRequestRef = useRef(0);
  const countdownDeadline = order?.status === 'DISPUTE_OPEN' || order?.status === 'DISPUTED_WAITING_SELLER'
    ? order.sellerResponseDeadline
    : order?.status === 'DISPUTED_WAITING_BUYER'
      ? order.buyerReviewDeadline
      : order?.status === 'ESCALATED_TO_ADMIN'
        ? null
        : order?.escrowDeadline || order?.buyerConfirmationDeadline || null;
  const countdown = useCountdown(countdownDeadline || null);
  const confirmationExpired = ['PAID', 'WAITING_BUYER_CONFIRMATION'].includes(order?.status ?? '') && countdown.expired;
  const handleChatMessage = useCallback((message: { senderId: string; createdAt?: string }) => {
    const disputeStartedAt = order?.dispute?.createdAt ? new Date(order.dispute.createdAt).getTime() : 0;
    const messageCreatedAt = message.createdAt ? new Date(message.createdAt).getTime() : 0;
    if (order?.sellerId && message.senderId === order.sellerId && messageCreatedAt > disputeStartedAt) {
      setSellerHasReplied(true);
    }
  }, [order?.dispute?.createdAt, order?.sellerId]);
  const handleOrderUpdate = useCallback((update: { status: string; buyerReviewDeadline?: string | null }) => {
    setOrder((current) => {
      if (current && update.status === 'COMPLETED' && current.buyerId === loggedInUser?.id && !current.review) {
        setFeedbackModalOpen(true);
      }
      return current ? {
      ...current,
      status: update.status as OrderStatus,
      buyerReviewDeadline: update.buyerReviewDeadline ?? current.buyerReviewDeadline,
      sellerResponseDeadline: update.status === 'DISPUTED_WAITING_BUYER' ? null : current.sellerResponseDeadline,
      } : current;
    });
  }, [loggedInUser?.id]);

  useEffect(() => {
    let active = true;
    const requestId = ++orderLoadRequestRef.current;
    void apiClient.get<OrderDetails>(`/orders/${orderId}`).then((response) => {
      if (!active) return;
      if (requestId !== orderLoadRequestRef.current) return;
      if (response.error || !response.data) setError(response.error || 'Unable to load this order.');
      else setOrder(response.data);
      setLoading(false);
    });
    return () => { active = false; };
  }, [orderId]);

  useEffect(() => {
    if (!socket || !isConnected) return;

    const refreshOrder = async () => {
      const requestId = ++orderLoadRequestRef.current;
      try {
        const response = await apiClient.get<OrderDetails>(`/orders/${orderId}`);
        if (requestId !== orderLoadRequestRef.current) return;
        if (response.error || !response.data) {
          setError(response.error || 'Unable to refresh this order.');
        } else {
          setOrder(response.data);
          setError('');
        }
      } catch (refreshError) {
        if (requestId === orderLoadRequestRef.current) {
          setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh this order.');
        }
      } finally {
        if (requestId === orderLoadRequestRef.current) setLoading(false);
      }
    };
    const handleOrderUpdate = (update: { orderId?: string; status?: string }) => {
      if (update.orderId !== orderId || update.status !== 'PAID') return;
      void refreshOrder();
      setOrder((current) => current && ['PAYMENT_PENDING', 'PENDING_MANUAL_REVIEW'].includes(current.status)
        ? { ...current, status: 'PAID' }
        : current);
    };

    socket.on('order_updated', handleOrderUpdate);
    socket.emit('join_order', orderId, (response: { ok: boolean }) => {
      if (response.ok) void refreshOrder();
    });

    return () => {
      socket.emit('leave_order', orderId);
      socket.off('order_updated', handleOrderUpdate);
    };
  }, [isConnected, orderId, socket]);

  const confirmDelivery = async () => {
    if (!order || loggedInUser?.id !== order.buyerId || confirming || !confirmAcknowledged) return;
    setConfirming(true);
    try {
      const confirmed = await orderService.confirmOrder(order.id);
      setOrder({ ...order, ...confirmed, status: confirmed.status as OrderStatus });
      if (!order.review) setFeedbackModalOpen(true);
      setConfirmModalOpen(false);
      setConfirmAcknowledged(false);
      setError('');
    } catch (confirmationError) {
      setError(confirmationError instanceof Error ? confirmationError.message : 'Unable to confirm delivery.');
    } finally {
      setConfirming(false);
    }
  };

  const submitDispute = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!order || loggedInUser?.id !== order.buyerId || disputeSubmitting) return;
    if (!disputeDescription.trim()) {
      setError('Please describe the issue before submitting the dispute.');
      return;
    }
    if (!disputeProof || !disputeProof.type.startsWith('image/')) {
      setError('A proof image is required to submit a dispute.');
      return;
    }
    setDisputeSubmitting(true);
    try {
      const disputed = await orderService.escalateDispute(order.id, disputeDescription.trim(), disputeProof);
      setOrder({
        ...order,
        status: 'DISPUTE_OPEN',
        sellerResponseDeadline: disputed.sellerResponseDeadline,
        buyerReviewDeadline: null,
        buyerConfirmationDeadline: null,
        isEscalated: false,
      });
      setDisputeOpen(false);
      setDisputeDescription('');
      setDisputeProof(null);
      if (proofInputRef.current) proofInputRef.current.value = '';
      setError('');
    } catch (disputeError) {
      setError(disputeError instanceof Error ? disputeError.message : 'Unable to open dispute.');
    } finally {
      setDisputeSubmitting(false);
    }
  };

  const submitFeedback = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!order || loggedInUser?.id !== order.buyerId || feedbackSubmitting) return;
    setFeedbackSubmitting(true);
    try {
      const review = await reviewService.submitFeedback(order.id, feedbackType, feedbackContent);
      setOrder({ ...order, review });
      setFeedbackContent('');
      setFeedbackModalOpen(false);
      setError('');
    } catch (feedbackError) {
      setError(feedbackError instanceof Error ? feedbackError.message : 'Unable to submit feedback.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const submitSellerResponse = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!order || !sellerResponse.trim() || sellerResponseSubmitting) return;
    setSellerResponseSubmitting(true);
    try {
      const updated = await disputeService.respondToOrderDispute(order.id, sellerResponse.trim());
      setOrder({ ...order, status: 'DISPUTED_WAITING_BUYER', buyerReviewDeadline: updated.buyerResponseDeadline });
      setSellerResponse('');
      setError('');
    } catch (responseError) {
      setError(responseError instanceof Error ? responseError.message : 'Unable to submit dispute response.');
    } finally {
      setSellerResponseSubmitting(false);
    }
  };

  const issueSellerRefund = async () => {
    if (!order || !isSeller || sellerResponseSubmitting) return;
    setSellerResponseSubmitting(true);
    try {
      const refunded = await orderService.refundDisputedOrder(order.id);
      setOrder({ ...order, status: 'CANCELLED', sellerResponseDeadline: null, buyerReviewDeadline: null, isEscalated: false });
      setError('');
    } catch (refundError) {
      setError(refundError instanceof Error ? refundError.message : 'Unable to issue the refund.');
    } finally {
      setSellerResponseSubmitting(false);
    }
  };

  if (loading) return <div className="mx-auto max-w-6xl px-4 py-20 text-center text-slate-400">Loading order details...</div>;
  if (!order) return <div className="mx-auto max-w-6xl px-4 py-20 text-center text-rose-300">{error || 'Order not found.'}</div>;

  const codes = order.digitalCodes || [];
  const isBuyer = loggedInUser?.id === order.buyerId;
  const isSeller = loggedInUser?.id === order.sellerId;
  if (!isBuyer && !isSeller) {
    return <div className="mx-auto max-w-6xl px-4 py-20 text-center text-rose-300">You are not authorized to view this order.</div>;
  }
  const sellerName = order.seller?.profile?.displayName || order.seller?.profile?.username || 'Seller';
  const buyerName = order.buyer?.profile?.displayName || order.buyer?.profile?.username || 'Buyer';
  const date = new Date(order.createdAt).toLocaleString();
  const isSellerDisputeStage = order.status === 'DISPUTE_OPEN' || order.status === 'DISPUTED_WAITING_SELLER';
  const isBuyerDisputeStage = order.status === 'DISPUTED_WAITING_BUYER';
  const isEscalated = order.status === 'ESCALATED_TO_ADMIN' || order.isEscalated;
  const isFinalized = ['COMPLETED', 'REFUNDED', 'CANCELLED'].includes(order.status);
  const isEscrowActive = ['PAID', 'DELIVERED', 'WAITING_BUYER_CONFIRMATION', 'DISPUTE_OPEN',
    'DISPUTED_WAITING_SELLER', 'DISPUTED_WAITING_BUYER', 'ESCALATED_TO_ADMIN'].includes(order.status);
  const displayStatus = confirmationExpired ? 'COMPLETED' : order.status;
  const countdownText = isSellerDisputeStage
    ? isSeller
      ? 'You must respond by sending a chat message/evidence or Cancel Order, otherwise the order will auto-cancel.'
      : 'The seller must respond by sending a chat message/evidence or Cancel Order, otherwise the order will auto-cancel.'
    : isBuyerDisputeStage
      ? 'You must Escalate to Support or Confirm Delivery before this deadline.'
      : isBuyer
        ? 'Confirm the order or open a dispute before the timer expires.'
        : 'Funds will automatically release if the buyer takes no action before the timer expires.';
  return (
    <div className="min-h-[calc(100vh-8rem)] bg-[#0A0A0F] px-4 py-6 text-white sm:px-6 lg:py-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex flex-col justify-between gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-indigo-300">Order status</p>
            <p className="mt-2 text-sm text-slate-400">Order {order.orderNumber || order.id}</p>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 sm:self-auto">
            <CheckCircle2 className="h-4 w-4" /> {displayStatus.replaceAll('_', ' ')}
          </div>
        </header>

        {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}

        <div className="grid items-start gap-4">
          <div className="space-y-4">
            <section className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#12141d] p-3 shadow-lg shadow-black/20 sm:flex-row sm:items-center sm:gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-black/30 sm:h-24 sm:w-24">
                {order.product?.images?.[0]?.url ? <img src={order.product.images[0].url} alt={order.product.images[0].altText || order.product.name || 'Purchased product'} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-slate-500">No image</div>}
              </div>
              <div className="min-w-0"><h1 className="truncate text-lg font-bold tracking-tight text-white sm:text-xl">{order.product?.name || 'Digital item'}</h1><p className="mt-1 text-xs text-slate-400">Quantity {order.quantity} · {order.product?.deliveryType === 'INSTANT' ? 'Instant delivery' : 'Seller delivery'}</p></div>
            </section>
            <section className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-emerald-400" /><div><h2 className="text-sm font-semibold">Instant delivery secured</h2><p className="text-xs text-slate-400">Protected by VouchNode escrow.</p></div></div>
              <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-400/20 px-3 py-2"><span className="text-xs uppercase tracking-wider text-slate-500">Order status</span><span className="text-sm font-semibold text-emerald-300">{displayStatus.replaceAll('_', ' ')}</span></div>
            </section>
            <section className="rounded-2xl border border-white/10 bg-[#12141d] p-6">
              <div className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-indigo-300" /><h2 className="text-lg font-semibold">{isBuyer ? 'MESSAGES TO SELLER' : 'MESSAGES TO BUYER'}</h2></div>
              <p className="mt-1 text-sm text-slate-400">Secure conversation with {isBuyer ? sellerName : buyerName}, permanently saved to this order.</p>
              <div className="mt-5">{order.conversation?.id ? <ChatWindow conversationId={order.conversation.id} orderId={order.id} recipientId={isBuyer ? order.sellerId : order.buyerId} recipientName={isBuyer ? sellerName : buyerName} deliveryCodes={isBuyer ? codes : []} onMessage={handleChatMessage} onOrderUpdate={handleOrderUpdate} /> : <p className="rounded-xl border border-white/10 p-5 text-sm text-slate-400">Chat is being prepared. Please refresh shortly.</p>}</div>
              <div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><FileImage className="h-4 w-4" /> Attach a photo from the chat composer.</div>
            </section>
            {countdownDeadline && !isEscalated && <section className={`rounded-xl border p-4 ${isSellerDisputeStage || isBuyerDisputeStage ? 'border-rose-400/30 bg-rose-500/10' : 'border-amber-400/30 bg-amber-500/10'}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className={`text-xs font-bold uppercase tracking-wider ${isSellerDisputeStage || isBuyerDisputeStage ? 'text-rose-300' : 'text-amber-300'}`}>{isSellerDisputeStage ? 'Seller response deadline' : isBuyerDisputeStage ? 'Buyer review deadline' : '48-hour escrow confirmation window'}</p>
                  <p className="mt-1 text-sm text-slate-200">{countdownText}</p>
                </div>
                <div className={`font-mono text-2xl font-bold ${countdown.urgency === 'critical' ? 'text-rose-300' : countdown.urgency === 'warning' ? 'text-amber-300' : 'text-white'}`}>
                  {countdown.expired ? 'EXPIRED' : `${String(countdown.days * 24 + countdown.hours).padStart(2, '0')}:${String(countdown.minutes).padStart(2, '0')}:${String(countdown.seconds).padStart(2, '0')}`}
                </div>
              </div>
            </section>}
            {isSeller && !isFinalized && <section className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6">
              {isSellerDisputeStage && <>
                <p className="mt-1 text-sm text-slate-400">Submit your response or evidence within the 48-hour window.</p>
                <form onSubmit={submitSellerResponse} className="mt-5 space-y-4">
                  <textarea value={sellerResponse} onChange={(event) => setSellerResponse(event.target.value)} maxLength={4000} rows={5} required placeholder="Explain your response to the buyer's dispute" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-rose-300" />
                  <button type="submit" disabled={sellerResponseSubmitting} className="rounded-xl bg-rose-500 px-5 py-3 font-semibold text-white hover:bg-rose-400 disabled:opacity-60">{sellerResponseSubmitting ? 'Submitting...' : 'Submit response'}</button>
                </form>
              </>}
              <button type="button" onClick={() => void issueSellerRefund()} disabled={sellerResponseSubmitting} className="mt-4 rounded-xl border border-white/20 bg-black px-5 py-3 font-semibold text-white hover:bg-black/80 disabled:opacity-60">{sellerResponseSubmitting ? 'Processing...' : 'Cancel Order'}</button>
            </section>}
            {isBuyer && displayStatus === 'COMPLETED' && !order.review && <section className="rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-6">
              <h2 className="text-lg font-semibold text-white">Leave feedback for the seller</h2>
              <p className="mt-1 text-sm text-slate-400">How was your experience with this order?</p>
              <form onSubmit={submitFeedback} className="mt-5 space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  {(['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as const).map((type) => (
                    <label key={type} className={`cursor-pointer rounded-xl border px-4 py-3 text-center text-sm font-semibold transition-colors ${feedbackType === type ? 'border-indigo-300 bg-indigo-500/30 text-white' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}>
                      <input type="radio" name="feedbackType" value={type} checked={feedbackType === type} onChange={() => setFeedbackType(type)} className="sr-only" />
                      {type === 'POSITIVE' ? 'Positive' : type === 'NEUTRAL' ? 'Neutral' : 'Negative'}
                    </label>
                  ))}
                </div>
                <textarea value={feedbackContent} onChange={(event) => setFeedbackContent(event.target.value)} maxLength={2000} rows={4} placeholder="Share a few words about your experience (optional)" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-300" />
                <button type="submit" disabled={feedbackSubmitting} className="rounded-xl bg-indigo-500 px-5 py-3 font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-60">{feedbackSubmitting ? 'Submitting...' : 'Submit feedback'}</button>
              </form>
            </section>}
            {isBuyer && displayStatus === 'COMPLETED' && order.review && <section className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-6">
              <h2 className="text-lg font-semibold text-emerald-200">Feedback submitted</h2>
              <p className="mt-1 text-sm text-slate-300">{order.review.content || 'Thank you for rating this seller.'}</p>
            </section>}
            {isBuyer && isEscrowActive && !isFinalized && <div className="grid gap-3 sm:grid-cols-2">
              {(!isBuyerDisputeStage && !isSellerDisputeStage || isBuyerDisputeStage) && <button type="button" onClick={() => { setConfirmAcknowledged(false); setConfirmModalOpen(true); }} disabled={confirming || isSellerDisputeStage} className="rounded-xl border border-emerald-300/30 bg-emerald-500 px-5 py-3 font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-60">Confirm Delivery</button>}
              {isBuyerDisputeStage || (isBuyer && isSellerDisputeStage) ? <button type="button" disabled={!isBuyerDisputeStage} onClick={async () => { try { await orderService.escalateDisputeToAdmin(order.id); setOrder({ ...order, status: 'ESCALATED_TO_ADMIN', isEscalated: true }); } catch (escalationError) { setError(escalationError instanceof Error ? escalationError.message : 'Unable to escalate dispute.'); } }} className="rounded-xl border border-rose-300/30 bg-rose-500/10 px-5 py-3 font-semibold text-rose-200 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40">Escalate Dispute</button> : !isSellerDisputeStage && !isEscalated ? <button type="button" onClick={() => setDisputeOpen((open) => !open)} className="rounded-xl border border-rose-300/30 bg-rose-500/10 px-5 py-3 font-semibold text-rose-200 transition-colors hover:bg-rose-500/20">Open Dispute / Raise Issue</button> : null}
            </div>}
            {isBuyer && !isSellerDisputeStage && !isBuyerDisputeStage && !isEscalated && disputeOpen && <form onSubmit={submitDispute} className="space-y-4 rounded-2xl border border-rose-400/20 bg-rose-500/5 p-5">
              <label className="block text-sm font-medium text-slate-200">Describe the issue
                <textarea required rows={4} value={disputeDescription} onChange={(event) => setDisputeDescription(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 p-3 text-white outline-none focus:border-rose-400" />
              </label>
              <div>
                <label htmlFor="dispute-proof-image" className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-rose-300/40 bg-slate-900 px-4 py-3 text-sm font-medium text-rose-200 transition-colors hover:bg-slate-800">
                  <FileImage className="h-4 w-4" />
                  {disputeProof ? disputeProof.name : 'Attach proof image (required)'}
                </label>
                <input ref={proofInputRef} id="dispute-proof-image" type="file" accept="image/*" required onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setDisputeProof(file && file.type.startsWith('image/') ? file : null);
                  if (file && !file.type.startsWith('image/')) setError('Please attach an image file as proof.');
                }} className="sr-only" />
              </div>
              <button type="submit" disabled={disputeSubmitting || !disputeProof} className="rounded-xl bg-rose-500 px-4 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{disputeSubmitting ? 'Submitting...' : 'Submit Dispute'}</button>
            </form>}
          </div>
          <aside className="space-y-4">
            <section className="rounded-2xl border border-white/10 bg-[#12141d] p-6">
              <div className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-indigo-300" /><h2 className="text-lg font-semibold">ORDER DETAILS</h2></div>
              <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><tbody className="divide-y divide-white/10">
                <tr><th className="py-3 font-medium text-slate-500">ORDER ID</th><td className="break-all py-3 pl-4 font-mono text-slate-200">{order.id}</td></tr>
                <tr><th className="py-3 font-medium text-slate-500">DATE</th><td className="py-3 pl-4 text-slate-200">{date}</td></tr>
                <tr><th className="py-3 font-medium text-slate-500">PRICE</th><td className="py-3 pl-4 text-slate-200">{money(order.totalAmount, order.currency)}</td></tr>
                {isSeller && <><tr><th className="py-3 font-medium text-slate-500">COMMISSION</th><td className="py-3 pl-4 text-slate-200">{money(order.platformFee, order.currency)}</td></tr><tr><th className="py-3 font-medium text-slate-500">YOU MAKE</th><td className="py-3 pl-4 font-semibold text-emerald-300">{money(order.sellerAmount, order.currency)}</td></tr></>}
              </tbody></table></div>
            </section>
            <section aria-label="48-hour escrow countdown" className={`rounded-xl border p-4 ${countdown.urgency === 'critical' ? 'border-rose-400/40 bg-rose-500/10' : 'border-amber-400/30 bg-amber-500/10'}`}>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-300">48-hour escrow countdown</p>
              <p className="mt-1 text-sm text-slate-200">{countdownText}</p>
              <p className={`mt-3 text-center font-mono text-2xl font-bold ${countdown.urgency === 'critical' ? 'text-rose-300' : countdown.urgency === 'warning' ? 'text-amber-300' : 'text-white'}`}>
                {countdown.expired ? 'EXPIRED' : `${String(countdown.days * 24 + countdown.hours).padStart(2, '0')}:${String(countdown.minutes).padStart(2, '0')}:${String(countdown.seconds).padStart(2, '0')}`}
              </p>
            </section>
          </aside>
        </div>

        {isBuyer && feedbackModalOpen && !order.review && <div role="dialog" aria-modal="true" aria-labelledby="feedback-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
          <form onSubmit={submitFeedback} className="w-full max-w-md rounded-2xl border border-indigo-300/30 bg-[#12141d] p-6 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between"><h2 id="feedback-title" className="text-xl font-bold text-white">Rate your purchase</h2><button type="button" onClick={() => setFeedbackModalOpen(false)} aria-label="Close rating form" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button></div>
            <p className="mt-3 text-sm leading-6 text-slate-300">Your order is complete. How was your experience with this seller?</p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {(['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as const).map((type) => (
                <label key={type} className={`cursor-pointer rounded-xl border px-3 py-3 text-center text-sm font-semibold ${feedbackType === type ? 'border-indigo-300 bg-indigo-500/30 text-white' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}>
                  <input type="radio" name="feedbackModalType" value={type} checked={feedbackType === type} onChange={() => setFeedbackType(type)} className="sr-only" />
                  {type.charAt(0) + type.slice(1).toLowerCase()}
                </label>
              ))}
            </div>
            <textarea value={feedbackContent} onChange={(event) => setFeedbackContent(event.target.value)} maxLength={2000} rows={4} placeholder="Optional review" className="mt-5 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-300" />
            <button type="submit" disabled={feedbackSubmitting} className="mt-5 w-full rounded-xl bg-indigo-500 px-5 py-3 font-semibold text-white hover:bg-indigo-400 disabled:opacity-60">{feedbackSubmitting ? 'Submitting...' : 'Submit rating'}</button>
          </form>
        </div>}
        {isBuyer && confirmModalOpen && <div role="dialog" aria-modal="true" aria-labelledby="confirm-delivery-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-300/30 bg-[#12141d] p-6 shadow-2xl shadow-black/50">
            <h2 id="confirm-delivery-title" className="text-xl font-bold text-white">Release funds to seller?</h2>
            <p className="mt-3 text-sm leading-6 text-amber-100">Confirming delivery releases your funds to the seller. This action is irreversible once the escrow transaction is completed.</p>
            <label className="mt-6 flex cursor-pointer items-start gap-3 text-sm text-slate-200">
              <input type="checkbox" checked={confirmAcknowledged} onChange={(event) => setConfirmAcknowledged(event.target.checked)} className="mt-1 h-4 w-4 accent-emerald-500" />
              <span>I understand that confirming delivery releases the funds irreversibly.</span>
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => { setConfirmModalOpen(false); setConfirmAcknowledged(false); }} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/10">Cancel</button>
              <button type="button" onClick={() => void confirmDelivery()} disabled={!confirmAcknowledged || confirming} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">{confirming ? 'Confirming...' : 'Confirm Delivery'}</button>
            </div>
          </div>
        </div>}
      </div>
    </div>
  );
}
