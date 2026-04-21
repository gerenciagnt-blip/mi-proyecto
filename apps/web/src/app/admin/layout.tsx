import { requireAdmin } from '@/lib/auth-helpers';
import { AdminShell } from '@/components/admin/admin-shell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <AdminShell userName={session.user.name} userRole={session.user.role}>
      {children}
    </AdminShell>
  );
}
