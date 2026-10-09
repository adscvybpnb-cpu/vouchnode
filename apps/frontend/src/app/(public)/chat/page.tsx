import { ConversationList } from '../../../components/chat/ConversationList';

export default function ChatPage({ searchParams }: { searchParams: { conversationId?: string } }) {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Messages</h1>
      <ConversationList initialConversationId={searchParams.conversationId} />
    </main>
  );
}
