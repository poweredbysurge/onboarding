import { Suspense } from 'react';
import AccessFlow from '@/components/surge/AccessFlow';

export const metadata = {
  title: 'Give us access to your accounts | The Surge Agency',
  description: 'A short guided walk through inviting The Surge Agency to your business accounts. No passwords.',
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://onboarding.thesurgeagency.com/access' },
};

export default function Page() {
  return (
    <Suspense fallback={<main className="bg-surge-bg min-h-screen" />}>
      <AccessFlow />
    </Suspense>
  );
}
