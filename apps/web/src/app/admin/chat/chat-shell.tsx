'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { ConversacionesSidebar } from './conversaciones-sidebar';
import { PanelConversacion } from './panel-conversacion';
import { NuevoChatButton } from './nuevo-chat-modal';

/**
 * Sprint Chat interno — shell cliente que mantiene la conversación
 * activa en estado y orquesta sidebar + panel. Cada subcomponente hace
 * su propio polling con SWR.
 */
export function ChatShell({ initialConversacionId }: { initialConversacionId: string | null }) {
  const [activa, setActiva] = useState<string | null>(initialConversacionId);

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-slate-900">
            <MessageSquare className="h-6 w-6 text-brand-blue" />
            Chat interno
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Mensajería entre staff y aliados. Polling cada ~12 s.
          </p>
        </div>
        <NuevoChatButton
          onCreado={(id) => {
            setActiva(id);
          }}
        />
      </header>

      <div className="flex flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <ConversacionesSidebar activaId={activa} onSelect={setActiva} />
        <div className="flex-1 border-l border-slate-200">
          {activa ? (
            <PanelConversacion key={activa} conversacionId={activa} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Selecciona una conversación o crea una nueva.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
