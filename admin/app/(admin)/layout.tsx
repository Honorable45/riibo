import { Suspense, type ReactNode } from 'react';
import { AdminGate } from '@/components/session';
import { Shell } from '@/components/shell';
import { LoadingRows } from '@/components/ui';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGate>
      <Shell>
        {/* Les pages lisent leurs filtres dans l'URL (useSearchParams). */}
        <Suspense fallback={<LoadingRows />}>{children}</Suspense>
      </Shell>
    </AdminGate>
  );
}
