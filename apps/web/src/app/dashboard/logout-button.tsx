'use client';

import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logoutAction } from './actions';

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="outline" size={compact ? 'sm' : 'md'}>
        <LogOut className="h-4 w-4" />
        <span>Cerrar sesión</span>
      </Button>
    </form>
  );
}
