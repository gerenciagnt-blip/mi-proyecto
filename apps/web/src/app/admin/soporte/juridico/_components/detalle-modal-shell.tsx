'use client';

import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/dialog';

export function DetalleModalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Dialog open onClose={() => router.back()} size="xl">
      {children}
    </Dialog>
  );
}
