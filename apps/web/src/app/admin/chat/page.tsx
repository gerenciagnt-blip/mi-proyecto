import { requirePermiso } from '@/lib/auth-helpers';
import { ChatShell } from './chat-shell';

export const metadata = { title: 'Chat interno — Sistema PILA' };
export const dynamic = 'force-dynamic';

/**
 * Sprint Chat interno — entrada principal de mensajería.
 *
 * Layout:
 *   ┌─────────────┬──────────────────────────┐
 *   │             │                          │
 *   │  Sidebar    │   Panel conversación     │
 *   │  (convs)    │                          │
 *   │             │   • Header               │
 *   │             │   • Mensajes (scroll)    │
 *   │             │   • Composer             │
 *   └─────────────┴──────────────────────────┘
 *
 * El polling se hace en el cliente con SWR (refreshInterval 12s para la
 * lista de conversaciones y 8s para los mensajes de la activa). El
 * acceso al módulo se controla con `requirePermiso('chat')`.
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ conv?: string }>;
}) {
  await requirePermiso('chat');
  const sp = await searchParams;
  return <ChatShell initialConversacionId={sp.conv ?? null} />;
}
