import { Suspense } from 'react';
import BookingFlow from '@/components/surge/BookingFlow';

export const metadata = {
  title: 'Book your onboarding call | The Surge Agency',
  description: 'Pick a time for your onboarding call with Sam and Mario at The Surge Agency.',
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://onboarding.thesurgeagency.com/book' },
};

export default function Page() {
  return (
    <Suspense fallback={<main className="bg-surge-bg min-h-screen" />}>
      <BookingFlow />
    </Suspense>
  );
}
